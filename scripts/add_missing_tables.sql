-- Add missing tables to work with existing loads and carriers tables

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create brokers table
CREATE TABLE IF NOT EXISTS brokers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  subscription_tier TEXT DEFAULT 'trial' CHECK (subscription_tier IN ('trial', 'starter', 'professional', 'enterprise')),
  
  -- OAuth token storage
  oauth_tokens JSONB DEFAULT '{}',
  -- Example structure:
  -- {
  --   "google": {
  --     "access_token": "...",
  --     "refresh_token": "...",
  --     "expires_at": "2024-01-01T00:00:00Z"
  --   },
  --   "microsoft": {
  --     "access_token": "...",
  --     "refresh_token": "...",
  --     "expires_at": "2024-01-01T00:00:00Z"
  --   }
  -- }
  
  api_keys JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create quotes table to track carrier quotes
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
  
  -- Carrier information
  carrier_id UUID REFERENCES carriers(id),
  carrier_name TEXT,
  carrier_email TEXT,
  carrier_phone TEXT,
  carrier_mc TEXT,
  
  -- Quote details
  rate DECIMAL(10, 2),
  rate_per_mile DECIMAL(5, 2),
  notes TEXT,
  valid_until TIMESTAMPTZ,
  
  -- Quote status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'rejected', 'expired', 'selected', 'cancelled'
  )),
  
  -- Response tracking
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  response_method TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create communications table
CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES brokers(id) ON DELETE CASCADE,
  
  -- Thread tracking
  thread_id TEXT,
  parent_message_id UUID REFERENCES communications(id),
  
  -- Communication details
  channel TEXT CHECK (channel IN ('email', 'sms', 'web', 'api', 'phone', 'oauth_email')),
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  
  -- Parties
  from_address TEXT,
  to_address TEXT,
  cc_addresses TEXT[],
  
  -- Content
  subject TEXT,
  content TEXT,
  attachments JSONB DEFAULT '[]',
  
  -- AI processing
  ai_generated BOOLEAN DEFAULT false,
  ai_confidence DECIMAL(3, 2),
  extracted_data JSONB,
  
  -- Email specific
  message_id TEXT,
  in_reply_to TEXT,
  oauth_provider TEXT, -- 'google', 'microsoft', 'imap'
  
  -- Status
  status TEXT DEFAULT 'sent' CHECK (status IN (
    'draft', 'queued', 'sent', 'delivered', 'read', 'failed', 'bounced'
  )),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add broker_id column to loads table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='loads' AND column_name='broker_id') THEN
        ALTER TABLE loads ADD COLUMN broker_id UUID REFERENCES brokers(id);
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_brokers_email ON brokers(email);
CREATE INDEX IF NOT EXISTS idx_quotes_load_id ON quotes(load_id);
CREATE INDEX IF NOT EXISTS idx_quotes_carrier_id ON quotes(carrier_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_communications_load_id ON communications(load_id);
CREATE INDEX IF NOT EXISTS idx_communications_broker_id ON communications(broker_id);
CREATE INDEX IF NOT EXISTS idx_communications_thread_id ON communications(thread_id);

-- Enable RLS
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

-- Create update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update triggers
DROP TRIGGER IF EXISTS update_brokers_updated_at ON brokers;
CREATE TRIGGER update_brokers_updated_at BEFORE UPDATE ON brokers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quotes_updated_at ON quotes;
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_communications_updated_at ON communications;
CREATE TRIGGER update_communications_updated_at BEFORE UPDATE ON communications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS policies for service role access
CREATE POLICY "Service role full access brokers" ON brokers
    FOR ALL USING (true);

CREATE POLICY "Service role full access quotes" ON quotes
    FOR ALL USING (true);

CREATE POLICY "Service role full access communications" ON communications
    FOR ALL USING (true);