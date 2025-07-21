-- AI-Broker MVP Database Schema
-- This creates all necessary tables for the freight brokerage system

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron" SCHEMA pg_catalog;

-- Brokers table - stores broker accounts with OAuth credentials
CREATE TABLE brokers (
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
  
  -- API keys for external services
  api_keys JSONB DEFAULT '{}',
  
  -- Broker preferences and settings
  preferences JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loads table - main table for freight loads
CREATE TABLE loads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broker_id UUID REFERENCES brokers(id) ON DELETE CASCADE,
  
  -- Load status workflow
  status TEXT DEFAULT 'quoting' CHECK (status IN (
    'quoting',           -- Initial quote generation
    'quoted',            -- Quote sent to customer
    'accepted',          -- Customer accepted quote
    'carrier_search',    -- Looking for carriers
    'booked',            -- Carrier assigned
    'dispatched',        -- Load dispatched
    'in_transit',        -- Currently being transported
    'delivered',         -- Delivered to destination
    'completed',         -- POD received, ready for billing
    'cancelled'          -- Load cancelled
  )),
  
  -- Origin information
  origin_city TEXT,
  origin_state TEXT,
  origin_zip TEXT,
  origin_address TEXT,
  origin_contact TEXT,
  origin_phone TEXT,
  
  -- Destination information
  dest_city TEXT,
  dest_state TEXT,
  dest_zip TEXT,
  dest_address TEXT,
  dest_contact TEXT,
  dest_phone TEXT,
  
  -- Load details
  pickup_date DATE,
  delivery_date DATE,
  pickup_time TEXT,
  delivery_time TEXT,
  
  equipment_type TEXT DEFAULT 'dry_van' CHECK (equipment_type IN (
    'dry_van', 'reefer', 'flatbed', 'step_deck', 'ltl', 'partial', 'other'
  )),
  weight_lbs INTEGER,
  commodity TEXT,
  special_instructions TEXT,
  
  -- Pricing information
  shipper_rate DECIMAL(10, 2),      -- Rate quoted to shipper
  carrier_rate DECIMAL(10, 2),      -- Rate paid to carrier
  profit_margin DECIMAL(10, 2),     -- Calculated profit
  quote_confidence DECIMAL(3, 2),   -- AI confidence in quote (0-1)
  market_avg_rate DECIMAL(10, 2),   -- Market average for reference
  
  -- Tracking
  reference_number TEXT UNIQUE DEFAULT 'REF-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 8),
  carrier_id UUID,
  carrier_name TEXT,
  carrier_mc TEXT,
  driver_phone TEXT,
  truck_number TEXT,
  
  -- Source and metadata
  source_channel TEXT DEFAULT 'email' CHECK (source_channel IN (
    'email', 'oauth_email', 'web', 'api', 'sms', 'phone'
  )),
  raw_input JSONB,
  extraction_confidence DECIMAL(3, 2),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  quoted_at TIMESTAMPTZ,
  booked_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Quotes table - tracks all quotes sent to carriers
CREATE TABLE quotes (
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
    'pending',    -- Waiting for response
    'accepted',   -- Carrier accepted
    'rejected',   -- Carrier rejected
    'expired',    -- Quote expired
    'selected',   -- Selected for booking
    'cancelled'   -- Quote cancelled
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
CREATE TABLE communications (
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

-- Carriers table - stores carrier information
CREATE TABLE carriers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Basic information
  company_name TEXT NOT NULL,
  mc_number TEXT UNIQUE,
  dot_number TEXT,
  
  -- Contact information
  primary_email TEXT,
  primary_phone TEXT,
  dispatch_email TEXT,
  dispatch_phone TEXT,
  
  -- Performance metrics
  total_loads INTEGER DEFAULT 0,
  on_time_percentage DECIMAL(5, 2) DEFAULT 100.00,
  avg_response_time_minutes INTEGER,
  safety_rating DECIMAL(3, 2),
  insurance_verified BOOLEAN DEFAULT false,
  insurance_expiry DATE,
  
  -- Financial
  avg_rate_variance DECIMAL(5, 2), -- How their rates compare to market
  quick_pay_eligible BOOLEAN DEFAULT true,
  payment_terms TEXT DEFAULT 'net_30',
  
  -- Preferences
  preferred_lanes JSONB DEFAULT '[]',
  equipment_types TEXT[],
  max_miles INTEGER,
  min_rate_per_mile DECIMAL(5, 2),
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blacklisted')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_load_date DATE
);

-- Create indexes for performance
CREATE INDEX idx_loads_broker_id ON loads(broker_id);
CREATE INDEX idx_loads_status ON loads(status);
CREATE INDEX idx_loads_pickup_date ON loads(pickup_date);
CREATE INDEX idx_loads_reference ON loads(reference_number);
CREATE INDEX idx_quotes_load_id ON quotes(load_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_communications_load_id ON communications(load_id);
CREATE INDEX idx_communications_thread_id ON communications(thread_id);
CREATE INDEX idx_carriers_mc_number ON carriers(mc_number);

-- Enable Row Level Security
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_brokers_updated_at BEFORE UPDATE ON brokers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_loads_updated_at BEFORE UPDATE ON loads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_communications_updated_at BEFORE UPDATE ON communications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_carriers_updated_at BEFORE UPDATE ON carriers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create notification function for real-time updates
CREATE OR REPLACE FUNCTION notify_load_changes()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'load_changes',
        json_build_object(
            'operation', TG_OP,
            'load_id', NEW.id,
            'broker_id', NEW.broker_id,
            'status', NEW.status
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply notification trigger
CREATE TRIGGER notify_load_changes_trigger
    AFTER INSERT OR UPDATE ON loads
    FOR EACH ROW EXECUTE FUNCTION notify_load_changes();

-- RLS Policies (basic - expand based on auth strategy)
-- Allow brokers to see only their own data
CREATE POLICY "Brokers can view own profile" ON brokers
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Brokers can update own profile" ON brokers
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Brokers can view own loads" ON loads
    FOR ALL USING (auth.uid() = broker_id);

CREATE POLICY "Brokers can view own quotes" ON quotes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM loads 
            WHERE loads.id = quotes.load_id 
            AND loads.broker_id = auth.uid()
        )
    );

CREATE POLICY "Brokers can view own communications" ON communications
    FOR ALL USING (auth.uid() = broker_id);

-- Service role bypass (for backend operations)
CREATE POLICY "Service role has full access to brokers" ON brokers
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to loads" ON loads
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to quotes" ON quotes
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to communications" ON communications
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to carriers" ON carriers
    FOR ALL USING (auth.role() = 'service_role');