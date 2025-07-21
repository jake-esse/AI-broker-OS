#!/usr/bin/env python3
# --------------------------- broker_dashboard.py ----------------------------
"""
AI-Broker MVP · Broker Email Management Dashboard (Streamlit Interface)

OVERVIEW:
This is a simple web dashboard that allows freight brokers to manage their
email account connections, view processing logs, and configure email
settings for the AI-Broker system. Built with Streamlit for rapid development.

WORKFLOW:
1. Broker authentication and account selection
2. Email account connection management (OAuth flows)
3. Processing log monitoring and troubleshooting
4. Email filtering and notification settings
5. System status and health monitoring

BUSINESS LOGIC:
- Self-service email account connection via OAuth
- Real-time monitoring of email processing
- Configuration of business rules and filters
- Audit trail and compliance reporting
- Performance metrics and analytics

TECHNICAL ARCHITECTURE:
- Streamlit web framework for rapid UI development
- Integration with oauth_service.py for authentication
- Direct Supabase database queries for data display
- Real-time updates via Supabase subscriptions
- Responsive design for mobile and desktop use

DEPENDENCIES:
- streamlit, pandas, plotly for UI and visualization
- oauth_service.py for email account management
- Supabase client for database operations
- Environment variables for configuration
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import json
import os

# Set page configuration
st.set_page_config(
    page_title="AI-Broker Email Dashboard",
    page_icon="📧",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Import custom modules
try:
    from src.services.email.oauth import OAuthService, EmailProvider, create_oauth_service
    from supabase import create_client
    from dotenv import load_dotenv
    
    load_dotenv()
    OAUTH_AVAILABLE = True
except ImportError as e:
    st.error(f"Required modules not available: {e}")
    st.stop()

# ===============================================================================
# CONFIGURATION AND INITIALIZATION
# ===============================================================================

@st.cache_resource
def init_services():
    """Initialize OAuth service and Supabase client."""
    try:
        # Initialize Supabase client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            st.error("Supabase configuration missing. Check environment variables.")
            st.stop()
        
        supabase = create_client(supabase_url, supabase_key)
        
        # Initialize OAuth service
        oauth_service = create_oauth_service()
        
        return supabase, oauth_service
    
    except Exception as e:
        st.error(f"Failed to initialize services: {e}")
        st.stop()

# Initialize services
supabase, oauth_service = init_services()

# ===============================================================================
# AUTHENTICATION AND SESSION MANAGEMENT
# ===============================================================================

def initialize_session_state():
    """Initialize Streamlit session state variables."""
    if 'broker_id' not in st.session_state:
        st.session_state.broker_id = "demo-broker-123"  # Demo broker ID
    
    if 'selected_account' not in st.session_state:
        st.session_state.selected_account = None
    
    if 'oauth_flow_state' not in st.session_state:
        st.session_state.oauth_flow_state = {}

def simulate_broker_login():
    """Simulate broker authentication (replace with real auth in production)."""
    st.sidebar.header("🔐 Broker Authentication")
    
    # Demo broker selection
    broker_options = {
        "demo-broker-123": "Demo Broker (Test Account)",
        "broker-abc-456": "ABC Freight Solutions", 
        "broker-xyz-789": "XYZ Logistics Corp"
    }
    
    selected_broker = st.sidebar.selectbox(
        "Select Broker Account:",
        options=list(broker_options.keys()),
        format_func=lambda x: broker_options[x],
        index=0
    )
    
    st.session_state.broker_id = selected_broker
    
    st.sidebar.success(f"✅ Logged in as: {broker_options[selected_broker]}")
    
    return selected_broker

# ===============================================================================
# EMAIL ACCOUNT MANAGEMENT
# ===============================================================================

@st.cache_data(ttl=60)  # Cache for 1 minute
def load_email_accounts(broker_id: str) -> pd.DataFrame:
    """Load email accounts for the current broker."""
    try:
        response = supabase.table("email_accounts").select("*").eq("broker_id", broker_id).execute()
        
        if response.data:
            df = pd.DataFrame(response.data)
            # Format datetime columns
            for col in ['created_at', 'updated_at', 'last_sync_at', 'token_expires_at']:
                if col in df.columns:
                    df[col] = pd.to_datetime(df[col])
            return df
        else:
            return pd.DataFrame()
            
    except Exception as e:
        st.error(f"Failed to load email accounts: {e}")
        return pd.DataFrame()

def display_email_accounts(broker_id: str):
    """Display email accounts management interface."""
    st.header("📧 Email Account Management")
    
    # Load accounts
    accounts_df = load_email_accounts(broker_id)
    
    # Add new account section
    with st.expander("➕ Connect New Email Account", expanded=len(accounts_df) == 0):
        col1, col2 = st.columns(2)
        
        with col1:
            provider_options = {
                "GMAIL": "Gmail (Google Workspace)",
                "OUTLOOK": "Outlook (Microsoft 365)",
                "IMAP_GENERIC": "IMAP (Other Providers)"
            }
            
            selected_provider = st.selectbox(
                "Email Provider:",
                options=list(provider_options.keys()),
                format_func=lambda x: provider_options[x]
            )
        
        with col2:
            email_address = st.text_input(
                "Email Address:",
                placeholder="your.email@company.com"
            )
        
        if st.button("🔗 Connect Account", type="primary"):
            if email_address and selected_provider:
                connect_email_account(broker_id, EmailProvider(selected_provider), email_address)
            else:
                st.warning("Please enter an email address and select a provider.")
    
    # Display existing accounts
    if len(accounts_df) > 0:
        st.subheader("Connected Email Accounts")
        
        # Account status overview
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            active_count = len(accounts_df[accounts_df['status'] == 'ACTIVE'])
            st.metric("Active Accounts", active_count)
        
        with col2:
            total_count = len(accounts_df)
            st.metric("Total Accounts", total_count)
        
        with col3:
            processing_enabled = len(accounts_df[accounts_df['processing_enabled'] == True])
            st.metric("Processing Enabled", processing_enabled)
        
        with col4:
            error_count = len(accounts_df[accounts_df['status'] == 'ERROR'])
            st.metric("Accounts with Errors", error_count)
        
        # Account details table
        display_accounts_table(accounts_df)
    
    else:
        st.info("No email accounts connected yet. Connect your first account to get started!")

def display_accounts_table(accounts_df: pd.DataFrame):
    """Display accounts in an interactive table."""
    # Prepare display data
    display_df = accounts_df.copy()
    
    # Format columns for display
    display_columns = [
        'email_address', 'provider', 'status', 'processing_enabled',
        'last_sync_at', 'created_at'
    ]
    
    display_df = display_df[display_columns].copy()
    display_df.columns = [
        'Email Address', 'Provider', 'Status', 'Processing', 
        'Last Sync', 'Connected'
    ]
    
    # Color code status
    def color_status(val):
        if val == 'ACTIVE':
            return 'background-color: #d4edda'
        elif val == 'ERROR':
            return 'background-color: #f8d7da'
        elif val == 'TOKEN_EXPIRED':
            return 'background-color: #fff3cd'
        else:
            return 'background-color: #e2e3e5'
    
    styled_df = display_df.style.applymap(color_status, subset=['Status'])
    
    st.dataframe(styled_df, use_container_width=True)
    
    # Account management actions
    if len(accounts_df) > 0:
        st.subheader("Account Actions")
        
        selected_email = st.selectbox(
            "Select account for actions:",
            options=accounts_df['email_address'].tolist()
        )
        
        if selected_email:
            account_info = accounts_df[accounts_df['email_address'] == selected_email].iloc[0]
            
            col1, col2, col3, col4 = st.columns(4)
            
            with col1:
                if st.button("🔄 Refresh Token"):
                    refresh_account_token(account_info['id'])
            
            with col2:
                if st.button("⏸️ Disable Processing"):
                    toggle_account_processing(account_info['id'], False)
            
            with col3:
                if st.button("▶️ Enable Processing"):
                    toggle_account_processing(account_info['id'], True)
            
            with col4:
                if st.button("🗑️ Remove Account", type="secondary"):
                    remove_email_account(account_info['id'])

def connect_email_account(broker_id: str, provider: EmailProvider, email_address: str):
    """Initiate OAuth flow to connect an email account."""
    try:
        if provider in [EmailProvider.GMAIL, EmailProvider.OUTLOOK]:
            # Generate OAuth authorization URL
            auth_url, code_verifier, state = oauth_service.get_authorization_url(provider, broker_id)
            
            # Store OAuth state in session
            st.session_state.oauth_flow_state = {
                'provider': provider.value,
                'email_address': email_address,
                'code_verifier': code_verifier,
                'state': state
            }
            
            st.success("OAuth authorization URL generated!")
            st.info("In a real application, you would be redirected to the provider's OAuth page.")
            st.code(auth_url)
            
            # For demo purposes, simulate successful OAuth completion
            st.warning("🚧 Demo Mode: OAuth flow simulation")
            if st.button("Simulate Successful OAuth"):
                simulate_oauth_completion(broker_id, provider, email_address)
        
        else:
            # IMAP configuration
            display_imap_configuration(broker_id, email_address)
    
    except Exception as e:
        st.error(f"Failed to start OAuth flow: {e}")

def simulate_oauth_completion(broker_id: str, provider: EmailProvider, email_address: str):
    """Simulate successful OAuth completion for demo purposes."""
    try:
        # Create mock OAuth tokens
        from src.services.email.oauth import OAuthTokens
        
        mock_tokens = OAuthTokens(
            access_token=f"mock_access_token_{provider.value.lower()}",
            refresh_token=f"mock_refresh_token_{provider.value.lower()}",
            expires_in=3600,
            scope="read write",
            token_type="Bearer"
        )
        
        # Store account in database
        account_id = oauth_service.store_email_account(
            broker_id=broker_id,
            provider=provider,
            tokens=mock_tokens,
            email_address=email_address
        )
        
        st.success(f"✅ Successfully connected {email_address}!")
        st.success(f"Account ID: {account_id}")
        
        # Clear cache to refresh data
        st.cache_data.clear()
        st.rerun()
    
    except Exception as e:
        st.error(f"Failed to complete OAuth flow: {e}")

def display_imap_configuration(broker_id: str, email_address: str):
    """Display IMAP configuration form."""
    st.subheader("IMAP Configuration")
    
    with st.form("imap_config"):
        col1, col2 = st.columns(2)
        
        with col1:
            imap_host = st.text_input("IMAP Host:", placeholder="imap.gmail.com")
            imap_port = st.number_input("IMAP Port:", value=993, min_value=1, max_value=65535)
        
        with col2:
            imap_username = st.text_input("Username:", value=email_address)
            imap_password = st.text_input("App Password:", type="password")
        
        use_tls = st.checkbox("Use TLS/SSL", value=True)
        
        submitted = st.form_submit_button("Connect IMAP Account")
        
        if submitted:
            if all([imap_host, imap_port, imap_username, imap_password]):
                save_imap_account(broker_id, email_address, imap_host, imap_port, 
                                imap_username, imap_password, use_tls)
            else:
                st.error("Please fill in all IMAP configuration fields.")

def save_imap_account(broker_id: str, email_address: str, host: str, port: int, 
                     username: str, password: str, use_tls: bool):
    """Save IMAP account configuration to database."""
    try:
        account_data = {
            "broker_id": broker_id,
            "email_address": email_address,
            "provider": "IMAP_GENERIC",
            "status": "ACTIVE",
            "imap_host": host,
            "imap_port": port,
            "imap_username": username,
            "imap_password": password,
            "imap_use_tls": use_tls,
            "processing_enabled": True,
            "monitor_folders": ["INBOX"]
        }
        
        result = supabase.table("email_accounts").insert(account_data).execute()
        
        if result.data:
            st.success(f"✅ Successfully connected IMAP account: {email_address}")
            st.cache_data.clear()
            st.rerun()
        else:
            st.error("Failed to save IMAP account configuration.")
    
    except Exception as e:
        st.error(f"Error saving IMAP account: {e}")

def refresh_account_token(account_id: str):
    """Refresh OAuth token for an account."""
    try:
        # In a real implementation, this would call the OAuth refresh logic
        st.info("🔄 Token refresh functionality would be implemented here.")
        st.success("Token refresh completed (simulated)")
    except Exception as e:
        st.error(f"Failed to refresh token: {e}")

def toggle_account_processing(account_id: str, enabled: bool):
    """Toggle email processing for an account."""
    try:
        result = supabase.table("email_accounts").update({
            "processing_enabled": enabled
        }).eq("id", account_id).execute()
        
        if result.data:
            status = "enabled" if enabled else "disabled"
            st.success(f"✅ Email processing {status} for account")
            st.cache_data.clear()
            st.rerun()
        else:
            st.error("Failed to update account settings")
    
    except Exception as e:
        st.error(f"Error updating account: {e}")

def remove_email_account(account_id: str):
    """Remove an email account."""
    try:
        # Confirmation dialog
        if st.button("⚠️ Confirm Removal", type="secondary"):
            result = supabase.table("email_accounts").delete().eq("id", account_id).execute()
            
            if result.data:
                st.success("✅ Email account removed successfully")
                st.cache_data.clear()
                st.rerun()
            else:
                st.error("Failed to remove email account")
    
    except Exception as e:
        st.error(f"Error removing account: {e}")

# ===============================================================================
# EMAIL PROCESSING MONITORING
# ===============================================================================

@st.cache_data(ttl=60)
def load_processing_logs(broker_id: str, days: int = 7) -> pd.DataFrame:
    """Load email processing logs for monitoring."""
    try:
        # Calculate date range
        start_date = (datetime.now() - timedelta(days=days)).isoformat()
        
        response = supabase.table("email_processing_log").select("*").eq(
            "broker_id", broker_id
        ).gte("processed_at", start_date).order("processed_at", desc=True).execute()
        
        if response.data:
            df = pd.DataFrame(response.data)
            df['processed_at'] = pd.to_datetime(df['processed_at'])
            return df
        else:
            return pd.DataFrame()
    
    except Exception as e:
        st.error(f"Failed to load processing logs: {e}")
        return pd.DataFrame()

def display_processing_monitoring(broker_id: str):
    """Display email processing monitoring dashboard."""
    st.header("📊 Email Processing Monitor")
    
    # Time range selector
    time_range = st.selectbox(
        "Time Range:",
        options=[1, 7, 30, 90],
        index=1,
        format_func=lambda x: f"Last {x} day{'s' if x > 1 else ''}"
    )
    
    # Load processing logs
    logs_df = load_processing_logs(broker_id, time_range)
    
    if len(logs_df) > 0:
        # Processing metrics
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            total_processed = len(logs_df)
            st.metric("Total Emails", total_processed)
        
        with col2:
            successful = len(logs_df[logs_df['processing_status'] == 'SUCCESS'])
            success_rate = (successful / total_processed * 100) if total_processed > 0 else 0
            st.metric("Success Rate", f"{success_rate:.1f}%")
        
        with col3:
            loads_created = len(logs_df[logs_df['load_id'].notna()])
            st.metric("Loads Created", loads_created)
        
        with col4:
            avg_confidence = logs_df['extraction_confidence'].mean() if 'extraction_confidence' in logs_df.columns else 0
            st.metric("Avg Confidence", f"{avg_confidence:.2f}" if avg_confidence else "N/A")
        
        # Processing timeline chart
        st.subheader("Processing Timeline")
        
        if len(logs_df) > 0:
            # Group by hour for timeline
            logs_df['hour'] = logs_df['processed_at'].dt.floor('H')
            hourly_stats = logs_df.groupby(['hour', 'processing_status']).size().reset_index(name='count')
            
            fig = px.bar(
                hourly_stats, 
                x='hour', 
                y='count',
                color='processing_status',
                title="Email Processing Timeline",
                color_discrete_map={
                    'SUCCESS': '#28a745',
                    'ERROR': '#dc3545', 
                    'PROCESSING': '#ffc107'
                }
            )
            
            st.plotly_chart(fig, use_container_width=True)
        
        # Intent classification breakdown
        if 'intent_classification' in logs_df.columns:
            st.subheader("Email Classification Breakdown")
            
            intent_counts = logs_df['intent_classification'].value_counts()
            
            if len(intent_counts) > 0:
                fig = px.pie(
                    values=intent_counts.values,
                    names=intent_counts.index,
                    title="Email Intent Classification"
                )
                st.plotly_chart(fig, use_container_width=True)
        
        # Recent processing log
        st.subheader("Recent Processing Activity")
        
        # Display recent logs
        display_columns = [
            'processed_at', 'sender_email', 'subject', 'processing_status',
            'intent_classification', 'extraction_confidence'
        ]
        
        recent_logs = logs_df[display_columns].head(20).copy()
        recent_logs.columns = [
            'Processed At', 'Sender', 'Subject', 'Status',
            'Classification', 'Confidence'
        ]
        
        st.dataframe(recent_logs, use_container_width=True)
    
    else:
        st.info("No email processing activity found for the selected time range.")

# ===============================================================================
# SYSTEM STATUS AND HEALTH
# ===============================================================================

def display_system_status():
    """Display system status and health monitoring."""
    st.header("🔧 System Status")
    
    # Service health checks
    col1, col2, col3 = st.columns(3)
    
    with col1:
        # Database connectivity
        try:
            response = supabase.table("email_accounts").select("id").limit(1).execute()
            db_status = "✅ Connected" if response else "❌ Error"
        except:
            db_status = "❌ Error"
        
        st.metric("Database", db_status)
    
    with col2:
        # OAuth service
        try:
            oauth_service.providers
            oauth_status = "✅ Ready"
        except:
            oauth_status = "❌ Error"
        
        st.metric("OAuth Service", oauth_status)
    
    with col3:
        # Environment configuration
        required_vars = ['SUPABASE_URL', 'OPENAI_API_KEY', 'RESEND_API_KEY']
        missing_vars = [var for var in required_vars if not os.getenv(var)]
        
        if not missing_vars:
            config_status = "✅ Complete"
        else:
            config_status = f"⚠️ {len(missing_vars)} missing"
        
        st.metric("Configuration", config_status)
    
    # Configuration details
    with st.expander("📋 Configuration Details"):
        st.write("**Environment Variables:**")
        
        config_info = {
            "Supabase URL": os.getenv("SUPABASE_URL", "Not set"),
            "OpenAI API Key": "Set" if os.getenv("OPENAI_API_KEY") else "Not set",
            "Resend API Key": "Set" if os.getenv("RESEND_API_KEY") else "Not set",
            "Google Client ID": "Set" if os.getenv("GOOGLE_CLIENT_ID") else "Not set",
            "Microsoft Client ID": "Set" if os.getenv("MICROSOFT_CLIENT_ID") else "Not set"
        }
        
        for key, value in config_info.items():
            st.write(f"- **{key}**: {value}")

# ===============================================================================
# MAIN APPLICATION
# ===============================================================================

def main():
    """Main application entry point."""
    initialize_session_state()
    
    # App header
    st.title("🤖 AI-Broker Email Management Dashboard")
    st.markdown("Manage your email integrations and monitor freight load processing")
    
    # Sidebar navigation
    broker_id = simulate_broker_login()
    
    st.sidebar.markdown("---")
    
    # Navigation menu
    page = st.sidebar.radio(
        "Navigation:",
        ["📧 Email Accounts", "📊 Processing Monitor", "🔧 System Status"],
        index=0
    )
    
    # Display selected page
    if page == "📧 Email Accounts":
        display_email_accounts(broker_id)
    
    elif page == "📊 Processing Monitor":
        display_processing_monitoring(broker_id)
    
    elif page == "🔧 System Status":
        display_system_status()
    
    # Footer
    st.sidebar.markdown("---")
    st.sidebar.markdown("**AI-Broker MVP** v1.0")
    st.sidebar.markdown("Built with ❤️ for freight brokers")

if __name__ == "__main__":
    main()