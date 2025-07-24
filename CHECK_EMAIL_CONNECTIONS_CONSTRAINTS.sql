-- Check existing constraints on email_connections table
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM 
    pg_constraint
WHERE 
    conrelid = 'email_connections'::regclass
    AND contype = 'u';

-- If the constraint doesn't match what we expect, we need to update it
-- First, drop the old constraint if it exists
ALTER TABLE email_connections 
DROP CONSTRAINT IF EXISTS email_connections_user_id_provider_key;

ALTER TABLE email_connections 
DROP CONSTRAINT IF EXISTS email_connections_broker_id_email_provider_key;

-- Create the correct constraint
ALTER TABLE email_connections 
ADD CONSTRAINT email_connections_user_provider_email_key 
UNIQUE (user_id, provider, email);