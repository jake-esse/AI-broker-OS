-- Run these migrations in order in your Supabase SQL Editor

-- 1. Add OAuth token columns to email_connections table if they don't exist
DO $$ 
BEGIN
    -- Add oauth_access_token column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'email_connections' 
        AND column_name = 'oauth_access_token'
    ) THEN
        ALTER TABLE email_connections 
        ADD COLUMN oauth_access_token TEXT;
    END IF;

    -- Add oauth_refresh_token column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'email_connections' 
        AND column_name = 'oauth_refresh_token'
    ) THEN
        ALTER TABLE email_connections 
        ADD COLUMN oauth_refresh_token TEXT;
    END IF;

    -- Add oauth_token_expires_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'email_connections' 
        AND column_name = 'oauth_token_expires_at'
    ) THEN
        ALTER TABLE email_connections 
        ADD COLUMN oauth_token_expires_at TIMESTAMPTZ;
    END IF;
END $$;

-- 2. Create oauth_states table for CSRF protection during OAuth flow
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_id ON oauth_states(user_id);

-- Index for cleanup of expired states
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

-- Enable RLS
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to manage their own OAuth states
CREATE POLICY "Users can manage their own OAuth states" ON oauth_states
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Add unique constraint to email_connections for upsert operations
DO $$ 
BEGIN
    -- Check if the constraint already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'email_connections_broker_email_provider_unique'
        AND table_name = 'email_connections'
    ) THEN
        ALTER TABLE email_connections 
        ADD CONSTRAINT email_connections_broker_email_provider_unique 
        UNIQUE (broker_id, email, provider);
    END IF;
END $$;