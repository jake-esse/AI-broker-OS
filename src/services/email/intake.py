#!/usr/bin/env python3
# --------------------------- src/services/email/intake.py ----------------------------
"""
AI-Broker MVP · Multi-Provider Email Intake Service (LangGraph Integration)

OVERVIEW:
This service extends the existing intake_graph.py workflow to support emails from
multiple sources: Gmail API webhooks, Microsoft Graph webhooks, IMAP polling,
and file-based .eml processing. It provides a unified interface for email
processing regardless of the source provider.

WORKFLOW:
1. Receive email from any source (webhook, IMAP, file)
2. Normalize email format and extract metadata
3. Run existing LangGraph classification and extraction
4. Handle provider-specific features (threading, OAuth refresh)
5. Process results through existing workflow (complexity detection, missing info)

BUSINESS LOGIC:
- Maintains compatibility with existing intake_graph.py workflow
- Supports broker email account connections via OAuth
- Handles email threading and conversation tracking
- Integrates with existing database schema and Edge Functions
- Preserves audit trails and processing logs

TECHNICAL ARCHITECTURE:
- Wraps existing LangGraph workflow with multi-provider support
- Provider-agnostic email normalization
- OAuth token management and refresh
- Database integration for email account tracking
- Error handling and retry logic

DEPENDENCIES:
- Existing intake_graph.py workflow
- oauth_service.py for token management
- Supabase database with email_accounts schema
- Provider-specific APIs (Gmail, Graph, IMAP)
"""

import os
import json
import uuid
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

# Import existing intake workflow
from src.agents.intake.graph import GState, classify, ask_more, ack, route_after_classify, detect_freight_complexity
from src.services.email.oauth import OAuthService, EmailProvider

load_dotenv()

# ===============================================================================
# CONFIGURATION AND TYPES
# ===============================================================================

@dataclass
class EmailSource:
    """Normalized email source information"""
    provider: str  # 'GMAIL', 'OUTLOOK', 'IMAP_GENERIC', 'FILE'
    account_id: Optional[str] = None  # Database email account ID
    broker_id: Optional[str] = None   # Broker who owns the account

@dataclass
class NormalizedEmail:
    """Standardized email format for processing"""
    message_id: str
    thread_id: str
    subject: str
    sender: str
    recipients: List[str]
    date: datetime
    body_text: str
    body_html: str
    headers: Dict[str, str]
    source: EmailSource

@dataclass
class ProcessingContext:
    """Additional context for email processing"""
    retry_count: int = 0
    original_request_id: Optional[str] = None
    is_response_to_missing_info: bool = False
    confidence_threshold: float = 0.85

# ===============================================================================
# MULTI-PROVIDER EMAIL INTAKE SERVICE
# ===============================================================================

class EmailIntakeService:
    """
    Unified email intake service supporting multiple email providers.
    
    BUSINESS CONTEXT:
    Enables brokers to connect any email account to the AI-Broker system,
    ensuring comprehensive coverage of freight load sources regardless of
    the email provider's technical capabilities.
    
    ARCHITECTURE ROLE:
    Acts as the interface layer between various email sources and the
    existing LangGraph workflow, providing provider abstraction and
    unified processing capabilities.
    
    KEY METHODS:
    - process_email(): Main entry point for all email processing
    - normalize_email(): Convert provider-specific formats to standard format
    - handle_webhook_email(): Process emails from webhook notifications
    - handle_file_email(): Process emails from .eml files
    - handle_missing_info_response(): Process responses to missing info requests
    
    USAGE PATTERNS:
    Instantiated by webhook handlers, IMAP polling service, or CLI tools.
    Maintains connection to database and OAuth service for account management.
    """
    
    def __init__(self):
        """
        Initialize multi-provider email intake service.
        
        BUSINESS LOGIC:
        Sets up database connections and OAuth service for managing
        broker email accounts and processing credentials.
        """
        # Initialize Supabase client
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        
        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
        self.oauth_service = OAuthService()
    
    async def process_email(self, email_data: Union[Dict[str, Any], NormalizedEmail], 
                           context: Optional[ProcessingContext] = None) -> Dict[str, Any]:
        """
        Main entry point for processing emails from any source.
        
        BUSINESS LOGIC:
        Provides a unified interface for email processing that handles
        provider-specific formats, OAuth token refresh, and integration
        with the existing LangGraph workflow.
        
        TECHNICAL APPROACH:
        Normalizes email format, validates account permissions, runs
        the existing classification workflow, and handles results
        according to business rules.
        
        ARGS:
            email_data: Raw email data or pre-normalized email object
            context: Additional processing context and configuration
            
        RETURNS:
            Dict containing processing results and next steps
            
        RAISES:
            ValueError: If email format is invalid or account not found
        """
        if context is None:
            context = ProcessingContext()
        
        # Normalize email format
        if isinstance(email_data, dict):
            normalized_email = await self._normalize_email_from_dict(email_data)
        else:
            normalized_email = email_data
        
        try:
            # Validate email account and permissions
            if normalized_email.source.account_id:
                account_valid = await self._validate_email_account(normalized_email.source.account_id)
                if not account_valid:
                    return {
                        "success": False,
                        "error": "Email account not found or inactive",
                        "message_id": normalized_email.message_id
                    }
            
            # Log processing attempt
            log_id = await self._create_processing_log(normalized_email, context)
            
            # Check if this is a response to missing information request
            if context.is_response_to_missing_info:
                return await self._handle_missing_info_response(normalized_email, context, log_id)
            
            # Run existing LangGraph classification workflow
            processing_result = await self._run_classification_workflow(normalized_email, context)
            
            # Update processing log with results
            await self._update_processing_log(log_id, processing_result)
            
            # Handle workflow results
            return await self._handle_workflow_results(normalized_email, processing_result, context)
            
        except Exception as e:
            error_result = {
                "success": False,
                "error": str(e),
                "message_id": normalized_email.message_id,
                "retry_count": context.retry_count
            }
            
            # Log error if we have a log ID
            if 'log_id' in locals():
                await self._update_processing_log(log_id, error_result)
            
            return error_result
    
    async def _normalize_email_from_dict(self, email_data: Dict[str, Any]) -> NormalizedEmail:
        """
        Convert provider-specific email format to normalized format.
        
        TECHNICAL APPROACH:
        Handles different email data structures from various sources:
        - Gmail API format
        - Microsoft Graph format
        - IMAP client format
        - File-based .eml format
        """
        source_type = email_data.get('source_type', 'UNKNOWN')
        
        if source_type == 'GMAIL_API':
            return await self._normalize_gmail_email(email_data)
        elif source_type == 'MICROSOFT_GRAPH':
            return await self._normalize_graph_email(email_data)
        elif source_type in ['IMAP_GENERIC', 'YAHOO', 'CUSTOM']:
            return await self._normalize_imap_email(email_data)
        elif source_type == 'FILE':
            return await self._normalize_file_email(email_data)
        else:
            # Generic normalization for unknown sources
            return await self._normalize_generic_email(email_data)
    
    async def _normalize_gmail_email(self, email_data: Dict[str, Any]) -> NormalizedEmail:
        """Normalize Gmail API email format."""
        headers = email_data.get('email_headers', {})
        
        return NormalizedEmail(
            message_id=email_data.get('message_id', f'gmail-{uuid.uuid4()}'),
            thread_id=email_data.get('thread_id', email_data.get('message_id', '')),
            subject=email_data.get('email_subject', ''),
            sender=email_data.get('email_from', ''),
            recipients=email_data.get('email_to', '').split(',') if email_data.get('email_to') else [],
            date=self._parse_email_date(email_data.get('received_at')),
            body_text=email_data.get('email_body', ''),
            body_html=email_data.get('email_body_html', ''),
            headers=headers,
            source=EmailSource(
                provider='GMAIL',
                account_id=email_data.get('source_email_account_id'),
                broker_id=email_data.get('broker_id')
            )
        )
    
    async def _normalize_graph_email(self, email_data: Dict[str, Any]) -> NormalizedEmail:
        """Normalize Microsoft Graph email format."""
        headers = email_data.get('email_headers', {})
        
        return NormalizedEmail(
            message_id=email_data.get('message_id', f'graph-{uuid.uuid4()}'),
            thread_id=email_data.get('thread_id', email_data.get('message_id', '')),
            subject=email_data.get('email_subject', ''),
            sender=email_data.get('email_from', ''),
            recipients=email_data.get('email_to', '').split(',') if email_data.get('email_to') else [],
            date=self._parse_email_date(email_data.get('received_at')),
            body_text=email_data.get('email_body', ''),
            body_html=email_data.get('email_body_html', ''),
            headers=headers,
            source=EmailSource(
                provider='OUTLOOK',
                account_id=email_data.get('source_email_account_id'),
                broker_id=email_data.get('broker_id')
            )
        )
    
    async def _normalize_imap_email(self, email_data: Dict[str, Any]) -> NormalizedEmail:
        """Normalize IMAP email format."""
        headers = email_data.get('email_headers', {})
        
        return NormalizedEmail(
            message_id=email_data.get('message_id', f'imap-{uuid.uuid4()}'),
            thread_id=email_data.get('message_id', ''),  # IMAP doesn't have native threading
            subject=email_data.get('email_subject', ''),
            sender=email_data.get('email_from', ''),
            recipients=email_data.get('email_to', '').split(',') if email_data.get('email_to') else [],
            date=self._parse_email_date(email_data.get('received_at')),
            body_text=email_data.get('email_body', ''),
            body_html=email_data.get('email_body_html', ''),
            headers=headers,
            source=EmailSource(
                provider='IMAP_GENERIC',
                account_id=email_data.get('source_email_account_id'),
                broker_id=email_data.get('broker_id')
            )
        )
    
    async def _normalize_file_email(self, email_data: Dict[str, Any]) -> NormalizedEmail:
        """Normalize file-based .eml email format."""
        # For file processing, use existing parse_email_with_headers function
        from src.agents.intake.graph import parse_email_with_headers
        
        file_path = email_data.get('file_path')
        if file_path:
            parsed = parse_email_with_headers(Path(file_path))
            return NormalizedEmail(
                message_id=parsed['message_id'],
                thread_id=parsed['message_id'],
                subject=parsed['subject'],
                sender=parsed['from'],
                recipients=[],  # Not available from file
                date=datetime.now(),
                body_text=parsed['body'],
                body_html='',
                headers={},
                source=EmailSource(provider='FILE')
            )
        else:
            # Use provided email data directly
            return await self._normalize_generic_email(email_data)
    
    async def _normalize_generic_email(self, email_data: Dict[str, Any]) -> NormalizedEmail:
        """Generic email normalization for unknown sources."""
        return NormalizedEmail(
            message_id=email_data.get('message_id', f'generic-{uuid.uuid4()}'),
            thread_id=email_data.get('thread_id', email_data.get('message_id', '')),
            subject=email_data.get('email_subject', email_data.get('subject', '')),
            sender=email_data.get('email_from', email_data.get('from', '')),
            recipients=email_data.get('recipients', []),
            date=self._parse_email_date(email_data.get('received_at', email_data.get('date'))),
            body_text=email_data.get('email_body', email_data.get('body', '')),
            body_html=email_data.get('email_body_html', ''),
            headers=email_data.get('email_headers', email_data.get('headers', {})),
            source=EmailSource(
                provider='GENERIC',
                account_id=email_data.get('source_email_account_id'),
                broker_id=email_data.get('broker_id')
            )
        )
    
    def _parse_email_date(self, date_str: Optional[str]) -> datetime:
        """Parse email date from various formats."""
        if not date_str:
            return datetime.now()
        
        try:
            # Try ISO format first
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except:
            try:
                # Try parsing as timestamp
                return datetime.fromtimestamp(float(date_str))
            except:
                # Default to current time
                return datetime.now()
    
    async def _validate_email_account(self, account_id: str) -> bool:
        """
        Validate that email account exists and is active.
        
        BUSINESS LOGIC:
        Ensures that only active, properly configured email accounts
        can process freight load requests.
        """
        try:
            response = self.supabase.table("email_accounts").select("status, processing_enabled").eq("id", account_id).single().execute()
            
            if response.data:
                account = response.data
                return account.get('status') == 'ACTIVE' and account.get('processing_enabled', False)
            
            return False
            
        except Exception:
            return False
    
    async def _create_processing_log(self, email: NormalizedEmail, context: ProcessingContext) -> str:
        """Create processing log entry for audit trail."""
        log_entry = {
            'email_account_id': email.source.account_id,
            'broker_id': email.source.broker_id,
            'message_id': email.message_id,
            'thread_id': email.thread_id,
            'subject': email.subject,
            'sender_email': email.sender,
            'received_at': email.date.isoformat(),
            'processing_status': 'PROCESSING',
            'raw_email_headers': email.headers,
            'email_body_text': email.body_text,
            'email_body_html': email.body_html,
            'retry_count': context.retry_count
        }
        
        result = self.supabase.table('email_processing_log').insert(log_entry).execute()
        return result.data[0]['id'] if result.data else str(uuid.uuid4())
    
    async def _run_classification_workflow(self, email: NormalizedEmail, context: ProcessingContext) -> Dict[str, Any]:
        """
        Run the existing LangGraph classification workflow.
        
        INTEGRATION POINT:
        This connects the multi-provider email system to the existing
        intake_graph.py workflow, preserving all business logic and
        classification capabilities.
        """
        # Create LangGraph state from normalized email
        state: GState = {
            'raw_text': email.body_text,
            'load': {},
            'missing': [],
            'email_from': email.sender,
            'email_message_id': email.message_id,
            'email_subject': email.subject
        }
        
        # Run classification
        classification_result = classify(state)
        
        # Update state with classification results
        state.update(classification_result)
        
        # Check if all required fields are present
        has_missing_fields = len(state['missing']) > 0
        
        return {
            'success': True,
            'state': state,
            'has_missing_fields': has_missing_fields,
            'load_data': state['load'],
            'missing_fields': state['missing'],
            'complexity_flags': state['load'].get('complexity_flags', []),
            'requires_human_review': state['load'].get('requires_human_review', False)
        }
    
    async def _handle_workflow_results(self, email: NormalizedEmail, 
                                     processing_result: Dict[str, Any], 
                                     context: ProcessingContext) -> Dict[str, Any]:
        """
        Handle the results of the classification workflow.
        
        BUSINESS LOGIC:
        Routes processing results to appropriate next steps:
        - Complete loads -> save to database
        - Incomplete loads -> request missing information
        - Complex loads -> flag for human review
        """
        if not processing_result['success']:
            return processing_result
        
        state = processing_result['state']
        
        if processing_result['has_missing_fields']:
            # Handle missing information - send email request
            missing_result = ask_more(state)
            return {
                'success': True,
                'action': 'missing_info_requested',
                'missing_fields': processing_result['missing_fields'],
                'message_id': email.message_id,
                'thread_id': email.thread_id
            }
        else:
            # Complete load - save to database
            save_result = ack(state)
            return {
                'success': True,
                'action': 'load_saved',
                'load_data': processing_result['load_data'],
                'complexity_flags': processing_result['complexity_flags'],
                'requires_human_review': processing_result['requires_human_review'],
                'message_id': email.message_id
            }
    
    async def _handle_missing_info_response(self, email: NormalizedEmail, 
                                          context: ProcessingContext, 
                                          log_id: str) -> Dict[str, Any]:
        """
        Handle responses to missing information requests.
        
        INTEGRATION POINT:
        Uses existing handle_missing_info_response module to process
        shipper responses and complete incomplete loads.
        """
        try:
            from src.agents.intake.missing_info_handler import handle_missing_info_response
            
            # Convert normalized email to format expected by handler
            email_data = {
                'message_id': email.message_id,
                'thread_id': email.thread_id,
                'subject': email.subject,
                'from': email.sender,
                'body': email.body_text,
                'headers': email.headers
            }
            
            # Process the missing info response
            result = await handle_missing_info_response(email_data)
            
            return {
                'success': result.get('success', False),
                'action': 'missing_info_processed',
                'load_updated': result.get('load_updated', False),
                'message_id': email.message_id
            }
            
        except ImportError:
            return {
                'success': False,
                'error': 'Missing info response handler not available',
                'message_id': email.message_id
            }
    
    async def _update_processing_log(self, log_id: str, result: Dict[str, Any]):
        """Update processing log with final results."""
        update_data = {
            'processing_status': 'SUCCESS' if result.get('success', False) else 'ERROR',
            'processed_at': datetime.now().isoformat()
        }
        
        if result.get('success'):
            update_data.update({
                'intent_classification': result.get('action', 'UNKNOWN'),
                'load_id': result.get('load_id'),
                'extraction_confidence': result.get('confidence'),
                'complexity_flags': result.get('complexity_flags')
            })
        else:
            update_data['error_message'] = result.get('error', 'Unknown error')
        
        try:
            self.supabase.table('email_processing_log').update(update_data).eq('id', log_id).execute()
        except Exception as e:
            print(f"Failed to update processing log {log_id}: {e}")

# ===============================================================================
# CONVENIENCE FUNCTIONS
# ===============================================================================

def create_email_intake_service() -> EmailIntakeService:
    """Factory function to create configured email intake service."""
    return EmailIntakeService()

async def process_webhook_email(webhook_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process email from webhook notification.
    
    USAGE PATTERNS:
    Called by Gmail and Outlook webhook Edge Functions to process
    incoming email notifications in real-time.
    """
    service = create_email_intake_service()
    return await service.process_email(webhook_data)

async def process_file_email(file_path: str) -> Dict[str, Any]:
    """
    Process email from .eml file.
    
    USAGE PATTERNS:
    Used for CLI processing, testing, and batch import of historical emails.
    Maintains compatibility with existing file-based workflow.
    """
    service = create_email_intake_service()
    email_data = {
        'source_type': 'FILE',
        'file_path': file_path
    }
    return await service.process_email(email_data)

# ===============================================================================
# USAGE EXAMPLES
# ===============================================================================
if __name__ == "__main__":
    """
    Example usage of the multi-provider email intake service.
    """
    import asyncio
    
    async def test_file_processing():
        """Test processing a file-based email."""
        result = await process_file_email("sample.eml")
        print(f"Processing result: {json.dumps(result, indent=2)}")
    
    # Run test
    asyncio.run(test_file_processing())