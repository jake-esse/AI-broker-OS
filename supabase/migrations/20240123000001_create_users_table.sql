-- Create users table for direct OAuth authentication
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  provider TEXT CHECK (provider IN ('google', 'outlook')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  last_provider TEXT CHECK (last_provider IN ('google', 'outlook'))
);

-- Add indexes
CREATE INDEX idx_users_email ON users(email);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid()::text = id::text);

-- Add is_primary column to email_connections
ALTER TABLE email_connections 
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- Update existing broker_id column to be nullable (for additional connections)
ALTER TABLE email_connections 
ALTER COLUMN broker_id DROP NOT NULL;