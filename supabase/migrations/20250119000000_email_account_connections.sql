-- ===============================================================================
-- AI-Broker MVP · Multi-Tenant Email Account Connections Migration
-- ===============================================================================
--
-- BUSINESS PURPOSE:
-- This migration enables brokers to connect their own email accounts (Gmail, 
-- Outlook, IMAP) to the AI-Broker system. Each broker can connect multiple email
-- accounts and the system will monitor them for incoming freight requests.
--
-- SECURITY ARCHITECTURE:
-- - OAuth tokens are encrypted at rest using Supabase's built-in encryption
-- - Row Level Security (RLS) ensures brokers only access their own connections
-- - Refresh tokens enable long-term access without storing passwords
-- - Provider-specific scopes limit access to email reading only
--
-- TECHNICAL ARCHITECTURE:
-- - Supports Gmail API, Microsoft Graph API, and IMAP connections
-- - Webhook subscriptions for real-time notifications (Gmail/Outlook)
-- - Polling configuration for IMAP and providers without webhooks
-- - Email processing state tracking and error handling
-- - Audit logging for compliance and debugging
--
-- INTEGRATION POINTS:
-- - Links to existing loads table via source_email_account_id
-- - Triggers pg_notify for real-time email processing
-- - Supports the existing intake_graph.py workflow
-- ===============================================================================

-- Create enum for supported email providers
CREATE TYPE email_provider AS ENUM (
    'GMAIL',
    'OUTLOOK', 
    'EXCHANGE',
    'IMAP_GENERIC',
    'YAHOO',
    'CUSTOM'
);

-- Create enum for connection status
CREATE TYPE connection_status AS ENUM (
    'ACTIVE',
    'INACTIVE', 
    'ERROR',
    'TOKEN_EXPIRED',
    'AUTHORIZATION_REQUIRED'
);

-- ===============================================================================
-- EMAIL ACCOUNTS TABLE
-- ===============================================================================
-- Stores OAuth connections and IMAP configurations for broker email accounts

CREATE TABLE email_accounts (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Broker association (multi-tenant support)
    broker_id UUID NOT NULL, -- Links to future brokers/users table
    
    -- Email account details
    email_address TEXT NOT NULL,
    display_name TEXT,
    provider email_provider NOT NULL,
    
    -- Connection status and health
    status connection_status NOT NULL DEFAULT 'AUTHORIZATION_REQUIRED',
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    
    -- OAuth 2.0 credentials (encrypted by Supabase)
    access_token TEXT, -- Current access token
    refresh_token TEXT, -- Long-term refresh token
    token_expires_at TIMESTAMPTZ, -- When access token expires
    oauth_scope TEXT, -- Granted permissions scope
    
    -- Provider-specific configuration
    client_id TEXT, -- OAuth client ID (can be shared or custom)
    tenant_id TEXT, -- Microsoft tenant ID for enterprise accounts
    
    -- IMAP configuration (for non-OAuth providers)
    imap_host TEXT,
    imap_port INTEGER,
    imap_use_tls BOOLEAN DEFAULT true,
    imap_username TEXT,
    imap_password TEXT, -- Encrypted app password or OAuth token
    
    -- Webhook subscription details
    webhook_subscription_id TEXT, -- Provider subscription ID
    webhook_secret TEXT, -- Webhook validation secret
    webhook_expires_at TIMESTAMPTZ, -- When webhook subscription expires
    
    -- Email processing configuration
    monitor_folders TEXT[] DEFAULT ARRAY['INBOX'], -- Folders to monitor
    processing_enabled BOOLEAN DEFAULT true,
    auto_reply_enabled BOOLEAN DEFAULT true, -- Enable missing info responses
    
    -- Filtering and rules
    sender_whitelist TEXT[], -- Only process emails from these senders
    sender_blacklist TEXT[], -- Never process emails from these senders
    subject_filters TEXT[], -- Keywords to look for in subject lines
    
    -- Metadata and audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT DEFAULT 'system',
    
    -- Constraints
    UNIQUE(broker_id, email_address), -- One connection per email per broker
    CHECK (
        -- OAuth providers must have tokens
        (provider IN ('GMAIL', 'OUTLOOK', 'EXCHANGE') AND access_token IS NOT NULL)
        OR
        -- IMAP providers must have host/credentials
        (provider IN ('IMAP_GENERIC', 'YAHOO', 'CUSTOM') AND imap_host IS NOT NULL)
    )
);

-- ===============================================================================
-- EMAIL PROCESSING LOG TABLE
-- ===============================================================================
-- Tracks individual email processing attempts for debugging and analytics

CREATE TABLE email_processing_log (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Email account association
    email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
    broker_id UUID NOT NULL, -- Denormalized for performance
    
    -- Email identification
    message_id TEXT NOT NULL, -- Provider message ID
    thread_id TEXT, -- Email thread/conversation ID
    subject TEXT,
    sender_email TEXT,
    received_at TIMESTAMPTZ,
    
    -- Processing details
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    processing_status TEXT NOT NULL, -- SUCCESS, ERROR, SKIPPED, etc.
    intent_classification TEXT, -- LOAD_REQUEST, MISSING_INFO_RESPONSE, etc.
    
    -- Results
    load_id UUID, -- Created load ID (if successful)
    load_number TEXT, -- Generated load number
    extraction_confidence NUMERIC(3,2), -- AI confidence score
    complexity_flags TEXT[], -- Detected complexity issues
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    
    -- Email content (for debugging/reprocessing)
    raw_email_headers JSONB,
    email_body_text TEXT,
    email_body_html TEXT,
    attachments_info JSONB, -- Attachment metadata
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    CONSTRAINT unique_message_per_account UNIQUE(email_account_id, message_id)
);

-- ===============================================================================
-- WEBHOOK EVENTS TABLE
-- ===============================================================================
-- Stores incoming webhook events for processing and replay

CREATE TABLE webhook_events (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Email account association
    email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
    
    -- Webhook details
    provider email_provider NOT NULL,
    event_type TEXT NOT NULL, -- 'message.created', 'message.updated', etc.
    webhook_signature TEXT, -- For validation
    
    -- Event payload
    raw_payload JSONB NOT NULL,
    processed_payload JSONB, -- Normalized event data
    
    -- Processing status
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMPTZ,
    processing_error TEXT,
    
    -- Metadata
    received_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===============================================================================
-- INDEXES AND PERFORMANCE OPTIMIZATION
-- ===============================================================================

-- Email accounts indexes
CREATE INDEX idx_email_accounts_broker_id ON email_accounts(broker_id);
CREATE INDEX idx_email_accounts_status ON email_accounts(status);
CREATE INDEX idx_email_accounts_provider ON email_accounts(provider);
CREATE INDEX idx_email_accounts_last_sync ON email_accounts(last_sync_at);
CREATE INDEX idx_email_accounts_token_expires ON email_accounts(token_expires_at);

-- Processing log indexes
CREATE INDEX idx_email_processing_log_account_id ON email_processing_log(email_account_id);
CREATE INDEX idx_email_processing_log_broker_id ON email_processing_log(broker_id);
CREATE INDEX idx_email_processing_log_processed_at ON email_processing_log(processed_at);
CREATE INDEX idx_email_processing_log_status ON email_processing_log(processing_status);
CREATE INDEX idx_email_processing_log_sender ON email_processing_log(sender_email);

-- Webhook events indexes
CREATE INDEX idx_webhook_events_account_id ON webhook_events(email_account_id);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_received_at ON webhook_events(received_at);

-- ===============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ===============================================================================
-- Ensures brokers can only access their own email accounts and data

-- Enable RLS on all tables
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_processing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Email accounts policies
CREATE POLICY "Brokers can view their own email accounts" ON email_accounts
    FOR SELECT USING (broker_id = auth.uid()::uuid);

CREATE POLICY "Brokers can insert their own email accounts" ON email_accounts
    FOR INSERT WITH CHECK (broker_id = auth.uid()::uuid);

CREATE POLICY "Brokers can update their own email accounts" ON email_accounts
    FOR UPDATE USING (broker_id = auth.uid()::uuid);

CREATE POLICY "Brokers can delete their own email accounts" ON email_accounts
    FOR DELETE USING (broker_id = auth.uid()::uuid);

-- Processing log policies
CREATE POLICY "Brokers can view their own processing logs" ON email_processing_log
    FOR SELECT USING (broker_id = auth.uid()::uuid);

-- Webhook events policies  
CREATE POLICY "Brokers can view their own webhook events" ON webhook_events
    FOR SELECT USING (
        email_account_id IN (
            SELECT id FROM email_accounts WHERE broker_id = auth.uid()::uuid
        )
    );

-- Service role bypass (for system operations)
CREATE POLICY "Service role has full access to email accounts" ON email_accounts
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to processing logs" ON email_processing_log
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to webhook events" ON webhook_events
    FOR ALL USING (auth.role() = 'service_role');

-- ===============================================================================
-- TRIGGERS AND FUNCTIONS
-- ===============================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to email_accounts
CREATE TRIGGER update_email_accounts_updated_at
    BEFORE UPDATE ON email_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Notification trigger for new webhook events
CREATE OR REPLACE FUNCTION notify_webhook_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Notify the email processing service of new events
    PERFORM pg_notify(
        'webhook_event',
        json_build_object(
            'email_account_id', NEW.email_account_id,
            'provider', NEW.provider,
            'event_type', NEW.event_type,
            'webhook_id', NEW.id
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_event_notification
    AFTER INSERT ON webhook_events
    FOR EACH ROW
    EXECUTE FUNCTION notify_webhook_event();

-- ===============================================================================
-- UPDATE EXISTING LOADS TABLE
-- ===============================================================================
-- Add reference to email account for tracking email sources

-- Add new column to loads table
ALTER TABLE loads ADD COLUMN source_email_account_id UUID REFERENCES email_accounts(id);

-- Add index for performance
CREATE INDEX idx_loads_source_email_account ON loads(source_email_account_id);

-- ===============================================================================
-- INITIAL DATA AND CONFIGURATION
-- ===============================================================================

-- Insert default OAuth client configurations (these can be overridden per account)
-- Note: In production, these should be environment variables or secure configuration

COMMENT ON TABLE email_accounts IS 'Multi-tenant email account connections with OAuth 2.0 and IMAP support';
COMMENT ON TABLE email_processing_log IS 'Audit log of email processing attempts and results';
COMMENT ON TABLE webhook_events IS 'Incoming webhook events from email providers';

-- ===============================================================================
-- USAGE EXAMPLES
-- ===============================================================================
--
-- Connect a Gmail account:
-- INSERT INTO email_accounts (broker_id, email_address, provider, access_token, refresh_token)
-- VALUES ('broker-uuid', 'broker@company.com', 'GMAIL', 'access_token', 'refresh_token');
--
-- Connect an IMAP account:
-- INSERT INTO email_accounts (broker_id, email_address, provider, imap_host, imap_port, imap_username, imap_password)
-- VALUES ('broker-uuid', 'broker@custom.com', 'IMAP_GENERIC', 'mail.custom.com', 993, 'broker@custom.com', 'app_password');
--
-- Query processing statistics:
-- SELECT provider, COUNT(*) as total_emails, 
--        SUM(CASE WHEN processing_status = 'SUCCESS' THEN 1 ELSE 0 END) as successful
-- FROM email_processing_log 
-- WHERE broker_id = 'broker-uuid' 
-- GROUP BY provider;
--
-- ===============================================================================