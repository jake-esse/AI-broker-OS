-- Create loads table if it doesn't exist
CREATE TABLE IF NOT EXISTS loads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  broker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Customer information
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  
  -- Load details
  reference_number TEXT,
  pickup_location TEXT NOT NULL,
  delivery_location TEXT NOT NULL,
  pickup_date TEXT,
  delivery_date TEXT,
  
  -- Shipment details
  weight INTEGER,
  commodity TEXT,
  equipment_type TEXT DEFAULT 'Dry Van',
  special_requirements TEXT,
  
  -- Pricing
  quote_amount DECIMAL(10,2),
  carrier_rate DECIMAL(10,2),
  margin DECIMAL(10,2),
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'quoted' CHECK (status IN ('quoted', 'booked', 'dispatched', 'in_transit', 'delivered', 'cancelled', 'pending_clarification')),
  confidence_score INTEGER,
  
  -- Source tracking
  source TEXT DEFAULT 'email',
  original_request TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_loads_broker_id ON loads(broker_id);
CREATE INDEX idx_loads_status ON loads(status);
CREATE INDEX idx_loads_created_at ON loads(created_at);

-- Enable RLS
ALTER TABLE loads ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own loads" ON loads
  FOR SELECT
  USING (auth.uid() = broker_id);

CREATE POLICY "Users can insert their own loads" ON loads
  FOR INSERT
  WITH CHECK (auth.uid() = broker_id);

CREATE POLICY "Users can update their own loads" ON loads
  FOR UPDATE
  USING (auth.uid() = broker_id)
  WITH CHECK (auth.uid() = broker_id);

CREATE POLICY "Users can delete their own loads" ON loads
  FOR DELETE
  USING (auth.uid() = broker_id);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  load_id UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  broker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_chat_messages_load_id ON chat_messages(load_id);
CREATE INDEX idx_chat_messages_broker_id ON chat_messages(broker_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own chat messages" ON chat_messages
  FOR SELECT
  USING (auth.uid() = broker_id);

CREATE POLICY "Users can insert their own chat messages" ON chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() = broker_id);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  broker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  read BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_notifications_broker_id ON notifications(broker_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT
  USING (auth.uid() = broker_id);

CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE
  USING (auth.uid() = broker_id)
  WITH CHECK (auth.uid() = broker_id);

-- Update function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for loads
DROP TRIGGER IF EXISTS update_loads_updated_at ON loads;
CREATE TRIGGER update_loads_updated_at 
  BEFORE UPDATE ON loads 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();