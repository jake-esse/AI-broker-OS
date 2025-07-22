-- Create emails table
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT,
  subject TEXT,
  content TEXT NOT NULL,
  message_id TEXT,
  provider TEXT, -- 'gmail', 'outlook', 'imap'
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'received', -- 'received', 'processed', 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create email attachments table
CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  content TEXT, -- Base64 encoded
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add email tracking fields to loads table
ALTER TABLE loads
ADD COLUMN IF NOT EXISTS source_email_id UUID REFERENCES emails(id),
ADD COLUMN IF NOT EXISTS missing_fields JSONB;

-- Add last_checked field to email_connections
ALTER TABLE email_connections
ADD COLUMN IF NOT EXISTS last_checked TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_emails_broker_id ON emails(broker_id);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_email_id ON email_attachments(email_id);

-- Enable RLS
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies for emails
CREATE POLICY "Users can view own emails" ON emails
FOR SELECT TO authenticated
USING (auth.uid() = broker_id);

CREATE POLICY "System can insert emails" ON emails
FOR INSERT TO service_role
WITH CHECK (true);

CREATE POLICY "System can update emails" ON emails
FOR UPDATE TO service_role
USING (true)
WITH CHECK (true);

-- RLS policies for email_attachments
CREATE POLICY "Users can view own attachments" ON email_attachments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM emails
    WHERE emails.id = email_attachments.email_id
    AND emails.broker_id = auth.uid()
  )
);

CREATE POLICY "System can manage attachments" ON email_attachments
FOR ALL TO service_role
USING (true)
WITH CHECK (true);