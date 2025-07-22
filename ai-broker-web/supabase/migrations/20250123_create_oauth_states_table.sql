-- Create oauth_states table for CSRF protection during OAuth flow
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for user lookups
CREATE INDEX idx_oauth_states_user_id ON oauth_states(user_id);

-- Index for cleanup of expired states
CREATE INDEX idx_oauth_states_expires_at ON oauth_states(expires_at);

-- Enable RLS
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to manage their own OAuth states
CREATE POLICY "Users can manage their own OAuth states" ON oauth_states
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);