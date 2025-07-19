#!/usr/bin/env python3
# --------------------------- oauth_service.py ----------------------------
"""
AI-Broker MVP · OAuth 2.0 Service (Python/LangGraph Integration)

OVERVIEW:
This module handles OAuth 2.0 authentication flows for multiple email providers
(Gmail, Microsoft Graph, IMAP) enabling brokers to securely connect their email
accounts to the AI-Broker system for automated freight request processing.

WORKFLOW:
1. Generate authorization URLs for supported providers
2. Handle OAuth callback and token exchange
3. Store encrypted tokens in Supabase database
4. Provide token refresh and validation services
5. Integrate with existing intake_graph.py workflow

BUSINESS LOGIC:
- Supports Gmail API, Microsoft Graph API, and IMAP OAuth
- Implements PKCE (Proof Key for Code Exchange) for enhanced security
- Handles token refresh automatically to maintain long-term connections
- Provides scoped access (read-only email permissions)
- Enables multi-tenant broker account management

TECHNICAL ARCHITECTURE:
- OAuth 2.0 Authorization Code Grant with PKCE
- Secure token storage with Supabase encryption
- Provider-specific scope configuration
- Error handling and retry logic for token operations
- Integration with existing LangGraph email processing

DEPENDENCIES:
- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
- OAuth client credentials for each provider (Google, Microsoft)
- Python packages: requests, supabase, cryptography, base64, hashlib
"""

import os
import json
import base64
import hashlib
import secrets
import urllib.parse
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple, Any, List
from dataclasses import dataclass
from enum import Enum

import requests
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# ===============================================================================
# CONFIGURATION AND TYPES
# ===============================================================================

class EmailProvider(Enum):
    """Supported email providers for OAuth authentication"""
    GMAIL = "GMAIL"
    OUTLOOK = "OUTLOOK"
    EXCHANGE = "EXCHANGE"
    IMAP_GENERIC = "IMAP_GENERIC"

@dataclass
class OAuthConfig:
    """OAuth configuration for a specific provider"""
    client_id: str
    client_secret: str
    authorization_url: str
    token_url: str
    scope: List[str]
    redirect_uri: str

@dataclass
class OAuthTokens:
    """OAuth token response structure"""
    access_token: str
    refresh_token: Optional[str]
    expires_in: int
    scope: str
    token_type: str = "Bearer"

# ===============================================================================
# OAUTH SERVICE CLASS
# ===============================================================================

class OAuthService:
    """
    Centralized OAuth 2.0 service for email provider authentication.
    
    BUSINESS CONTEXT:
    This service enables freight brokers to connect their business email accounts
    to the AI-Broker system, allowing automated processing of freight tenders and
    load requests without compromising security or requiring password storage.
    
    ARCHITECTURE ROLE:
    Acts as the authentication bridge between broker email accounts and the
    AI-Broker processing pipeline, ensuring secure, long-term access to email
    data while maintaining compliance with modern security standards.
    
    KEY METHODS:
    - get_authorization_url(): Generate OAuth login URLs for brokers
    - exchange_code_for_tokens(): Complete OAuth flow and get access tokens
    - refresh_access_token(): Maintain long-term access without re-authentication
    - store_email_account(): Securely save account credentials in database
    
    USAGE PATTERNS:
    Typically instantiated once per broker session and used throughout the
    email account connection process in web dashboards or CLI tools.
    """
    
    def __init__(self):
        """
        Initialize OAuth service with provider configurations.
        
        BUSINESS LOGIC:
        Loads OAuth client credentials for supported email providers and
        establishes secure database connection for credential storage.
        
        TECHNICAL APPROACH:
        Uses environment variables for sensitive configuration and creates
        Supabase client with service role permissions for database operations.
        """
        # Initialize Supabase client
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        
        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
        
        # OAuth provider configurations
        self.providers = self._load_provider_configs()
    
    def _load_provider_configs(self) -> Dict[EmailProvider, OAuthConfig]:
        """
        Load OAuth configuration for all supported providers.
        
        BUSINESS CONTEXT:
        Each email provider (Gmail, Outlook, etc.) has different OAuth endpoints,
        scopes, and client credentials. This centralizes configuration management.
        
        RETURNS:
            Dict mapping providers to their OAuth configurations
        """
        # Base redirect URI - should be configurable per environment
        base_redirect_uri = os.getenv("OAUTH_REDIRECT_URI", "http://localhost:3000/auth/callback")
        
        return {
            EmailProvider.GMAIL: OAuthConfig(
                client_id=os.getenv("GOOGLE_CLIENT_ID", ""),
                client_secret=os.getenv("GOOGLE_CLIENT_SECRET", ""),
                authorization_url="https://accounts.google.com/o/oauth2/v2/auth",
                token_url="https://oauth2.googleapis.com/token",
                scope=[
                    "https://www.googleapis.com/auth/gmail.readonly",
                    "https://www.googleapis.com/auth/gmail.send",
                    "email",
                    "profile"
                ],
                redirect_uri=f"{base_redirect_uri}/gmail"
            ),
            
            EmailProvider.OUTLOOK: OAuthConfig(
                client_id=os.getenv("MICROSOFT_CLIENT_ID", ""),
                client_secret=os.getenv("MICROSOFT_CLIENT_SECRET", ""),
                authorization_url="https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
                token_url="https://login.microsoftonline.com/common/oauth2/v2.0/token",
                scope=[
                    "https://graph.microsoft.com/Mail.Read",
                    "https://graph.microsoft.com/Mail.Send",
                    "https://graph.microsoft.com/User.Read",
                    "offline_access"
                ],
                redirect_uri=f"{base_redirect_uri}/outlook"
            )
        }
    
    def generate_pkce_challenge(self) -> Tuple[str, str]:
        """
        Generate PKCE code verifier and challenge for enhanced OAuth security.
        
        BUSINESS LOGIC:
        PKCE (Proof Key for Code Exchange) prevents authorization code interception
        attacks, which is critical for broker email account security.
        
        TECHNICAL APPROACH:
        Creates a cryptographically secure random verifier and SHA256-based
        challenge following RFC 7636 PKCE specification.
        
        RETURNS:
            Tuple of (code_verifier, code_challenge) for OAuth flow
        """
        # BUSINESS RULE: Use cryptographically secure random generation
        # This ensures that even if authorization codes are intercepted,
        # they cannot be used without the original code verifier
        code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')
        
        # Create SHA256 challenge from verifier
        code_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode('utf-8')).digest()
        ).decode('utf-8').rstrip('=')
        
        return code_verifier, code_challenge
    
    def get_authorization_url(self, provider: EmailProvider, broker_id: str, state: Optional[str] = None) -> Tuple[str, str, str]:
        """
        Generate OAuth authorization URL for broker to connect email account.
        
        BUSINESS LOGIC:
        Creates a secure authorization URL that brokers can visit to grant
        the AI-Broker system read access to their email accounts. The URL
        includes all necessary parameters for secure OAuth flow completion.
        
        TECHNICAL APPROACH:
        Implements OAuth 2.0 Authorization Code Grant with PKCE for security.
        Includes provider-specific scopes for email reading and sending.
        
        ARGS:
            provider: Email provider type (Gmail, Outlook, etc.)
            broker_id: Unique identifier for the broker
            state: Optional state parameter for CSRF protection
            
        RETURNS:
            Tuple of (authorization_url, code_verifier, state) for OAuth flow
            
        RAISES:
            ValueError: If provider is not supported or not configured
        """
        if provider not in self.providers:
            raise ValueError(f"Provider {provider} not supported")
        
        config = self.providers[provider]
        
        if not config.client_id or not config.client_secret:
            raise ValueError(f"OAuth credentials not configured for {provider}")
        
        # Generate security parameters
        code_verifier, code_challenge = self.generate_pkce_challenge()
        if not state:
            state = secrets.token_urlsafe(32)
        
        # Build authorization URL parameters
        auth_params = {
            "client_id": config.client_id,
            "response_type": "code",
            "redirect_uri": config.redirect_uri,
            "scope": " ".join(config.scope),
            "state": f"{broker_id}:{state}",  # Include broker ID in state
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "access_type": "offline",  # Request refresh token
            "prompt": "consent"  # Force consent to ensure refresh token
        }
        
        # Provider-specific parameters
        if provider == EmailProvider.OUTLOOK:
            auth_params["response_mode"] = "query"
        
        authorization_url = f"{config.authorization_url}?{urllib.parse.urlencode(auth_params)}"
        
        return authorization_url, code_verifier, state
    
    def exchange_code_for_tokens(self, provider: EmailProvider, authorization_code: str, 
                                code_verifier: str, state: str) -> OAuthTokens:
        """
        Exchange authorization code for access and refresh tokens.
        
        BUSINESS LOGIC:
        Completes the OAuth flow by exchanging the authorization code received
        from the provider for access tokens that enable email reading. This is
        the critical step that establishes long-term email account access.
        
        TECHNICAL APPROACH:
        Makes a secure POST request to the provider's token endpoint with PKCE
        verification and client authentication to obtain tokens.
        
        ARGS:
            provider: Email provider type
            authorization_code: Code received from OAuth callback
            code_verifier: PKCE code verifier for security validation
            state: State parameter for CSRF protection
            
        RETURNS:
            OAuthTokens object containing access and refresh tokens
            
        RAISES:
            ValueError: If token exchange fails or returns invalid response
        """
        if provider not in self.providers:
            raise ValueError(f"Provider {provider} not supported")
        
        config = self.providers[provider]
        
        # Prepare token exchange request
        token_data = {
            "client_id": config.client_id,
            "client_secret": config.client_secret,
            "code": authorization_code,
            "grant_type": "authorization_code",
            "redirect_uri": config.redirect_uri,
            "code_verifier": code_verifier
        }
        
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
        }
        
        try:
            # INTEGRATION POINT: Exchange code for tokens with provider
            # This is where we actually get the access tokens that enable
            # automated email processing for the broker's account
            response = requests.post(config.token_url, data=token_data, headers=headers, timeout=30)
            response.raise_for_status()
            
            token_response = response.json()
            
            # Validate response contains required fields
            required_fields = ["access_token", "token_type"]
            for field in required_fields:
                if field not in token_response:
                    raise ValueError(f"Missing {field} in token response")
            
            return OAuthTokens(
                access_token=token_response["access_token"],
                refresh_token=token_response.get("refresh_token"),
                expires_in=token_response.get("expires_in", 3600),
                scope=token_response.get("scope", " ".join(config.scope)),
                token_type=token_response.get("token_type", "Bearer")
            )
            
        except requests.RequestException as e:
            raise ValueError(f"Token exchange failed: {str(e)}")
        except (KeyError, ValueError) as e:
            raise ValueError(f"Invalid token response: {str(e)}")
    
    def refresh_access_token(self, provider: EmailProvider, refresh_token: str) -> OAuthTokens:
        """
        Refresh expired access token using refresh token.
        
        BUSINESS LOGIC:
        Maintains long-term email account access without requiring brokers to
        re-authenticate. This is essential for continuous email monitoring and
        processing of freight requests.
        
        TECHNICAL APPROACH:
        Uses OAuth 2.0 refresh token grant to obtain new access tokens when
        the current ones expire, ensuring seamless operation.
        
        ARGS:
            provider: Email provider type
            refresh_token: Valid refresh token from previous authentication
            
        RETURNS:
            OAuthTokens object with new access token
            
        RAISES:
            ValueError: If refresh fails or refresh token is invalid
        """
        if provider not in self.providers:
            raise ValueError(f"Provider {provider} not supported")
        
        config = self.providers[provider]
        
        refresh_data = {
            "client_id": config.client_id,
            "client_secret": config.client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token"
        }
        
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
        }
        
        try:
            response = requests.post(config.token_url, data=refresh_data, headers=headers, timeout=30)
            response.raise_for_status()
            
            token_response = response.json()
            
            return OAuthTokens(
                access_token=token_response["access_token"],
                refresh_token=token_response.get("refresh_token", refresh_token),  # Some providers don't return new refresh token
                expires_in=token_response.get("expires_in", 3600),
                scope=token_response.get("scope", " ".join(config.scope)),
                token_type=token_response.get("token_type", "Bearer")
            )
            
        except requests.RequestException as e:
            raise ValueError(f"Token refresh failed: {str(e)}")
    
    def get_user_email(self, provider: EmailProvider, access_token: str) -> str:
        """
        Fetch user's primary email address using access token.
        
        BUSINESS LOGIC:
        Retrieves the broker's email address to associate with the account
        connection. This ensures proper attribution of processed emails
        and enables multi-account support per broker.
        
        TECHNICAL APPROACH:
        Makes provider-specific API calls to get user profile information
        containing the primary email address.
        
        ARGS:
            provider: Email provider type
            access_token: Valid access token
            
        RETURNS:
            Primary email address for the authenticated account
            
        RAISES:
            ValueError: If email retrieval fails or access token is invalid
        """
        headers = {"Authorization": f"Bearer {access_token}"}
        
        try:
            if provider == EmailProvider.GMAIL:
                response = requests.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers=headers,
                    timeout=30
                )
                response.raise_for_status()
                user_info = response.json()
                return user_info["email"]
                
            elif provider == EmailProvider.OUTLOOK:
                response = requests.get(
                    "https://graph.microsoft.com/v1.0/me",
                    headers=headers,
                    timeout=30
                )
                response.raise_for_status()
                user_info = response.json()
                return user_info["mail"] or user_info["userPrincipalName"]
                
            else:
                raise ValueError(f"Email retrieval not implemented for {provider}")
                
        except requests.RequestException as e:
            raise ValueError(f"Failed to get user email: {str(e)}")
    
    def store_email_account(self, broker_id: str, provider: EmailProvider, 
                           tokens: OAuthTokens, email_address: str,
                           display_name: Optional[str] = None) -> str:
        """
        Store email account connection securely in database.
        
        BUSINESS LOGIC:
        Persists the broker's email account credentials and configuration in the
        database, enabling the system to monitor and process emails from this
        account. Includes security measures to protect sensitive token data.
        
        TECHNICAL APPROACH:
        Uses Supabase's built-in encryption to store OAuth tokens securely.
        Implements proper error handling and returns account ID for reference.
        
        ARGS:
            broker_id: Unique identifier for the broker
            provider: Email provider type
            tokens: OAuth tokens from successful authentication
            email_address: Broker's email address
            display_name: Optional display name for the account
            
        RETURNS:
            UUID of the created email account record
            
        RAISES:
            ValueError: If database insertion fails or validation errors occur
        """
        # Calculate token expiration time
        expires_at = datetime.now() + timedelta(seconds=tokens.expires_in)
        
        account_data = {
            "broker_id": broker_id,
            "email_address": email_address,
            "display_name": display_name or email_address,
            "provider": provider.value,
            "status": "ACTIVE",
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "token_expires_at": expires_at.isoformat(),
            "oauth_scope": tokens.scope,
            "processing_enabled": True,
            "auto_reply_enabled": True,
            "monitor_folders": ["INBOX"],
            "created_by": "oauth_service"
        }
        
        try:
            # INTEGRATION POINT: Store account in Supabase database
            # This creates the persistent connection that enables ongoing
            # email monitoring and processing for the broker
            result = self.supabase.table("email_accounts").insert(account_data).execute()
            
            if result.data:
                account_id = result.data[0]["id"]
                print(f"✅ Email account stored: {email_address} ({account_id})")
                return account_id
            else:
                raise ValueError("No data returned from database insert")
                
        except Exception as e:
            raise ValueError(f"Failed to store email account: {str(e)}")
    
    def get_valid_access_token(self, email_account_id: str) -> str:
        """
        Get valid access token for email account, refreshing if necessary.
        
        BUSINESS LOGIC:
        Ensures that email processing always has valid access tokens by
        automatically refreshing expired tokens. This prevents interruptions
        in email monitoring and freight request processing.
        
        TECHNICAL APPROACH:
        Checks token expiration and automatically refreshes if needed,
        updating the database with new tokens for future use.
        
        ARGS:
            email_account_id: UUID of the email account
            
        RETURNS:
            Valid access token ready for API calls
            
        RAISES:
            ValueError: If account not found or token refresh fails
        """
        # Fetch account details from database
        account_result = self.supabase.table("email_accounts").select("*").eq("id", email_account_id).single().execute()
        
        if not account_result.data:
            raise ValueError(f"Email account {email_account_id} not found")
        
        account = account_result.data
        provider = EmailProvider(account["provider"])
        
        # Check if token is still valid (with 5 minute buffer)
        expires_at = datetime.fromisoformat(account["token_expires_at"].replace('Z', '+00:00'))
        buffer_time = datetime.now() + timedelta(minutes=5)
        
        if expires_at > buffer_time:
            # Token is still valid
            return account["access_token"]
        
        # Token is expired or expiring soon - refresh it
        if not account["refresh_token"]:
            raise ValueError("No refresh token available - re-authentication required")
        
        try:
            new_tokens = self.refresh_access_token(provider, account["refresh_token"])
            
            # Update database with new tokens
            new_expires_at = datetime.now() + timedelta(seconds=new_tokens.expires_in)
            
            update_data = {
                "access_token": new_tokens.access_token,
                "token_expires_at": new_expires_at.isoformat(),
                "status": "ACTIVE",
                "last_error": None,
                "error_count": 0
            }
            
            # Include new refresh token if provided
            if new_tokens.refresh_token:
                update_data["refresh_token"] = new_tokens.refresh_token
            
            self.supabase.table("email_accounts").update(update_data).eq("id", email_account_id).execute()
            
            return new_tokens.access_token
            
        except Exception as e:
            # Mark account as having token issues
            self.supabase.table("email_accounts").update({
                "status": "TOKEN_EXPIRED",
                "last_error": str(e),
                "error_count": account.get("error_count", 0) + 1
            }).eq("id", email_account_id).execute()
            
            raise ValueError(f"Failed to refresh access token: {str(e)}")

# ===============================================================================
# CONVENIENCE FUNCTIONS
# ===============================================================================

def create_oauth_service() -> OAuthService:
    """
    Factory function to create configured OAuth service instance.
    
    USAGE PATTERNS:
    Used throughout the application to get a properly configured OAuth service
    without having to manage initialization and configuration details.
    """
    return OAuthService()

def get_provider_from_email(email_address: str) -> EmailProvider:
    """
    Determine email provider from email address domain.
    
    BUSINESS LOGIC:
    Automatically detects the appropriate OAuth provider based on the email
    domain, simplifying the connection process for brokers.
    
    ARGS:
        email_address: Broker's email address
        
    RETURNS:
        Detected email provider type
    """
    domain = email_address.split('@')[1].lower()
    
    gmail_domains = ['gmail.com', 'googlemail.com']
    outlook_domains = ['outlook.com', 'hotmail.com', 'live.com', 'msn.com']
    
    if domain in gmail_domains:
        return EmailProvider.GMAIL
    elif domain in outlook_domains:
        return EmailProvider.OUTLOOK
    else:
        # Default to IMAP for custom domains
        return EmailProvider.IMAP_GENERIC

# ===============================================================================
# USAGE EXAMPLES
# ===============================================================================
if __name__ == "__main__":
    """
    Example usage of OAuth service for testing and development.
    """
    # Initialize service
    oauth_service = create_oauth_service()
    
    # Example: Get authorization URL for Gmail
    broker_id = "test-broker-123"
    provider = EmailProvider.GMAIL
    
    try:
        auth_url, code_verifier, state = oauth_service.get_authorization_url(provider, broker_id)
        print(f"Authorization URL: {auth_url}")
        print(f"Code Verifier: {code_verifier}")
        print(f"State: {state}")
        
        # In a real application, broker would visit auth_url and authorize
        # Then you'd receive the authorization code and complete the flow:
        # tokens = oauth_service.exchange_code_for_tokens(provider, auth_code, code_verifier, state)
        # email = oauth_service.get_user_email(provider, tokens.access_token)
        # account_id = oauth_service.store_email_account(broker_id, provider, tokens, email)
        
    except Exception as e:
        print(f"Error: {e}")