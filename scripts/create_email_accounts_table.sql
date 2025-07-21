-- Create email_accounts table for OAuth service
-- This is a simplified version of the full migration for testing

-- Create types
CREATE TYPE IF NOT EXISTS email_provider AS ENUM (
    'GMAIL',
    'OUTLOOK', 
    'EXCHANGE',
    'IMAP_GENERIC',
    'YAHOO',
    'CUSTOM'
);

CREATE TYPE IF NOT EXISTS connection_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'ERROR',
    'TOKEN_EXPIRED',
    'AUTHORIZATION_REQUIRED'
);

-- Create email_accounts table
CREATE TABLE IF NOT EXISTS email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broker_id UUID NOT NULL,
    email_address TEXT NOT NULL,
    display_name TEXT,
    provider email_provider NOT NULL,
    status connection_status NOT NULL DEFAULT 'AUTHORIZATION_REQUIRED',
    
    -- OAuth credentials
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    oauth_scope TEXT,
    client_id TEXT,
    tenant_id TEXT,
    
    -- Processing config
    processing_enabled BOOLEAN DEFAULT true,
    auto_reply_enabled BOOLEAN DEFAULT true,
    monitor_folders TEXT[] DEFAULT ARRAY['INBOX'],
    
    -- Timestamps
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT DEFAULT 'system',
    
    -- Error tracking
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    
    -- Constraints
    UNIQUE(broker_id, email_address)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_accounts_broker_id ON email_accounts(broker_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_status ON email_accounts(status);
CREATE INDEX IF NOT EXISTS idx_email_accounts_provider ON email_accounts(provider);

-- Enable RLS
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for service role access
CREATE POLICY "Service role full access email accounts" ON email_accounts
    FOR ALL USING (true);

-- Create update trigger
CREATE TRIGGER IF NOT EXISTS update_email_accounts_updated_at
    BEFORE UPDATE ON email_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();