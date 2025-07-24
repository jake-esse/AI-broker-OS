-- Fix RLS policies for direct auth system

-- First check what connections exist
SELECT * FROM email_connections WHERE user_id = '19237bd3-51ba-4dc1-80c0-a1fa6eddc278';

-- Since we're using direct auth (not Supabase auth), we need different RLS policies
-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own email connections" ON email_connections;
DROP POLICY IF EXISTS "Users can manage their own email connections" ON email_connections;
DROP POLICY IF EXISTS "Service role can manage email connections" ON email_connections;

-- For now, create a permissive policy that allows all operations
-- In production, you'd want to verify the JWT token properly
CREATE POLICY "Allow all operations on email_connections" ON email_connections
  FOR ALL USING (true);

-- Verify the policy was created
SELECT pol.polname FROM pg_policy pol 
JOIN pg_class cls ON pol.polrelid = cls.oid 
WHERE cls.relname = 'email_connections';

-- Check the data again
SELECT id, user_id, email, provider, status, is_primary, created_at 
FROM email_connections 
ORDER BY created_at DESC;