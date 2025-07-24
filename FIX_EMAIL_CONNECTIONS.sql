-- Run this in Supabase SQL Editor to fix the email_connections constraint

-- First, check what constraints exist
SELECT conname FROM pg_constraint WHERE conrelid = 'email_connections'::regclass AND contype = 'u';

-- Drop any existing unique constraints that might conflict
ALTER TABLE email_connections DROP CONSTRAINT IF EXISTS email_connections_user_id_provider_key;
ALTER TABLE email_connections DROP CONSTRAINT IF EXISTS email_connections_broker_id_email_provider_key;
ALTER TABLE email_connections DROP CONSTRAINT IF EXISTS email_connections_pkey CASCADE;

-- Recreate primary key if needed
ALTER TABLE email_connections ADD PRIMARY KEY (id);

-- Add the correct unique constraint
ALTER TABLE email_connections DROP CONSTRAINT IF EXISTS email_connections_user_provider_email_key;
ALTER TABLE email_connections ADD CONSTRAINT email_connections_user_provider_email_key UNIQUE (user_id, provider, email);