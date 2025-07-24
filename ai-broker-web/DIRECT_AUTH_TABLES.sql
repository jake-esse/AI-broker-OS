-- Run this in Supabase SQL Editor to set up direct OAuth authentication

-- 1. Create users table for direct OAuth authentication
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

-- Users can read their own data (we'll use service role for writes)
CREATE POLICY "Service role can manage users" ON users
  FOR ALL USING (true);

-- 2. Update email_connections table
-- Add user_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name='email_connections' 
                AND column_name='user_id') THEN
    ALTER TABLE email_connections ADD COLUMN user_id UUID REFERENCES users(id);
  END IF;
END $$;

-- Add is_primary column
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name='email_connections' 
                AND column_name='is_primary') THEN
    ALTER TABLE email_connections ADD COLUMN is_primary BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create index on user_id
CREATE INDEX IF NOT EXISTS idx_email_connections_user_id ON email_connections(user_id);

-- Update unique constraint to include email
ALTER TABLE email_connections DROP CONSTRAINT IF EXISTS email_connections_user_id_provider_key;
ALTER TABLE email_connections ADD CONSTRAINT email_connections_user_provider_email_key 
  UNIQUE (user_id, provider, email);

-- 3. Update brokers table to reference new users table
-- Add user_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name='brokers' 
                AND column_name='user_id') THEN
    ALTER TABLE brokers ADD COLUMN user_id UUID REFERENCES users(id);
    CREATE INDEX idx_brokers_user_id ON brokers(user_id);
  END IF;
END $$;

-- 4. Update RLS policies for email_connections
DROP POLICY IF EXISTS "Users can manage their own email connections" ON email_connections;
CREATE POLICY "Users can manage their own email connections" ON email_connections
  FOR ALL USING (true); -- We'll handle auth in the app layer with JWT

-- 5. Update RLS policies for brokers
DROP POLICY IF EXISTS "Users can manage their own broker profile" ON brokers;
CREATE POLICY "Service role can manage brokers" ON brokers
  FOR ALL USING (true);