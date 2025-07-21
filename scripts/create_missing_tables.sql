-- Create only the missing tables (brokers, quotes, communications)

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Brokers table - stores broker accounts with OAuth credentials
CREATE TABLE IF NOT EXISTS brokers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  subscription_tier TEXT DEFAULT 'trial' CHECK (subscription_tier IN ('trial', 'starter', 'professional', 'enterprise')),
  
  -- OAuth token storage
  oauth_tokens JSONB DEFAULT '{}',
  api_keys JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quotes table - tracks all quotes sent to carriers
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
  
  -- Carrier information
  carrier_id UUID,
  carrier_name TEXT,
  carrier_email TEXT,
  carrier_phone TEXT,
  carrier_mc TEXT,
  
  -- Quote details
  rate DECIMAL(10, 2),
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
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Communications table - tracks all communications
CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES brokers(id) ON DELETE CASCADE,
  
  -- Thread tracking for conversations
  thread_id TEXT,
  parent_message_id UUID REFERENCES communications(id),
  
  -- Communication details
  channel TEXT CHECK (channel IN ('email', 'sms', 'web', 'api', 'phone')),
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  
  -- Parties involved
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
  
  -- Email specific fields
  message_id TEXT,
  in_reply_to TEXT,
  
  -- Status tracking
  status TEXT DEFAULT 'sent' CHECK (status IN (
    'draft', 'queued', 'sent', 'delivered', 'read', 'failed', 'bounced'
  )),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotes_load_id ON quotes(load_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_communications_load_id ON communications(load_id);
CREATE INDEX IF NOT EXISTS idx_communications_thread_id ON communications(thread_id);

-- Enable Row Level Security
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_brokers_updated_at ON brokers;
CREATE TRIGGER update_brokers_updated_at BEFORE UPDATE ON brokers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
DROP TRIGGER IF EXISTS update_quotes_updated_at ON quotes;
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
DROP TRIGGER IF EXISTS update_communications_updated_at ON communications;
CREATE TRIGGER update_communications_updated_at BEFORE UPDATE ON communications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
-- Service role bypass (for backend operations)
CREATE POLICY "Service role has full access to brokers" ON brokers
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to quotes" ON quotes
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to communications" ON communications
    FOR ALL USING (auth.role() = 'service_role');