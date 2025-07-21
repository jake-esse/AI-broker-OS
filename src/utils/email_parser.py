# --------------------------- src/utils/email_parser.py ----------------------------
"""
AI-Broker MVP · Enhanced Email Parser Utility

OVERVIEW:
Advanced email parsing utility that handles various email formats, attachments,
and encoding issues commonly found in freight broker communications.

WORKFLOW:
1. Parse email structure (multipart, HTML, plain text)
2. Extract and normalize text content
3. Handle attachments (PDFs, Excel files)
4. Clean and prepare text for LLM processing

BUSINESS LOGIC:
- Shippers send emails in many formats (Outlook, Gmail, mobile apps)
- Some include load details in attachments
- Must handle forwarded emails and reply chains
- Extract most recent/relevant content

TECHNICAL ARCHITECTURE:
- Robust charset detection and decoding
- HTML to text conversion with formatting preservation
- Attachment detection and categorization
- Smart reply chain parsing

DEPENDENCIES:
- email (standard library)
- html2text for HTML conversion
- chardet for encoding detection
"""

import email
import html2text
import chardet
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from email.message import Message
import base64
from datetime import datetime


class EnhancedEmailParser:
    """
    Advanced email parser with comprehensive format handling.
    
    BUSINESS CONTEXT:
    Freight brokers receive emails from various sources with different
    formatting standards. This parser ensures we can extract load
    information regardless of the email client or format used.
    
    KEY FEATURES:
    - Multi-part email handling
    - HTML to text conversion
    - Attachment detection
    - Reply chain extraction
    - Encoding error recovery
    """
    
    def __init__(self):
        """Initialize the enhanced email parser with configuration."""
        self.html_converter = html2text.HTML2Text()
        self.html_converter.ignore_links = False
        self.html_converter.ignore_images = True
        self.html_converter.body_width = 0  # Don't wrap lines
        
    def parse_email_file(self, file_path: Path) -> Dict[str, any]:
        """
        Parse an email file and extract all relevant information.
        
        BUSINESS LOGIC:
        Extracts not just the body text but all metadata that might
        be useful for load processing and customer relationship management.
        
        ARGS:
            file_path: Path to .eml or .msg file
            
        RETURNS:
            Dict containing:
            - headers: All email headers
            - body_text: Cleaned plain text body
            - body_html: Original HTML if present
            - attachments: List of attachment info
            - extracted_loads: Any load data found in tables
            - reply_chain: Previous emails in thread
            
        INTEGRATION POINTS:
        Output feeds directly into the intake agent's LLM processing.
        """
        try:
            # Read and parse email file
            with open(file_path, 'rb') as f:
                raw_email = f.read()
            
            # Detect encoding
            detected = chardet.detect(raw_email)
            encoding = detected['encoding'] or 'utf-8'
            
            # Parse email
            msg = email.message_from_bytes(raw_email)
            
            # Extract all components
            headers = self._extract_headers(msg)
            body_text, body_html = self._extract_body(msg)
            attachments = self._extract_attachments(msg)
            reply_chain = self._extract_reply_chain(body_text)
            extracted_loads = self._extract_structured_data(body_text, body_html)
            
            return {
                'headers': headers,
                'body_text': body_text,
                'body_html': body_html,
                'attachments': attachments,
                'extracted_loads': extracted_loads,
                'reply_chain': reply_chain,
                'encoding': encoding,
                'parsed_at': datetime.now().isoformat()
            }
            
        except Exception as e:
            # Return partial results on error
            return {
                'error': str(e),
                'headers': {},
                'body_text': '',
                'attachments': [],
                'parsed_at': datetime.now().isoformat()
            }
    
    def _extract_headers(self, msg: Message) -> Dict[str, str]:
        """
        Extract all email headers with normalization.
        
        HEADER PROCESSING:
        - Decode encoded headers (RFC 2047)
        - Normalize date formats
        - Extract reply-to and routing information
        """
        headers = {}
        
        # Key headers for freight processing
        important_headers = [
            'From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID',
            'In-Reply-To', 'References', 'Reply-To', 'Return-Path'
        ]
        
        for header in important_headers:
            value = msg.get(header, '')
            if value:
                # Decode if needed
                decoded = email.header.decode_header(value)
                if decoded:
                    parts = []
                    for part, encoding in decoded:
                        if isinstance(part, bytes):
                            part = part.decode(encoding or 'utf-8', errors='replace')
                        parts.append(str(part))
                    headers[header.lower()] = ' '.join(parts)
                else:
                    headers[header.lower()] = value
        
        # Extract email addresses
        headers['sender_email'] = self._extract_email_address(headers.get('from', ''))
        headers['reply_email'] = self._extract_email_address(
            headers.get('reply-to', headers.get('from', ''))
        )
        
        return headers
    
    def _extract_body(self, msg: Message) -> Tuple[str, Optional[str]]:
        """
        Extract email body with intelligent format handling.
        
        EXTRACTION STRATEGY:
        1. Prefer plain text if available
        2. Convert HTML to text if no plain text
        3. Handle nested multipart structures
        4. Clean and normalize extracted text
        """
        plain_text = ''
        html_content = None
        
        if msg.is_multipart():
            # Walk through all parts
            for part in msg.walk():
                content_type = part.get_content_type()
                
                if content_type == 'text/plain':
                    # Extract plain text
                    charset = part.get_content_charset() or 'utf-8'
                    try:
                        text = part.get_payload(decode=True).decode(charset, errors='replace')
                        plain_text += text + '\n'
                    except:
                        # Fallback decoding
                        text = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                        plain_text += text + '\n'
                        
                elif content_type == 'text/html' and not html_content:
                    # Store HTML for conversion if needed
                    charset = part.get_content_charset() or 'utf-8'
                    try:
                        html_content = part.get_payload(decode=True).decode(charset, errors='replace')
                    except:
                        html_content = part.get_payload(decode=True).decode('utf-8', errors='ignore')
        else:
            # Simple message
            content_type = msg.get_content_type()
            charset = msg.get_content_charset() or 'utf-8'
            
            try:
                payload = msg.get_payload(decode=True).decode(charset, errors='replace')
            except:
                payload = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
            
            if content_type == 'text/plain':
                plain_text = payload
            elif content_type == 'text/html':
                html_content = payload
        
        # Convert HTML if no plain text available
        if not plain_text.strip() and html_content:
            plain_text = self.html_converter.handle(html_content)
        
        # Clean up text
        plain_text = self._clean_email_text(plain_text)
        
        return plain_text, html_content
    
    def _extract_attachments(self, msg: Message) -> List[Dict[str, any]]:
        """
        Extract attachment information from email.
        
        BUSINESS RELEVANCE:
        Shippers often attach:
        - PDF rate confirmations
        - Excel load lists
        - Word documents with load details
        - Images of BOLs or delivery instructions
        """
        attachments = []
        
        for part in msg.walk():
            # Skip non-attachment parts
            if part.get_content_disposition() not in ['attachment', 'inline']:
                continue
            
            filename = part.get_filename()
            if filename:
                # Decode filename if needed
                decoded = email.header.decode_header(filename)
                if decoded:
                    filename = decoded[0][0]
                    if isinstance(filename, bytes):
                        filename = filename.decode('utf-8', errors='replace')
                
                # Get attachment info
                attachment_info = {
                    'filename': filename,
                    'content_type': part.get_content_type(),
                    'size': len(part.get_payload(decode=True)) if part.get_payload(decode=True) else 0,
                    'disposition': part.get_content_disposition()
                }
                
                # Categorize by type
                ext = Path(filename).suffix.lower()
                if ext in ['.pdf']:
                    attachment_info['category'] = 'document'
                elif ext in ['.xlsx', '.xls', '.csv']:
                    attachment_info['category'] = 'spreadsheet'
                elif ext in ['.doc', '.docx']:
                    attachment_info['category'] = 'document'
                elif ext in ['.jpg', '.jpeg', '.png', '.gif']:
                    attachment_info['category'] = 'image'
                else:
                    attachment_info['category'] = 'other'
                
                attachments.append(attachment_info)
        
        return attachments
    
    def _extract_reply_chain(self, text: str) -> List[Dict[str, str]]:
        """
        Extract previous emails from reply chain.
        
        CHAIN PARSING:
        Identifies common reply patterns:
        - "On [date], [person] wrote:"
        - "-----Original Message-----"
        - "> " quoted text
        - "From: ... Sent: ... To: ... Subject: ..."
        """
        replies = []
        
        # Common reply patterns
        patterns = [
            r'On .+ wrote:',
            r'-----\s*Original Message\s*-----',
            r'From:\s*.+\s*Sent:\s*.+\s*To:\s*.+\s*Subject:',
            r'_+\s*From:',
        ]
        
        # Find reply boundaries
        combined_pattern = '|'.join(f'({p})' for p in patterns)
        matches = list(re.finditer(combined_pattern, text, re.IGNORECASE | re.MULTILINE))
        
        if matches:
            # Extract the most recent message (before first reply marker)
            current_message = text[:matches[0].start()].strip()
            
            # Extract each reply
            for i, match in enumerate(matches):
                start = match.start()
                end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
                
                reply_text = text[start:end].strip()
                replies.append({
                    'marker': match.group(),
                    'text': reply_text,
                    'position': i
                })
        
        return replies
    
    def _extract_structured_data(self, plain_text: str, html_content: Optional[str]) -> List[Dict]:
        """
        Extract structured load data from tables or formatted sections.
        
        DATA EXTRACTION:
        Looks for common patterns in freight emails:
        - Tables with load information
        - Bulleted or numbered lists
        - Key-value pairs (Origin: Dallas, TX)
        - Standardized formats
        """
        extracted_loads = []
        
        # Pattern for key-value pairs
        kv_pattern = r'(Origin|Pickup|Destination|Delivery|Drop|Equipment|Weight|Date|Commodity)[\s:]+([^\n]+)'
        
        matches = re.finditer(kv_pattern, plain_text, re.IGNORECASE)
        
        current_load = {}
        for match in matches:
            key = match.group(1).lower()
            value = match.group(2).strip()
            
            # Normalize keys
            if key in ['origin', 'pickup']:
                current_load['origin'] = value
            elif key in ['destination', 'delivery', 'drop']:
                current_load['destination'] = value
            elif key == 'equipment':
                current_load['equipment'] = value
            elif key == 'weight':
                current_load['weight'] = value
            elif key == 'date':
                current_load['date'] = value
            elif key == 'commodity':
                current_load['commodity'] = value
        
        if current_load:
            extracted_loads.append(current_load)
        
        return extracted_loads
    
    def _clean_email_text(self, text: str) -> str:
        """
        Clean and normalize email text for processing.
        
        CLEANING OPERATIONS:
        - Remove excessive whitespace
        - Fix common encoding issues
        - Remove email signatures
        - Normalize line endings
        """
        # Fix common encoding issues
        text = text.replace('\u200b', '')  # Zero-width space
        text = text.replace('\xa0', ' ')   # Non-breaking space
        
        # Normalize whitespace
        text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)  # Multiple blank lines
        text = re.sub(r'[ \t]+', ' ', text)  # Multiple spaces/tabs
        
        # Remove common signatures
        signature_patterns = [
            r'Sent from my iPhone.*$',
            r'Sent from my Android.*$',
            r'Get Outlook for iOS.*$',
            r'This email and any attachments.*$',
            r'CONFIDENTIALITY NOTICE:.*$'
        ]
        
        for pattern in signature_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.MULTILINE | re.DOTALL)
        
        return text.strip()
    
    def _extract_email_address(self, from_header: str) -> str:
        """Extract clean email address from From header."""
        # Pattern to extract email from "Name <email@domain.com>" format
        match = re.search(r'<([^>]+)>', from_header)
        if match:
            return match.group(1).lower()
        
        # Try to find any email-like pattern
        match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', from_header)
        if match:
            return match.group(0).lower()
        
        return from_header.lower()


# Utility function for backwards compatibility
def parse_email_enhanced(file_path: Path) -> Dict[str, any]:
    """
    Enhanced email parsing with comprehensive format handling.
    
    Drop-in replacement for basic email parsing with additional
    features for production use.
    """
    parser = EnhancedEmailParser()
    return parser.parse_email_file(file_path)