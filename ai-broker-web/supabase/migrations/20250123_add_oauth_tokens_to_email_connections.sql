-- Add OAuth token columns to email_connections table if they don't exist
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