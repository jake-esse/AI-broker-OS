-- Run this in Supabase SQL Editor to fix email connections visibility

-- First, let's see what email connections exist
SELECT * FROM email_connections WHERE user_id = '19237bd3-51ba-4dc1-80c0-a1fa6eddc278';

-- Check current RLS policies
SELECT pol.polname, pol.polcmd, pg_get_expr(pol.polqual, pol.polrelid) 
FROM pg_policy pol 
JOIN pg_class cls ON pol.polrelid = cls.oid 
WHERE cls.relname = 'email_connections';

-- Drop existing policies that might be causing issues
DROP POLICY IF EXISTS "Users can manage their own email connections" ON email_connections;
DROP POLICY IF EXISTS "Service role can manage email connections" ON email_connections;

-- Create new policies that work with user_id
CREATE POLICY "Users can view their own email connections" ON email_connections
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert their own email connections" ON email_connections
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update their own email connections" ON email_connections
  FOR UPDATE USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete their own email connections" ON email_connections
  FOR DELETE USING (auth.uid()::text = user_id::text);

-- Verify the connections exist
SELECT id, user_id, email, provider, status, is_primary FROM email_connections 
WHERE user_id = '19237bd3-51ba-4dc1-80c0-a1fa6eddc278';