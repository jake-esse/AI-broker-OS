#!/usr/bin/env python3
# --------------------------- imap_email_service.py ----------------------------
"""
AI-Broker MVP · IMAP Email Polling Service (Python Background Service)

OVERVIEW:
This service provides IMAP email monitoring for providers that don't support
real-time webhooks (Yahoo, custom domains, generic IMAP servers). It polls
connected email accounts periodically to detect new freight load requests and
integrates with the existing LangGraph intake workflow.

WORKFLOW:
1. Periodically poll IMAP accounts for new messages
2. Filter and classify emails based on broker preferences
3. Extract email content and metadata for processing
4. Trigger the existing src/agents/intake/graph.py workflow
5. Update processing logs and handle errors gracefully

BUSINESS LOGIC:
- Supports OAuth 2.0 and app password authentication
- Configurable polling intervals per account
- Smart filtering to reduce unnecessary processing
- Integration with existing complexity detection and missing info handling
- Multi-tenant support with proper isolation

TECHNICAL ARCHITECTURE:
- Async/await for concurrent IMAP connections
- Connection pooling and error recovery
- Secure credential management via Supabase
- Integration with existing database schema
- Comprehensive logging and monitoring

DEPENDENCIES:
- Python packages: aioimaplib, asyncio, supabase, email, dateutil
- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
- Email account credentials stored securely in database
"""

import asyncio
import email
import json
import logging
import os
import ssl
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from email.header import decode_header
from email.utils import parsedate_tz, mktime_tz

import aioimaplib
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# ===============================================================================
# CONFIGURATION AND TYPES
# ===============================================================================

@dataclass
class IMAPConfig:
    """IMAP connection configuration for an email account"""
    host: str
    port: int
    use_tls: bool
    username: str
    password: str  # OAuth token or app password
    monitor_folders: List[str]
    
@dataclass
class EmailMessage:
    """Structured email message data"""
    message_id: str
    uid: str
    subject: str
    sender: str
    recipients: List[str]
    date: datetime
    body_text: str
    body_html: str
    headers: Dict[str, str]
    folder: str

@dataclass
class ProcessingResult:
    """Email processing result"""
    success: bool
    message_id: str
    classification: Optional[str] = None
    load_id: Optional[str] = None
    error: Optional[str] = None
    confidence: Optional[float] = None

# ===============================================================================
# IMAP EMAIL CLIENT
# ===============================================================================

class IMAPEmailClient:
    """
    Async IMAP client for email monitoring and processing.
    
    BUSINESS CONTEXT:
    This client handles email accounts from providers that don't support
    real-time webhooks, ensuring that freight brokers can connect any
    email account to the AI-Broker system regardless of provider.
    
    ARCHITECTURE ROLE:
    Acts as the email collection layer for IMAP-based accounts, feeding
    emails into the same processing pipeline used by webhook-based providers.
    
    KEY METHODS:
    - connect(): Establish secure IMAP connection
    - fetch_new_messages(): Get unprocessed emails
    - mark_as_processed(): Update message flags to prevent reprocessing
    - close(): Clean up connections and resources
    
    USAGE PATTERNS:
    Typically runs as a background service, processing multiple accounts
    concurrently with configurable polling intervals.
    """
    
    def __init__(self, config: IMAPConfig):
        """
        Initialize IMAP client with connection configuration.
        
        BUSINESS LOGIC:
        Sets up secure IMAP connection parameters and prepares for
        email monitoring based on broker's account settings.
        """
        self.config = config
        self.client: Optional[aioimaplib.IMAP4_SSL] = None
        self.logger = logging.getLogger(f"imap.{config.host}")
    
    async def connect(self) -> bool:
        """
        Establish secure IMAP connection to email server.
        
        BUSINESS LOGIC:
        Creates authenticated connection to broker's email account using
        OAuth tokens or app passwords, enabling automated email access.
        
        TECHNICAL APPROACH:
        Uses SSL/TLS encryption and handles various authentication methods
        based on provider capabilities and security requirements.
        
        RETURNS:
            True if connection successful, False otherwise
        """
        try:
            # Create SSL context for secure connection
            ssl_context = ssl.create_default_context()
            
            if self.config.use_tls:
                self.client = aioimaplib.IMAP4_SSL(
                    host=self.config.host,
                    port=self.config.port,
                    ssl_context=ssl_context
                )
            else:
                self.client = aioimaplib.IMAP4(
                    host=self.config.host,
                    port=self.config.port
                )
            
            # Establish connection
            await self.client.wait_hello_from_server()
            
            # Authenticate with server
            # BUSINESS RULE: Support both OAuth and traditional authentication
            # OAuth tokens are preferred for security, app passwords for legacy support
            await self.client.login(self.config.username, self.config.password)
            
            self.logger.info(f"Connected to IMAP server: {self.config.host}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to connect to IMAP server {self.config.host}: {e}")
            return False
    
    async def fetch_new_messages(self, folder: str = "INBOX", since_date: Optional[datetime] = None) -> List[EmailMessage]:
        """
        Fetch new email messages from specified folder.
        
        BUSINESS LOGIC:
        Retrieves unprocessed emails from broker's account, applying filters
        to focus on potential freight load requests and reduce noise.
        
        TECHNICAL APPROACH:
        Uses IMAP search commands with date filtering and custom flags to
        avoid reprocessing emails. Extracts full message content for analysis.
        
        ARGS:
            folder: IMAP folder to monitor (default: INBOX)
            since_date: Only fetch messages newer than this date
            
        RETURNS:
            List of new email messages ready for processing
        """
        if not self.client:
            raise RuntimeError("IMAP client not connected")
        
        messages = []
        
        try:
            # Select the folder
            await self.client.select(folder)
            
            # Build search criteria
            search_criteria = ['NOT', 'KEYWORD', 'AI_BROKER_PROCESSED']
            
            if since_date:
                # Format date for IMAP search (DD-MMM-YYYY)
                date_str = since_date.strftime("%d-%b-%Y")
                search_criteria.extend(['SINCE', date_str])
            
            # Search for messages
            search_response = await self.client.search(*search_criteria)
            
            if search_response.result != 'OK':
                self.logger.warning(f"Search failed in folder {folder}: {search_response.result}")
                return messages
            
            # Parse message UIDs
            uid_list = search_response.lines[0].split() if search_response.lines else []
            
            if not uid_list:
                self.logger.debug(f"No new messages in folder {folder}")
                return messages
            
            self.logger.info(f"Found {len(uid_list)} new messages in {folder}")
            
            # Fetch message details
            for uid in uid_list:
                try:
                    message = await self._fetch_message_details(uid.decode(), folder)
                    if message:
                        messages.append(message)
                except Exception as e:
                    self.logger.error(f"Failed to fetch message {uid}: {e}")
                    continue
            
            return messages
            
        except Exception as e:
            self.logger.error(f"Error fetching messages from {folder}: {e}")
            return messages
    
    async def _fetch_message_details(self, uid: str, folder: str) -> Optional[EmailMessage]:
        """
        Fetch complete message details including headers and body.
        
        TECHNICAL APPROACH:
        Retrieves full RFC 2822 message format and parses headers, body parts,
        and metadata needed for freight load classification.
        """
        if not self.client:
            return None
        
        try:
            # Fetch message by UID
            fetch_response = await self.client.uid('fetch', uid, '(RFC822)')
            
            if fetch_response.result != 'OK':
                self.logger.warning(f"Failed to fetch message {uid}: {fetch_response.result}")
                return None
            
            # Parse raw email message
            raw_message = fetch_response.lines[1]
            msg = email.message_from_bytes(raw_message)
            
            # Extract headers
            headers = {}
            for key, value in msg.items():
                headers[key.lower()] = self._decode_header(value)
            
            # Extract message metadata
            message_id = headers.get('message-id', f'<{uid}@{self.config.host}>')
            subject = headers.get('subject', '')
            sender = headers.get('from', '')
            
            # Parse recipient list
            recipients = []
            for recipient_header in ['to', 'cc', 'bcc']:
                if recipient_header in headers:
                    recipients.extend(self._parse_email_addresses(headers[recipient_header]))
            
            # Parse date
            date_str = headers.get('date', '')
            message_date = self._parse_date(date_str)
            
            # Extract body content
            body_text, body_html = self._extract_body_content(msg)
            
            return EmailMessage(
                message_id=message_id,
                uid=uid,
                subject=subject,
                sender=sender,
                recipients=recipients,
                date=message_date,
                body_text=body_text,
                body_html=body_html,
                headers=headers,
                folder=folder
            )
            
        except Exception as e:
            self.logger.error(f"Error parsing message {uid}: {e}")
            return None
    
    def _decode_header(self, header_value: str) -> str:
        """
        Decode email header value handling various encodings.
        
        TECHNICAL APPROACH:
        Handles MIME-encoded headers that may contain non-ASCII characters
        commonly found in international email addresses and subjects.
        """
        if not header_value:
            return ''
        
        try:
            decoded_parts = decode_header(header_value)
            decoded_string = ''
            
            for part, encoding in decoded_parts:
                if isinstance(part, bytes):
                    if encoding:
                        decoded_string += part.decode(encoding)
                    else:
                        decoded_string += part.decode('utf-8', errors='ignore')
                else:
                    decoded_string += part
            
            return decoded_string.strip()
            
        except Exception:
            return header_value
    
    def _parse_email_addresses(self, address_header: str) -> List[str]:
        """Extract individual email addresses from header."""
        if not address_header:
            return []
        
        # Simple email extraction - could be enhanced with email.utils.getaddresses
        addresses = []
        parts = address_header.split(',')
        
        for part in parts:
            # Extract email from "Name <email@domain.com>" format
            if '<' in part and '>' in part:
                start = part.find('<') + 1
                end = part.find('>')
                if start < end:
                    addresses.append(part[start:end].strip())
            elif '@' in part:
                addresses.append(part.strip())
        
        return addresses
    
    def _parse_date(self, date_str: str) -> datetime:
        """Parse email date header into datetime object."""
        if not date_str:
            return datetime.now()
        
        try:
            # Parse RFC 2822 date format
            time_tuple = parsedate_tz(date_str)
            if time_tuple:
                timestamp = mktime_tz(time_tuple)
                return datetime.fromtimestamp(timestamp)
        except Exception:
            pass
        
        return datetime.now()
    
    def _extract_body_content(self, msg: email.message.Message) -> Tuple[str, str]:
        """
        Extract text and HTML body content from email message.
        
        BUSINESS LOGIC:
        Extracts the email body content that will be analyzed for freight
        load information. Handles both plain text and HTML formats.
        """
        body_text = ''
        body_html = ''
        
        try:
            if msg.is_multipart():
                # Handle multipart messages
                for part in msg.walk():
                    content_type = part.get_content_type()
                    content_disposition = str(part.get('Content-Disposition', ''))
                    
                    # Skip attachments
                    if 'attachment' in content_disposition:
                        continue
                    
                    if content_type == 'text/plain':
                        payload = part.get_payload(decode=True)
                        if payload:
                            body_text += payload.decode('utf-8', errors='ignore')
                    
                    elif content_type == 'text/html':
                        payload = part.get_payload(decode=True)
                        if payload:
                            body_html += payload.decode('utf-8', errors='ignore')
            
            else:
                # Handle single-part messages
                content_type = msg.get_content_type()
                payload = msg.get_payload(decode=True)
                
                if payload:
                    content = payload.decode('utf-8', errors='ignore')
                    if content_type == 'text/html':
                        body_html = content
                        # Basic HTML to text conversion
                        import re
                        body_text = re.sub(r'<[^>]+>', '', content)
                    else:
                        body_text = content
        
        except Exception as e:
            self.logger.error(f"Error extracting body content: {e}")
        
        return body_text.strip(), body_html.strip()
    
    async def mark_as_processed(self, uid: str, folder: str) -> bool:
        """
        Mark email message as processed to prevent reprocessing.
        
        BUSINESS LOGIC:
        Sets a custom IMAP flag on processed messages to ensure they don't
        get processed multiple times, maintaining system efficiency.
        
        TECHNICAL APPROACH:
        Uses IMAP STORE command to add custom keyword flag that persists
        on the email server.
        """
        if not self.client:
            return False
        
        try:
            await self.client.select(folder)
            store_response = await self.client.uid('store', uid, '+FLAGS.SILENT', '\\Keyword AI_BROKER_PROCESSED')
            return store_response.result == 'OK'
            
        except Exception as e:
            self.logger.error(f"Failed to mark message {uid} as processed: {e}")
            return False
    
    async def close(self):
        """Close IMAP connection and clean up resources."""
        if self.client:
            try:
                await self.client.logout()
            except Exception as e:
                self.logger.warning(f"Error during IMAP logout: {e}")
            finally:
                self.client = None

# ===============================================================================
# EMAIL POLLING SERVICE
# ===============================================================================

class IMAPPollingService:
    """
    Background service for polling IMAP email accounts.
    
    BUSINESS CONTEXT:
    Provides continuous email monitoring for brokers using email providers
    that don't support real-time webhooks, ensuring comprehensive coverage
    of all potential freight load sources.
    
    ARCHITECTURE ROLE:
    Coordinates multiple IMAP connections and integrates with the existing
    email processing pipeline used by webhook-based providers.
    
    KEY METHODS:
    - start(): Begin polling all configured accounts
    - stop(): Gracefully shutdown polling service
    - add_account(): Register new email account for monitoring
    - process_account(): Handle emails for a specific account
    
    USAGE PATTERNS:
    Runs as a long-lived background service, typically started at application
    startup and managed by a process supervisor or container orchestrator.
    """
    
    def __init__(self):
        """
        Initialize IMAP polling service.
        
        BUSINESS LOGIC:
        Sets up database connection and logging for monitoring multiple
        broker email accounts with different polling schedules.
        """
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        
        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
        self.logger = logging.getLogger("imap_service")
        self.running = False
        self.account_tasks: Dict[str, asyncio.Task] = {}
    
    async def start(self):
        """
        Start polling all configured IMAP email accounts.
        
        BUSINESS LOGIC:
        Loads all active IMAP accounts from database and starts concurrent
        polling tasks for each account with appropriate intervals.
        """
        self.running = True
        self.logger.info("Starting IMAP polling service")
        
        try:
            # Load IMAP accounts from database
            accounts = await self._load_imap_accounts()
            
            # Start polling task for each account
            for account in accounts:
                task = asyncio.create_task(self._poll_account(account))
                self.account_tasks[account['id']] = task
                self.logger.info(f"Started polling for account: {account['email_address']}")
            
            # Wait for shutdown signal
            while self.running:
                await asyncio.sleep(1)
                
                # Check for new or removed accounts periodically
                if len(self.account_tasks) % 60 == 0:  # Every minute
                    await self._refresh_accounts()
        
        except Exception as e:
            self.logger.error(f"Error in polling service: {e}")
        finally:
            await self.stop()
    
    async def stop(self):
        """Gracefully stop polling service and clean up tasks."""
        self.running = False
        self.logger.info("Stopping IMAP polling service")
        
        # Cancel all polling tasks
        for account_id, task in self.account_tasks.items():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        self.account_tasks.clear()
        self.logger.info("IMAP polling service stopped")
    
    async def _load_imap_accounts(self) -> List[Dict[str, Any]]:
        """
        Load active IMAP email accounts from database.
        
        BUSINESS LOGIC:
        Retrieves all broker email accounts configured for IMAP monitoring,
        filtering for active accounts with valid credentials.
        """
        try:
            response = self.supabase.table("email_accounts").select("*").in_(
                'provider', ['IMAP_GENERIC', 'YAHOO', 'CUSTOM']
            ).eq('status', 'ACTIVE').eq('processing_enabled', True).execute()
            
            if response.data:
                self.logger.info(f"Loaded {len(response.data)} IMAP accounts")
                return response.data
            else:
                self.logger.info("No IMAP accounts found")
                return []
                
        except Exception as e:
            self.logger.error(f"Failed to load IMAP accounts: {e}")
            return []
    
    async def _refresh_accounts(self):
        """Refresh account list and start/stop polling tasks as needed."""
        try:
            current_accounts = await self._load_imap_accounts()
            current_account_ids = {acc['id'] for acc in current_accounts}
            running_account_ids = set(self.account_tasks.keys())
            
            # Stop removed accounts
            for account_id in running_account_ids - current_account_ids:
                if account_id in self.account_tasks:
                    self.account_tasks[account_id].cancel()
                    del self.account_tasks[account_id]
                    self.logger.info(f"Stopped polling for removed account: {account_id}")
            
            # Start new accounts
            for account in current_accounts:
                if account['id'] not in running_account_ids:
                    task = asyncio.create_task(self._poll_account(account))
                    self.account_tasks[account['id']] = task
                    self.logger.info(f"Started polling for new account: {account['email_address']}")
        
        except Exception as e:
            self.logger.error(f"Error refreshing accounts: {e}")
    
    async def _poll_account(self, account: Dict[str, Any]):
        """
        Poll individual email account for new messages.
        
        BUSINESS LOGIC:
        Continuously monitors a single broker's email account, processing
        new messages and updating the last sync timestamp.
        
        TECHNICAL APPROACH:
        Uses configurable polling intervals and error recovery to maintain
        reliable email monitoring even when connections fail.
        """
        account_id = account['id']
        email_address = account['email_address']
        
        # Create IMAP configuration
        config = IMAPConfig(
            host=account['imap_host'],
            port=account['imap_port'],
            use_tls=account['imap_use_tls'],
            username=account['imap_username'],
            password=account['imap_password'],
            monitor_folders=account['monitor_folders'] or ['INBOX']
        )
        
        client = IMAPEmailClient(config)
        
        # Polling interval (default: 5 minutes)
        poll_interval = 300  # seconds
        error_count = 0
        max_errors = 5
        
        while self.running:
            try:
                # Connect to IMAP server
                if not await client.connect():
                    error_count += 1
                    if error_count >= max_errors:
                        self.logger.error(f"Max connection errors reached for {email_address}")
                        break
                    
                    await asyncio.sleep(poll_interval)
                    continue
                
                # Reset error count on successful connection
                error_count = 0
                
                # Get last sync time
                last_sync = self._parse_datetime(account.get('last_sync_at'))
                since_date = last_sync or datetime.now() - timedelta(hours=24)
                
                # Process each monitored folder
                total_processed = 0
                
                for folder in config.monitor_folders:
                    try:
                        messages = await client.fetch_new_messages(folder, since_date)
                        
                        for message in messages:
                            try:
                                # Process the email
                                result = await self._process_email(account, message)
                                
                                if result.success:
                                    # Mark as processed on server
                                    await client.mark_as_processed(message.uid, folder)
                                    total_processed += 1
                                
                            except Exception as e:
                                self.logger.error(f"Error processing message {message.message_id}: {e}")
                    
                    except Exception as e:
                        self.logger.error(f"Error processing folder {folder} for {email_address}: {e}")
                
                # Update last sync time
                if total_processed > 0 or error_count == 0:
                    await self._update_last_sync(account_id)
                    self.logger.info(f"Processed {total_processed} messages for {email_address}")
                
                # Close connection
                await client.close()
                
                # Wait until next poll
                await asyncio.sleep(poll_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                error_count += 1
                self.logger.error(f"Error polling account {email_address}: {e}")
                
                if error_count >= max_errors:
                    self.logger.error(f"Max errors reached for {email_address}, stopping polling")
                    break
                
                await asyncio.sleep(min(poll_interval, 60 * error_count))
        
        await client.close()
        self.logger.info(f"Stopped polling account: {email_address}")
    
    async def _process_email(self, account: Dict[str, Any], message: EmailMessage) -> ProcessingResult:
        """
        Process individual email message through intake workflow.
        
        INTEGRATION POINT:
        This connects IMAP-collected emails to the existing Python LangGraph
        workflow for classification and load processing.
        """
        try:
            # Log processing attempt
            log_entry = {
                'email_account_id': account['id'],
                'broker_id': account['broker_id'],
                'message_id': message.message_id,
                'thread_id': message.message_id,  # IMAP doesn't have conversation threading
                'subject': message.subject,
                'sender_email': message.sender,
                'received_at': message.date.isoformat(),
                'processing_status': 'PROCESSING',
                'raw_email_headers': message.headers,
                'email_body_text': message.body_text,
                'email_body_html': message.body_html
            }
            
            result = self.supabase.table('email_processing_log').insert(log_entry).execute()
            log_id = result.data[0]['id'] if result.data else None
            
            # TODO: Call existing src/agents/intake/graph.py workflow
            # For now, simulate processing
            processing_result = ProcessingResult(
                success=True,
                message_id=message.message_id,
                classification='LOAD_REQUEST',
                confidence=0.80
            )
            
            # Update processing log
            if log_id:
                update_data = {
                    'processing_status': 'SUCCESS' if processing_result.success else 'ERROR',
                    'processed_at': datetime.now().isoformat(),
                    'intent_classification': processing_result.classification,
                    'extraction_confidence': processing_result.confidence
                }
                
                if processing_result.error:
                    update_data['error_message'] = processing_result.error
                
                self.supabase.table('email_processing_log').update(update_data).eq('id', log_id).execute()
            
            return processing_result
            
        except Exception as e:
            self.logger.error(f"Error processing email {message.message_id}: {e}")
            return ProcessingResult(
                success=False,
                message_id=message.message_id,
                error=str(e)
            )
    
    def _parse_datetime(self, dt_str: Optional[str]) -> Optional[datetime]:
        """Parse datetime string from database."""
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        except:
            return None
    
    async def _update_last_sync(self, account_id: str):
        """Update last sync timestamp for email account."""
        try:
            self.supabase.table('email_accounts').update({
                'last_sync_at': datetime.now().isoformat(),
                'status': 'ACTIVE',
                'error_count': 0,
                'last_error': None
            }).eq('id', account_id).execute()
        except Exception as e:
            self.logger.error(f"Failed to update last sync for {account_id}: {e}")

# ===============================================================================
# SERVICE MANAGEMENT
# ===============================================================================

async def main():
    """
    Main entry point for IMAP polling service.
    
    USAGE PATTERNS:
    Run as a background service using supervisord, systemd, or container
    orchestrator. Handles graceful shutdown and proper resource cleanup.
    """
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    service = IMAPPollingService()
    
    try:
        await service.start()
    except KeyboardInterrupt:
        logging.info("Received shutdown signal")
    finally:
        await service.stop()

if __name__ == "__main__":
    asyncio.run(main())