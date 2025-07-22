-- Add unique constraint to email_connections for upsert operations
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