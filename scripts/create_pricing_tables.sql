-- --------------------------- create_pricing_tables.sql ----------------------------
-- AI-Broker MVP · Pricing Engine Database Schema
--
-- Creates tables required for the market-based pricing engine including:
-- - market_rates: Historical rate data for lanes
-- - fuel_prices: Current and historical fuel prices
-- - pricing_rules: Business rules for dynamic pricing
-- - quote_history: Historical quote performance tracking

-- ╔══════════ Market Rates Table ═══════════════════════════════════
-- Stores historical market rate data for freight lanes
CREATE TABLE IF NOT EXISTS market_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Lane information
    origin_state VARCHAR(2) NOT NULL,
    origin_city VARCHAR(100),
    origin_zip VARCHAR(10),
    dest_state VARCHAR(2) NOT NULL,
    dest_city VARCHAR(100),
    dest_zip VARCHAR(10),
    
    -- Equipment and load details
    equipment_type VARCHAR(50) NOT NULL,
    weight_range_min INTEGER,
    weight_range_max INTEGER,
    
    -- Rate information
    rate_per_mile DECIMAL(10,2) NOT NULL,
    total_rate DECIMAL(10,2),
    total_miles INTEGER,
    
    -- Market indicators
    market_condition VARCHAR(20), -- tight, balanced, loose
    load_to_truck_ratio DECIMAL(5,2),
    
    -- Source and validity
    rate_source VARCHAR(50), -- DAT, internal, manual, etc.
    effective_date DATE NOT NULL,
    expiration_date DATE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    
    -- Indexes for performance
    CONSTRAINT valid_rate CHECK (rate_per_mile > 0),
    CONSTRAINT valid_miles CHECK (total_miles > 0 OR total_miles IS NULL)
);

-- Create indexes for fast lane lookups
CREATE INDEX idx_market_rates_lane ON market_rates(origin_state, dest_state, equipment_type);
CREATE INDEX idx_market_rates_date ON market_rates(effective_date DESC);
CREATE INDEX idx_market_rates_origin ON market_rates(origin_state, origin_city);
CREATE INDEX idx_market_rates_dest ON market_rates(dest_state, dest_city);

-- ╔══════════ Fuel Prices Table ═══════════════════════════════════
-- Tracks diesel fuel prices for surcharge calculations
CREATE TABLE IF NOT EXISTS fuel_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Price information
    price_date DATE NOT NULL UNIQUE,
    national_average DECIMAL(5,2) NOT NULL,
    
    -- Regional prices (optional)
    midwest_price DECIMAL(5,2),
    northeast_price DECIMAL(5,2),
    southeast_price DECIMAL(5,2),
    southwest_price DECIMAL(5,2),
    west_price DECIMAL(5,2),
    
    -- Source
    data_source VARCHAR(50), -- EIA, OPIS, manual
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_fuel_prices_date ON fuel_prices(price_date DESC);

-- ╔══════════ Pricing Rules Table ═══════════════════════════════════
-- Configurable business rules for dynamic pricing
CREATE TABLE IF NOT EXISTS pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Rule identification
    rule_name VARCHAR(100) NOT NULL UNIQUE,
    rule_type VARCHAR(50) NOT NULL, -- margin, adjustment, surcharge
    priority INTEGER DEFAULT 100,
    
    -- Conditions (JSON for flexibility)
    conditions JSONB, -- e.g., {"equipment": "Reefer", "weight_min": 40000}
    
    -- Actions
    adjustment_type VARCHAR(20), -- percentage, fixed_amount, multiplier
    adjustment_value DECIMAL(10,4),
    
    -- Validity
    active BOOLEAN DEFAULT TRUE,
    effective_date DATE,
    expiration_date DATE,
    
    -- Description
    description TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID
);

CREATE INDEX idx_pricing_rules_active ON pricing_rules(active, priority);
CREATE INDEX idx_pricing_rules_type ON pricing_rules(rule_type);

-- ╔══════════ Quote History Table ═══════════════════════════════════
-- Tracks quote performance for analytics and optimization
CREATE TABLE IF NOT EXISTS quote_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Quote reference
    quote_id UUID REFERENCES quotes(id),
    load_id UUID REFERENCES loads(id),
    
    -- Quote details snapshot
    quoted_rate DECIMAL(10,2) NOT NULL,
    carrier_rate DECIMAL(10,2),
    margin_amount DECIMAL(10,2),
    margin_percentage DECIMAL(5,2),
    
    -- Market comparison
    market_average_at_time DECIMAL(10,2),
    market_position VARCHAR(20), -- below_market, at_market, above_market
    
    -- Outcome tracking
    quote_status VARCHAR(20), -- sent, viewed, accepted, rejected, expired
    outcome VARCHAR(20), -- won, lost, expired, withdrawn
    win_loss_reason TEXT,
    competitor_rate DECIMAL(10,2), -- if known
    
    -- Performance metrics
    response_time_hours INTEGER,
    negotiation_rounds INTEGER DEFAULT 0,
    final_rate DECIMAL(10,2),
    
    -- Timestamps
    quoted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    decided_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_quote_history_quote ON quote_history(quote_id);
CREATE INDEX idx_quote_history_outcome ON quote_history(outcome);
CREATE INDEX idx_quote_history_date ON quote_history(quoted_at DESC);

-- ╔══════════ Sample Data ═══════════════════════════════════════════
-- Insert sample market rates for testing
INSERT INTO market_rates (
    origin_state, origin_city, dest_state, dest_city, 
    equipment_type, rate_per_mile, total_miles,
    market_condition, effective_date
) VALUES 
    ('TX', 'Dallas', 'TX', 'Houston', 'Van', 2.25, 240, 'balanced', CURRENT_DATE),
    ('TX', 'Dallas', 'FL', 'Miami', 'Van', 2.10, 1300, 'balanced', CURRENT_DATE),
    ('CA', 'Los Angeles', 'AZ', 'Phoenix', 'Van', 2.35, 370, 'tight', CURRENT_DATE),
    ('IL', 'Chicago', 'GA', 'Atlanta', 'Van', 2.15, 720, 'balanced', CURRENT_DATE),
    ('TX', 'Dallas', 'TX', 'Houston', 'Reefer', 2.75, 240, 'balanced', CURRENT_DATE),
    ('TX', 'Dallas', 'FL', 'Miami', 'Reefer', 2.60, 1300, 'balanced', CURRENT_DATE),
    ('TX', 'Dallas', 'TX', 'Houston', 'Flatbed', 2.50, 240, 'tight', CURRENT_DATE)
ON CONFLICT DO NOTHING;

-- Insert current fuel price
INSERT INTO fuel_prices (price_date, national_average) 
VALUES (CURRENT_DATE, 3.89)
ON CONFLICT (price_date) DO NOTHING;

-- Insert sample pricing rules
INSERT INTO pricing_rules (rule_name, rule_type, priority, conditions, adjustment_type, adjustment_value, description) VALUES
    ('Heavy Load Surcharge', 'surcharge', 100, '{"weight_min": 45000}', 'fixed_amount', 150, 'Surcharge for loads over 45,000 lbs'),
    ('Reefer Equipment Premium', 'adjustment', 90, '{"equipment": "Reefer"}', 'multiplier', 1.25, '25% premium for refrigerated loads'),
    ('Tight Market Adjustment', 'adjustment', 80, '{"market_condition": "tight"}', 'percentage', 10, '10% increase in tight market conditions'),
    ('Weekend Pickup Discount', 'adjustment', 70, '{"pickup_day": ["Saturday", "Sunday"]}', 'percentage', -5, '5% discount for weekend pickups')
ON CONFLICT (rule_name) DO NOTHING;

-- ╔══════════ Helper Functions ═══════════════════════════════════════
-- Function to get the best market rate for a lane
CREATE OR REPLACE FUNCTION get_market_rate(
    p_origin_state VARCHAR,
    p_dest_state VARCHAR,
    p_equipment VARCHAR,
    p_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
    avg_rate DECIMAL,
    min_rate DECIMAL,
    max_rate DECIMAL,
    sample_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        AVG(rate_per_mile)::DECIMAL as avg_rate,
        MIN(rate_per_mile)::DECIMAL as min_rate,
        MAX(rate_per_mile)::DECIMAL as max_rate,
        COUNT(*)::INTEGER as sample_count
    FROM market_rates
    WHERE origin_state = p_origin_state
    AND dest_state = p_dest_state
    AND equipment_type = p_equipment
    AND effective_date <= p_date
    AND (expiration_date IS NULL OR expiration_date >= p_date);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate fuel surcharge
CREATE OR REPLACE FUNCTION calculate_fuel_surcharge(
    p_miles INTEGER,
    p_base_price DECIMAL DEFAULT 3.00
) RETURNS DECIMAL AS $$
DECLARE
    v_current_price DECIMAL;
    v_surcharge DECIMAL;
BEGIN
    -- Get most recent fuel price
    SELECT national_average INTO v_current_price
    FROM fuel_prices
    ORDER BY price_date DESC
    LIMIT 1;
    
    -- If no fuel price found, return 0
    IF v_current_price IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Calculate surcharge: (current - base) / 6 MPG * miles
    IF v_current_price > p_base_price THEN
        v_surcharge := ((v_current_price - p_base_price) / 6.0) * p_miles;
        RETURN ROUND(v_surcharge, 2);
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ╔══════════ Update Triggers ═══════════════════════════════════════
-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_market_rates_updated_at BEFORE UPDATE ON market_rates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fuel_prices_updated_at BEFORE UPDATE ON fuel_prices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pricing_rules_updated_at BEFORE UPDATE ON pricing_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quote_history_updated_at BEFORE UPDATE ON quote_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ╔══════════ Permissions ═══════════════════════════════════════════
-- Enable RLS
ALTER TABLE market_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_history ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your auth setup)
-- For now, allow authenticated users to read pricing data
CREATE POLICY "Allow authenticated read market_rates" ON market_rates
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read fuel_prices" ON fuel_prices
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read pricing_rules" ON pricing_rules
    FOR SELECT USING (auth.role() = 'authenticated');

-- Quote history should be restricted to own quotes
CREATE POLICY "Users can view own quote history" ON quote_history
    FOR SELECT USING (
        auth.uid() IN (
            SELECT broker_id FROM quotes WHERE id = quote_history.quote_id
        )
    );

COMMENT ON TABLE market_rates IS 'Historical and current market rates for freight lanes';
COMMENT ON TABLE fuel_prices IS 'Daily diesel fuel prices for surcharge calculations';
COMMENT ON TABLE pricing_rules IS 'Configurable business rules for dynamic pricing adjustments';
COMMENT ON TABLE quote_history IS 'Historical quote performance tracking for analytics';