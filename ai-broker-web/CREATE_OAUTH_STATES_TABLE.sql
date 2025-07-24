-- Run this in Supabase SQL Editor
-- This creates the oauth_states table needed for OAuth CSRF protection

CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Enable RLS
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own OAuth states
CREATE POLICY "Users can manage own oauth states" ON oauth_states
  FOR ALL USING (auth.uid() = user_id);