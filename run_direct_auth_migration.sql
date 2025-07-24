-- Direct Auth Migration - Run in Supabase SQL Editor

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
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Service role can manage users" ON users;

-- Create policy for service role to manage users
CREATE POLICY "Service role can manage users" ON users FOR ALL USING (true);

-- Add user_id column to email_connections if it doesn't exist
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add is_primary column to email_connections if it doesn't exist
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- Create index on user_id
CREATE INDEX IF NOT EXISTS idx_email_connections_user_id ON email_connections(user_id);

-- Add user_id column to brokers if it doesn't exist
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Create index on user_id for brokers
CREATE INDEX IF NOT EXISTS idx_brokers_user_id ON brokers(user_id);

-- Update RLS policies for email_connections
DROP POLICY IF EXISTS "Users can manage their own email connections" ON email_connections;
CREATE POLICY "Service role can manage email connections" ON email_connections FOR ALL USING (true);

-- Update RLS policies for brokers
DROP POLICY IF EXISTS "Users can manage their own broker profile" ON brokers;
CREATE POLICY "Service role can manage brokers" ON brokers FOR ALL USING (true);