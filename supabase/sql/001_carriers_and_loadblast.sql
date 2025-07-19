-- ===============================================================================
-- AI-Broker MVP · Carriers & LoadBlast Schema
-- ===============================================================================
-- 
-- BUSINESS PURPOSE:
-- This schema supports the LoadBlast Agent functionality by managing preferred
-- carriers and load posting preferences. It enables brokers to maintain their
-- carrier network and control how loads are distributed to carriers vs load boards.
--
-- WORKFLOW INTEGRATION:
-- 1. Broker UI → Manages preferred carriers and posting preferences
-- 2. LoadBlast Agent → Reads carrier data and preferences to blast loads
-- 3. DAT Integration → Posts loads to DAT load board when enabled
-- 4. Email System → Sends personalized load offers to preferred carriers
--
-- BUSINESS RULES:
-- - Carriers can be marked as preferred for specific equipment types
-- - Load posting can be carrier-only, DAT-only, or both
-- - Carrier performance metrics track reliability and acceptance rates
-- - Staggered posting ensures preferred carriers get first opportunity
-- ===============================================================================

-- ===============================================================================
-- CARRIERS TABLE
-- ===============================================================================
-- Stores broker's preferred carrier network with performance tracking

CREATE TABLE IF NOT EXISTS carriers (
    -- ─── PRIMARY KEY AND METADATA ───────────────────────────────────────────
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- ─── CARRIER IDENTIFICATION ─────────────────────────────────────────────
    -- Carrier name and DOT number for identification
    carrier_name VARCHAR(255) NOT NULL,
    dot_number VARCHAR(20), -- DOT number for regulatory compliance
    mc_number VARCHAR(20), -- MC number for broker verification
    
    -- ─── CONTACT INFORMATION ────────────────────────────────────────────────
    -- Primary contact details for load offers
    contact_name VARCHAR(255),
    contact_email VARCHAR(255) NOT NULL, -- Required for email blasts
    contact_phone VARCHAR(20),
    
    -- ─── EQUIPMENT AND CAPABILITIES ─────────────────────────────────────────
    -- Equipment types this carrier can handle
    equipment_types TEXT[] DEFAULT ARRAY[]::TEXT[], -- Array of equipment types
    service_areas TEXT[] DEFAULT ARRAY[]::TEXT[], -- Array of zip codes or states
    
    -- ─── CARRIER PREFERENCES ────────────────────────────────────────────────
    -- Broker's preference settings for this carrier
    is_preferred BOOLEAN DEFAULT FALSE, -- Preferred carrier flag
    preference_tier INTEGER DEFAULT 3, -- 1=Top tier, 2=Mid tier, 3=Standard
    
    -- ─── PERFORMANCE METRICS ────────────────────────────────────────────────
    -- Track carrier reliability and performance
    loads_offered INTEGER DEFAULT 0, -- Total loads offered to this carrier
    loads_accepted INTEGER DEFAULT 0, -- Total loads accepted by this carrier
    loads_completed INTEGER DEFAULT 0, -- Total loads completed successfully
    average_rate_per_mile DECIMAL(5,2), -- Average rate carrier accepts
    
    -- ─── COMMUNICATION PREFERENCES ──────────────────────────────────────────
    -- How this carrier prefers to receive load offers
    email_enabled BOOLEAN DEFAULT TRUE, -- Send email offers
    sms_enabled BOOLEAN DEFAULT FALSE, -- Send SMS offers
    phone_number VARCHAR(20), -- Phone number for SMS
    
    -- ─── BUSINESS RELATIONSHIP ──────────────────────────────────────────────
    -- Relationship status and notes
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, BLOCKED
    credit_rating VARCHAR(10), -- A+, A, B+, B, C, D
    insurance_expiry DATE, -- Insurance expiration date
    
    -- ─── NOTES AND HISTORY ──────────────────────────────────────────────────
    notes TEXT, -- Broker notes about this carrier
    last_contact_date TIMESTAMP WITH TIME ZONE, -- Last time we contacted them
    
    -- ─── AUDIT FIELDS ───────────────────────────────────────────────────────
    created_by VARCHAR(255) DEFAULT 'broker_ui',
    modified_by VARCHAR(255)
);

-- ===============================================================================
-- CARRIERS TABLE INDEXES
-- ===============================================================================
-- Optimize for common LoadBlast Agent queries

-- Index for equipment-based carrier matching
CREATE INDEX IF NOT EXISTS idx_carriers_equipment ON carriers USING GIN (equipment_types);

-- Index for preferred carrier filtering
CREATE INDEX IF NOT EXISTS idx_carriers_preferred ON carriers(is_preferred, preference_tier);

-- Index for active carrier filtering
CREATE INDEX IF NOT EXISTS idx_carriers_status ON carriers(status);

-- Index for contact lookup
CREATE INDEX IF NOT EXISTS idx_carriers_email ON carriers(contact_email);

-- ===============================================================================
-- UPDATE LOADS TABLE FOR POSTING PREFERENCES
-- ===============================================================================
-- Add columns to control how loads are posted to carriers vs load boards

ALTER TABLE loads ADD COLUMN IF NOT EXISTS post_to_carriers BOOLEAN DEFAULT TRUE;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS post_to_dat BOOLEAN DEFAULT FALSE;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS posting_delay_minutes INTEGER DEFAULT 0;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS max_carriers_to_contact INTEGER DEFAULT 10;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS preferred_rate_per_mile DECIMAL(5,2);

-- Add comments for new columns
COMMENT ON COLUMN loads.post_to_carriers IS 'Whether to send this load to preferred carriers';
COMMENT ON COLUMN loads.post_to_dat IS 'Whether to post this load to DAT load board';
COMMENT ON COLUMN loads.posting_delay_minutes IS 'Minutes to wait before posting to DAT (gives carriers first shot)';
COMMENT ON COLUMN loads.max_carriers_to_contact IS 'Maximum number of carriers to contact for this load';
COMMENT ON COLUMN loads.preferred_rate_per_mile IS 'Preferred rate per mile for this load';

-- ===============================================================================
-- LOAD BLASTS TABLE
-- ===============================================================================
-- Track all load blast activities for monitoring and analytics

CREATE TABLE IF NOT EXISTS load_blasts (
    -- ─── PRIMARY KEY AND METADATA ───────────────────────────────────────────
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- ─── RELATIONSHIPS ──────────────────────────────────────────────────────
    load_id UUID REFERENCES loads(id) ON DELETE CASCADE,
    carrier_id UUID REFERENCES carriers(id) ON DELETE CASCADE,
    
    -- ─── BLAST DETAILS ──────────────────────────────────────────────────────
    blast_type VARCHAR(20) NOT NULL, -- EMAIL, SMS, DAT_POST
    blast_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, SENT, FAILED, DELIVERED
    
    -- ─── CONTENT TRACKING ───────────────────────────────────────────────────
    subject_line TEXT, -- Email subject line used
    message_content TEXT, -- Full message content sent
    
    -- ─── DELIVERY TRACKING ──────────────────────────────────────────────────
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    
    -- ─── RESPONSE TRACKING ──────────────────────────────────────────────────
    response_received_at TIMESTAMP WITH TIME ZONE,
    response_type VARCHAR(20), -- QUOTE, PASS, QUESTION, ACCEPTANCE
    response_content TEXT,
    
    -- ─── EXTERNAL SERVICE IDS ───────────────────────────────────────────────
    resend_message_id VARCHAR(255), -- Resend service message ID
    twilio_message_id VARCHAR(255), -- Twilio SMS message ID
    dat_posting_id VARCHAR(255), -- DAT load board posting ID
    
    -- ─── ERROR HANDLING ─────────────────────────────────────────────────────
    error_message TEXT, -- Error details if blast failed
    retry_count INTEGER DEFAULT 0, -- Number of retry attempts
    
    -- ─── AUDIT FIELDS ───────────────────────────────────────────────────────
    created_by VARCHAR(255) DEFAULT 'loadblast_agent'
);

-- ===============================================================================
-- LOAD BLASTS TABLE INDEXES
-- ===============================================================================
-- Optimize for monitoring and analytics queries

-- Index for load-based queries
CREATE INDEX IF NOT EXISTS idx_load_blasts_load_id ON load_blasts(load_id);

-- Index for carrier-based queries
CREATE INDEX IF NOT EXISTS idx_load_blasts_carrier_id ON load_blasts(carrier_id);

-- Index for status monitoring
CREATE INDEX IF NOT EXISTS idx_load_blasts_status ON load_blasts(blast_status);

-- Index for performance analytics
CREATE INDEX IF NOT EXISTS idx_load_blasts_sent_at ON load_blasts(sent_at);

-- ===============================================================================
-- AUTOMATED TIMESTAMP MANAGEMENT
-- ===============================================================================
-- Update timestamps automatically for carriers table

CREATE TRIGGER update_carriers_updated_at 
    BEFORE UPDATE ON carriers 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ===============================================================================
-- CARRIER PERFORMANCE TRACKING FUNCTIONS
-- ===============================================================================
-- Automatically update carrier performance metrics

CREATE OR REPLACE FUNCTION update_carrier_performance()
RETURNS TRIGGER AS $$
BEGIN
    -- Update carrier performance metrics when load blast responses are received
    IF NEW.response_type IS NOT NULL AND OLD.response_type IS NULL THEN
        UPDATE carriers 
        SET 
            loads_offered = loads_offered + 1,
            loads_accepted = CASE 
                WHEN NEW.response_type = 'ACCEPTANCE' THEN loads_accepted + 1 
                ELSE loads_accepted 
            END,
            last_contact_date = NOW()
        WHERE id = NEW.carrier_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_carrier_performance
    AFTER UPDATE ON load_blasts
    FOR EACH ROW
    EXECUTE FUNCTION update_carrier_performance();

-- ===============================================================================
-- SAMPLE DATA FOR TESTING
-- ===============================================================================
-- Create sample carriers for testing the LoadBlast Agent

INSERT INTO carriers (
    carrier_name, dot_number, mc_number, 
    contact_name, contact_email, contact_phone,
    equipment_types, service_areas,
    is_preferred, preference_tier,
    status, credit_rating
) VALUES 
    (
        'Reliable Transport LLC', '12345', 'MC-123456',
        'John Smith', 'dispatch@reliabletransport.com', '555-0101',
        ARRAY['Van', 'Reefer'], ARRAY['TX', 'FL', 'CA'],
        TRUE, 1,
        'ACTIVE', 'A+'
    ),
    (
        'FastTrack Logistics', '67890', 'MC-678901',
        'Sarah Johnson', 'loads@fasttracklogistics.com', '555-0102',
        ARRAY['Van', 'Flatbed'], ARRAY['TX', 'OK', 'NM'],
        TRUE, 2,
        'ACTIVE', 'A'
    ),
    (
        'Highway Heroes', '11111', 'MC-111111',
        'Mike Davis', 'booking@highwayheroes.com', '555-0103',
        ARRAY['Van'], ARRAY['TX', 'LA', 'AR'],
        FALSE, 3,
        'ACTIVE', 'B+'
    )
ON CONFLICT DO NOTHING;

-- ===============================================================================
-- LOAD POSTING PREFERENCES UPDATE
-- ===============================================================================
-- Update existing loads with default posting preferences

UPDATE loads 
SET 
    post_to_carriers = TRUE,
    post_to_dat = FALSE,
    posting_delay_minutes = 30,
    max_carriers_to_contact = 5,
    preferred_rate_per_mile = 2.50
WHERE post_to_carriers IS NULL;

-- ===============================================================================
-- BUSINESS INTELLIGENCE VIEWS
-- ===============================================================================
-- Create views for common LoadBlast analytics

CREATE OR REPLACE VIEW carrier_performance_summary AS
SELECT 
    c.carrier_name,
    c.contact_email,
    c.preference_tier,
    c.loads_offered,
    c.loads_accepted,
    c.loads_completed,
    CASE 
        WHEN c.loads_offered > 0 
        THEN ROUND((c.loads_accepted::DECIMAL / c.loads_offered) * 100, 2)
        ELSE 0 
    END as acceptance_rate_percent,
    CASE 
        WHEN c.loads_accepted > 0 
        THEN ROUND((c.loads_completed::DECIMAL / c.loads_accepted) * 100, 2)
        ELSE 0 
    END as completion_rate_percent,
    c.average_rate_per_mile,
    c.last_contact_date,
    c.status
FROM carriers c
WHERE c.status = 'ACTIVE'
ORDER BY c.preference_tier, acceptance_rate_percent DESC;

CREATE OR REPLACE VIEW load_blast_summary AS
SELECT 
    l.load_number,
    l.origin_zip,
    l.dest_zip,
    l.equipment,
    l.status as load_status,
    COUNT(lb.id) as total_blasts_sent,
    COUNT(CASE WHEN lb.blast_status = 'DELIVERED' THEN 1 END) as delivered_count,
    COUNT(CASE WHEN lb.response_type = 'QUOTE' THEN 1 END) as quotes_received,
    COUNT(CASE WHEN lb.response_type = 'ACCEPTANCE' THEN 1 END) as acceptances_received,
    MIN(lb.sent_at) as first_blast_sent,
    MAX(lb.response_received_at) as last_response_received
FROM loads l
LEFT JOIN load_blasts lb ON l.id = lb.load_id
WHERE l.status IN ('NEW_RFQ', 'QUOTED', 'BOOKED')
GROUP BY l.id, l.load_number, l.origin_zip, l.dest_zip, l.equipment, l.status
ORDER BY l.created_at DESC;

-- ===============================================================================
-- MAINTENANCE NOTES
-- ===============================================================================
-- 
-- REGULAR MAINTENANCE:
-- - Monitor carrier performance metrics for accuracy
-- - Archive old load_blasts records (older than 1 year)
-- - Update carrier insurance expiry dates
-- - Clean up failed/bounced email addresses
-- - Review and update carrier preference tiers quarterly
--
-- SCALING CONSIDERATIONS:
-- - Partition load_blasts by month for high-volume operations
-- - Index on response_received_at for faster analytics
-- - Consider separate tables for different blast types
-- - Implement carrier capacity tracking for better matching
--
-- FUTURE ENHANCEMENTS:
-- - Add carrier capacity and availability tracking
-- - Implement dynamic pricing based on carrier performance
-- - Add integration with carrier TMS systems
-- - Create carrier portal for self-service load acceptance
-- - Add machine learning for carrier matching optimization
-- ===============================================================================