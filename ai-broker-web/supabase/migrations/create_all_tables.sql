-- Complete database setup for AI-Broker

-- 1. Create email_connections table
CREATE TABLE IF NOT EXISTS email_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  broker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook', 'imap')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'inactive')),
  
  -- IMAP specific fields
  imap_host TEXT,
  imap_port INTEGER,
  imap_username TEXT,
  imap_password_encrypted TEXT,
  imap_use_ssl BOOLEAN DEFAULT true,
  
  -- OAuth specific fields
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_token_expires_at TIMESTAMPTZ,
  
  -- Common fields
  last_checked TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint for upserts
ALTER TABLE email_connections 
ADD CONSTRAINT email_connections_broker_email_provider_unique 
UNIQUE (broker_id, email, provider);

-- Create indexes
CREATE INDEX idx_email_connections_broker_id ON email_connections(broker_id);
CREATE INDEX idx_email_connections_status ON email_connections(status);

-- Enable RLS
ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own email connections" ON email_connections
  FOR SELECT
  USING (auth.uid() = broker_id);

CREATE POLICY "Users can insert their own email connections" ON email_connections
  FOR INSERT
  WITH CHECK (auth.uid() = broker_id);

CREATE POLICY "Users can update their own email connections" ON email_connections
  FOR UPDATE
  USING (auth.uid() = broker_id)
  WITH CHECK (auth.uid() = broker_id);

CREATE POLICY "Users can delete their own email connections" ON email_connections
  FOR DELETE
  USING (auth.uid() = broker_id);

-- 2. Create oauth_states table for CSRF protection
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Indexes
CREATE INDEX idx_oauth_states_user_id ON oauth_states(user_id);
CREATE INDEX idx_oauth_states_expires_at ON oauth_states(expires_at);

-- Enable RLS
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can manage their own OAuth states" ON oauth_states
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Create emails table for storing processed emails
CREATE TABLE IF NOT EXISTS emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  broker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  content TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
  provider TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_emails_broker_id ON emails(broker_id);
CREATE INDEX idx_emails_message_id ON emails(message_id);
CREATE INDEX idx_emails_status ON emails(status);
CREATE INDEX idx_emails_received_at ON emails(received_at);

-- Enable RLS
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own emails" ON emails
  FOR SELECT
  USING (auth.uid() = broker_id);

CREATE POLICY "Users can insert their own emails" ON emails
  FOR INSERT
  WITH CHECK (auth.uid() = broker_id);

-- 4. Create email_attachments table
CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_email_attachments_email_id ON email_attachments(email_id);

-- Enable RLS
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can view attachments of their emails" ON email_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM emails 
      WHERE emails.id = email_attachments.email_id 
      AND emails.broker_id = auth.uid()
    )
  );

-- 5. Update function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for email_connections
CREATE TRIGGER update_email_connections_updated_at 
  BEFORE UPDATE ON email_connections 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();