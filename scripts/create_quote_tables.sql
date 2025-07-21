-- --------------------------- create_quote_tables.sql ----------------------------
-- AI-Broker MVP · Quote Management Database Schema
--
-- Creates tables for comprehensive quote lifecycle management including:
-- - quotes: Main quote records with pricing and status
-- - quote_events: Event tracking for analytics
-- - quote_templates: Customizable quote templates
-- - quote_followups: Automated follow-up scheduling

-- ╔══════════ Quotes Table Enhancement ═══════════════════════════════════
-- Ensure quotes table has all required fields for quote management
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_number VARCHAR(20) UNIQUE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS shipper_email VARCHAR(255);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS shipper_name VARCHAR(255);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS shipper_phone VARCHAR(20);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS margin_amount DECIMAL(10,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS total_miles INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pricing_details JSONB;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivery_channels TEXT[];
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS response_notes TEXT;

-- Create index for quote number lookups
CREATE INDEX IF NOT EXISTS idx_quotes_quote_number ON quotes(quote_number);
CREATE INDEX IF NOT EXISTS idx_quotes_shipper_email ON quotes(shipper_email);
CREATE INDEX IF NOT EXISTS idx_quotes_valid_until ON quotes(valid_until);

-- ╔══════════ Quote Events Table ═══════════════════════════════════
-- Track all quote-related events for analytics and debugging
CREATE TABLE IF NOT EXISTS quote_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    
    -- Event information
    event_type VARCHAR(50) NOT NULL, -- created, sent, viewed, accepted, rejected, expired
    event_source VARCHAR(50), -- email, sms, web, api
    
    -- Event details
    metadata JSONB, -- Additional event-specific data
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes
    CONSTRAINT valid_event_type CHECK (
        event_type IN ('created', 'sent', 'viewed', 'accepted', 'rejected', 
                      'expired', 'email_opened', 'link_clicked', 'downloaded',
                      'negotiation_started', 'followup_sent')
    )
);

CREATE INDEX idx_quote_events_quote_id ON quote_events(quote_id);
CREATE INDEX idx_quote_events_type ON quote_events(event_type);
CREATE INDEX idx_quote_events_created ON quote_events(created_at DESC);

-- ╔══════════ Quote Templates Table ═══════════════════════════════════
-- Store customizable quote templates for different scenarios
CREATE TABLE IF NOT EXISTS quote_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Template identification
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    template_type VARCHAR(20) NOT NULL, -- email, sms, pdf
    
    -- Template content
    subject_template TEXT, -- For emails
    body_template TEXT NOT NULL, -- Main content (Jinja2 format)
    
    -- Targeting rules
    conditions JSONB, -- e.g., {"equipment_type": "Reefer", "distance_min": 500}
    priority INTEGER DEFAULT 100,
    
    -- Status
    active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID
);

CREATE INDEX idx_quote_templates_active ON quote_templates(active, priority);
CREATE INDEX idx_quote_templates_type ON quote_templates(template_type);

-- ╔══════════ Quote Follow-ups Table ═══════════════════════════════════
-- Manage automated follow-up sequences for quotes
CREATE TABLE IF NOT EXISTS quote_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    
    -- Follow-up scheduling
    followup_number INTEGER NOT NULL, -- 1st, 2nd, 3rd follow-up
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Delivery
    delivery_channel VARCHAR(20) NOT NULL, -- email, sms
    template_id UUID REFERENCES quote_templates(id),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, cancelled
    sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Response tracking
    response_received BOOLEAN DEFAULT FALSE,
    response_type VARCHAR(50),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate follow-ups
    CONSTRAINT unique_quote_followup UNIQUE (quote_id, followup_number)
);

CREATE INDEX idx_quote_followups_scheduled ON quote_followups(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_quote_followups_quote ON quote_followups(quote_id);

-- ╔══════════ Quote Analytics View ═══════════════════════════════════
-- Comprehensive view for quote performance analytics
CREATE OR REPLACE VIEW quote_analytics AS
SELECT 
    q.id,
    q.quote_number,
    q.created_at,
    q.load_id,
    l.origin_state,
    l.dest_state,
    l.equipment,
    q.quoted_rate,
    q.margin_percentage,
    q.status,
    q.valid_until,
    
    -- Timing metrics
    EXTRACT(EPOCH FROM (qe_sent.created_at - q.created_at))/60 as minutes_to_send,
    EXTRACT(EPOCH FROM (qe_viewed.created_at - qe_sent.created_at))/60 as minutes_to_view,
    EXTRACT(EPOCH FROM (qe_response.created_at - qe_sent.created_at))/3600 as hours_to_response,
    
    -- Engagement metrics
    CASE WHEN qe_viewed.id IS NOT NULL THEN TRUE ELSE FALSE END as was_viewed,
    CASE WHEN q.status IN ('accepted', 'rejected') THEN TRUE ELSE FALSE END as received_response,
    
    -- Outcome
    CASE 
        WHEN q.status = 'accepted' THEN 'won'
        WHEN q.status = 'rejected' THEN 'lost'
        WHEN q.status = 'expired' THEN 'expired'
        ELSE 'pending'
    END as outcome

FROM quotes q
LEFT JOIN loads l ON q.load_id = l.id
LEFT JOIN LATERAL (
    SELECT * FROM quote_events 
    WHERE quote_id = q.id AND event_type = 'sent' 
    ORDER BY created_at ASC LIMIT 1
) qe_sent ON TRUE
LEFT JOIN LATERAL (
    SELECT * FROM quote_events 
    WHERE quote_id = q.id AND event_type = 'viewed' 
    ORDER BY created_at ASC LIMIT 1
) qe_viewed ON TRUE
LEFT JOIN LATERAL (
    SELECT * FROM quote_events 
    WHERE quote_id = q.id AND event_type IN ('accepted', 'rejected') 
    ORDER BY created_at ASC LIMIT 1
) qe_response ON TRUE;

-- ╔══════════ Sample Templates ═══════════════════════════════════════════
-- Insert default quote templates
INSERT INTO quote_templates (name, description, template_type, subject_template, body_template, priority) VALUES
(
    'standard_email_quote',
    'Standard email quote template for all equipment types',
    'email',
    'Freight Quote #{{ quote_number }} - {{ origin_city }} to {{ dest_city }}',
    '{{ email_body }}', -- Would contain full HTML template
    100
),
(
    'urgent_email_quote',
    'Template for urgent/expedited shipments',
    'email',
    'URGENT: Quote #{{ quote_number }} - Ready for Immediate Pickup',
    '{{ urgent_email_body }}',
    110
),
(
    'standard_sms_quote',
    'Standard SMS quote template',
    'sms',
    NULL,
    '{{ company_name }}: Quote {{ quote_number }} ${{ total_rate }} for {{ origin_city }}-{{ dest_city }}. Valid {{ validity_hours }}hrs. Reply YES to accept.',
    100
)
ON CONFLICT (name) DO NOTHING;

-- ╔══════════ Helper Functions ═══════════════════════════════════════════
-- Function to schedule follow-ups for a quote
CREATE OR REPLACE FUNCTION schedule_quote_followups(
    p_quote_id UUID,
    p_followup_hours INTEGER[] DEFAULT ARRAY[24, 48, 72]
) RETURNS VOID AS $$
DECLARE
    v_created_at TIMESTAMP WITH TIME ZONE;
    v_followup_number INTEGER := 1;
    v_hours INTEGER;
BEGIN
    -- Get quote creation time
    SELECT created_at INTO v_created_at
    FROM quotes WHERE id = p_quote_id;
    
    -- Schedule each follow-up
    FOREACH v_hours IN ARRAY p_followup_hours
    LOOP
        INSERT INTO quote_followups (
            quote_id,
            followup_number,
            scheduled_at,
            delivery_channel,
            template_id
        ) VALUES (
            p_quote_id,
            v_followup_number,
            v_created_at + (v_hours || ' hours')::INTERVAL,
            'email',
            (SELECT id FROM quote_templates WHERE name = 'standard_email_quote' LIMIT 1)
        ) ON CONFLICT (quote_id, followup_number) DO NOTHING;
        
        v_followup_number := v_followup_number + 1;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to track quote view
CREATE OR REPLACE FUNCTION track_quote_view(
    p_quote_id UUID,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    -- Record view event
    INSERT INTO quote_events (quote_id, event_type, ip_address, user_agent)
    VALUES (p_quote_id, 'viewed', p_ip_address, p_user_agent);
    
    -- Update quote viewed timestamp if first view
    UPDATE quotes 
    SET viewed_at = NOW()
    WHERE id = p_quote_id AND viewed_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ╔══════════ Triggers ═══════════════════════════════════════════
-- Auto-schedule follow-ups when quote is sent
CREATE OR REPLACE FUNCTION auto_schedule_followups()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.event_type = 'sent' THEN
        PERFORM schedule_quote_followups(NEW.quote_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER schedule_followups_on_send
AFTER INSERT ON quote_events
FOR EACH ROW
EXECUTE FUNCTION auto_schedule_followups();

-- Cancel follow-ups when quote is accepted/rejected
CREATE OR REPLACE FUNCTION cancel_followups_on_response()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('accepted', 'rejected') AND OLD.status NOT IN ('accepted', 'rejected') THEN
        UPDATE quote_followups
        SET status = 'cancelled'
        WHERE quote_id = NEW.id AND status = 'pending';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cancel_followups_on_quote_response
AFTER UPDATE ON quotes
FOR EACH ROW
EXECUTE FUNCTION cancel_followups_on_response();

-- ╔══════════ Permissions ═══════════════════════════════════════════
-- Enable RLS
ALTER TABLE quote_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_followups ENABLE ROW LEVEL SECURITY;

-- Policies for quote events (read-only for users)
CREATE POLICY "Users can view quote events for their quotes" ON quote_events
    FOR SELECT USING (
        quote_id IN (
            SELECT id FROM quotes WHERE load_id IN (
                SELECT id FROM loads WHERE broker_id = auth.uid()
            )
        )
    );

-- Policies for templates (read for all, write for admins)
CREATE POLICY "All users can view active templates" ON quote_templates
    FOR SELECT USING (active = true);

-- Policies for follow-ups (tied to quote access)
CREATE POLICY "Users can view followups for their quotes" ON quote_followups
    FOR SELECT USING (
        quote_id IN (
            SELECT id FROM quotes WHERE load_id IN (
                SELECT id FROM loads WHERE broker_id = auth.uid()
            )
        )
    );

COMMENT ON TABLE quote_events IS 'Comprehensive event tracking for quote lifecycle';
COMMENT ON TABLE quote_templates IS 'Customizable templates for quote delivery';
COMMENT ON TABLE quote_followups IS 'Automated follow-up scheduling for quotes';