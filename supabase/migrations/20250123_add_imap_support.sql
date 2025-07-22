-- Add IMAP-specific fields to email_connections table
ALTER TABLE email_connections
ADD COLUMN IF NOT EXISTS imap_host TEXT,
ADD COLUMN IF NOT EXISTS imap_port INTEGER,
ADD COLUMN IF NOT EXISTS encrypted_password TEXT;

-- Add index for email lookups
CREATE INDEX IF NOT EXISTS idx_email_connections_email 
ON email_connections(email);

-- Update RLS policies to allow users to manage their own connections
CREATE POLICY "Users can view own email connections" ON email_connections
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email connections" ON email_connections
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email connections" ON email_connections
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own email connections" ON email_connections
FOR DELETE TO authenticated
USING (auth.uid() = user_id);