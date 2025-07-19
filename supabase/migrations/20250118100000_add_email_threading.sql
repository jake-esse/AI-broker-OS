-- ===============================================================================
-- AI-Broker MVP · Email Threading and Incomplete Load Support Migration
-- ===============================================================================
--
-- BUSINESS PURPOSE:
-- This migration adds support for handling incomplete load requests and email
-- threading to enable back-and-forth communication with shippers. When a load
-- request is missing required information, the system can now:
-- 1. Store the partial information received
-- 2. Send an automated email requesting missing details
-- 3. Track the email conversation thread
-- 4. Resume processing when the shipper provides additional information
--
-- WORKFLOW INTEGRATION:
-- 1. Intake Agent creates incomplete loads → Sets is_complete = false
-- 2. System sends email asking for missing info → Records thread details
-- 3. Shipper replies with additional info → Email linked via thread_id
-- 4. Intake Agent updates load → Runs complexity detection on new info
-- 5. Load becomes complete → Ready for LoadBlast Agent processing
--
-- TECHNICAL ARCHITECTURE:
-- - Email threading via Message-ID and In-Reply-To headers
-- - Thread tracking to link multiple emails to same load
-- - JSON storage for conversation history
-- - Status tracking for incomplete loads
--
-- BUSINESS RULES:
-- - Incomplete loads cannot be sent to carriers (LoadBlast blocked)
-- - Each missing info request tracks what fields were requested
-- - Email threads maintain full conversation history for audit
-- - Complexity detection runs on all new information received
-- ===============================================================================

-- ─── EMAIL THREADING FIELDS ─────────────────────────────────────────────────
-- Add fields to support email conversation threading
ALTER TABLE loads
ADD COLUMN IF NOT EXISTS thread_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS original_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS latest_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS in_reply_to VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_conversation JSONB DEFAULT '[]'::JSONB;

-- ─── INCOMPLETE LOAD TRACKING ────────────────────────────────────────────────
-- Add fields to track incomplete loads and missing information requests
ALTER TABLE loads
ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS missing_info_requested_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS missing_info_reminder_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS fields_requested TEXT[],
ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0;

-- ─── INDEXES FOR EMAIL THREADING PERFORMANCE ─────────────────────────────────
-- Index for finding loads by email thread
CREATE INDEX IF NOT EXISTS idx_loads_thread_id ON loads(thread_id);

-- Index for finding loads by message ID (for reply matching)
CREATE INDEX IF NOT EXISTS idx_loads_message_ids ON loads(original_message_id, latest_message_id);

-- Index for incomplete loads requiring follow-up
CREATE INDEX IF NOT EXISTS idx_loads_incomplete ON loads(is_complete, missing_info_requested_at) 
WHERE is_complete = FALSE;

-- ===============================================================================
-- UPDATE NOTIFICATION FUNCTION FOR INCOMPLETE LOADS
-- ===============================================================================
-- Modify the existing notification function to handle incomplete loads differently
CREATE OR REPLACE FUNCTION notify_new_load()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify for complete NEW_RFQ status loads
    -- Incomplete loads should not trigger carrier outreach
    IF NEW.status = 'NEW_RFQ' AND NEW.is_complete = TRUE THEN
        -- Send PostgreSQL notification with load details
        -- LoadBlast Agent listens for these notifications
        PERFORM pg_notify('load.created', 
            json_build_object(
                'load_id', NEW.id,
                'load_number', NEW.load_number,
                'origin_zip', NEW.origin_zip,
                'dest_zip', NEW.dest_zip,
                'pickup_dt', NEW.pickup_dt,
                'equipment', NEW.equipment,
                'weight_lb', NEW.weight_lb,
                'is_complete', NEW.is_complete
            )::text
        );
    -- Notify when an incomplete load becomes complete
    ELSIF OLD.is_complete = FALSE AND NEW.is_complete = TRUE AND NEW.status = 'NEW_RFQ' THEN
        PERFORM pg_notify('load.completed', 
            json_build_object(
                'load_id', NEW.id,
                'load_number', NEW.load_number,
                'thread_id', NEW.thread_id,
                'follow_up_count', NEW.follow_up_count
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Recreate the trigger to use the updated function
DROP TRIGGER IF EXISTS trigger_notify_new_load ON loads;
CREATE TRIGGER trigger_notify_new_load
    AFTER INSERT OR UPDATE ON loads
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_load();

-- ===============================================================================
-- FUNCTION TO APPEND EMAIL TO CONVERSATION HISTORY
-- ===============================================================================
-- Helper function to maintain email conversation history in JSONB format
CREATE OR REPLACE FUNCTION append_email_to_conversation(
    load_id UUID,
    email_data JSONB
) RETURNS VOID AS $$
BEGIN
    UPDATE loads
    SET email_conversation = email_conversation || jsonb_build_array(email_data),
        latest_message_id = email_data->>'message_id',
        updated_at = NOW()
    WHERE id = load_id;
END;
$$ LANGUAGE plpgsql;

-- ===============================================================================
-- VIEW FOR INCOMPLETE LOADS DASHBOARD
-- ===============================================================================
-- Provides easy access to loads awaiting shipper response
CREATE OR REPLACE VIEW incomplete_loads_view AS
SELECT 
    l.id,
    l.load_number,
    l.created_at,
    l.shipper_name,
    l.shipper_email,
    l.missing_fields,
    l.fields_requested,
    l.missing_info_requested_at,
    l.follow_up_count,
    l.thread_id,
    -- Calculate time since last request
    EXTRACT(EPOCH FROM (NOW() - l.missing_info_requested_at))/3600 AS hours_since_request,
    -- Show available fields
    CASE WHEN l.origin_zip IS NOT NULL THEN 'origin_zip' ELSE NULL END AS has_origin,
    CASE WHEN l.dest_zip IS NOT NULL THEN 'dest_zip' ELSE NULL END AS has_dest,
    CASE WHEN l.pickup_dt IS NOT NULL THEN 'pickup_dt' ELSE NULL END AS has_pickup,
    CASE WHEN l.equipment IS NOT NULL THEN 'equipment' ELSE NULL END AS has_equipment,
    CASE WHEN l.weight_lb IS NOT NULL THEN 'weight_lb' ELSE NULL END AS has_weight
FROM loads l
WHERE l.is_complete = FALSE
ORDER BY l.created_at DESC;

-- ===============================================================================
-- SAMPLE INCOMPLETE LOAD FOR TESTING
-- ===============================================================================
-- Creates a sample incomplete load to test the new workflow
INSERT INTO loads (
    origin_zip, dest_zip, pickup_dt, equipment, weight_lb,
    shipper_name, shipper_email, commodity,
    source_type, ai_notes, extraction_confidence,
    is_complete, missing_fields, thread_id,
    original_message_id
) VALUES (
    '90210', NULL, '2024-01-20 14:00:00-08:00', 'Van', NULL,
    'Incomplete Shipper Corp', 'incomplete@example.com', 'General Freight',
    'EMAIL', 'Sample incomplete load for testing email threading', 0.65,
    FALSE, ARRAY['dest_zip', 'weight_lb'], 'thread-' || uuid_generate_v4(),
    '<sample-message-id@example.com>'
) ON CONFLICT (load_number) DO NOTHING;

-- ===============================================================================
-- MAINTENANCE NOTES
-- ===============================================================================
-- 
-- MONITORING:
-- - Track incomplete loads aging > 24 hours for manual follow-up
-- - Monitor email_conversation size for very long threads
-- - Alert on loads with follow_up_count > 3 (potential issues)
--
-- PERFORMANCE:
-- - Consider archiving email_conversation to separate table if size grows
-- - Implement automatic reminder logic for stale incomplete loads
-- - Add TTL policy for incomplete loads older than 7 days
--
-- FUTURE ENHANCEMENTS:
-- - Add email template versioning for A/B testing response rates
-- - Implement smart field detection from partial responses
-- - Add natural language processing for email intent classification
-- - Create automated reminder scheduling based on shipper patterns
-- ===============================================================================