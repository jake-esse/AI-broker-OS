-- Add clarification-related fields to loads table
ALTER TABLE loads 
ADD COLUMN IF NOT EXISTS thread_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS original_email_subject TEXT,
ADD COLUMN IF NOT EXISTS original_email_content TEXT,
ADD COLUMN IF NOT EXISTS last_clarification_sent TIMESTAMP,
ADD COLUMN IF NOT EXISTS clarification_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS freight_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS pickup_location TEXT,
ADD COLUMN IF NOT EXISTS delivery_location TEXT,
ADD COLUMN IF NOT EXISTS pickup_date DATE,
ADD COLUMN IF NOT EXISTS equipment_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS weight INT,
ADD COLUMN IF NOT EXISTS temperature JSON,
ADD COLUMN IF NOT EXISTS dimensions JSON,
ADD COLUMN IF NOT EXISTS hazmat_class VARCHAR(20),
ADD COLUMN IF NOT EXISTS un_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS proper_shipping_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS packing_group VARCHAR(10),
ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(255),
ADD COLUMN IF NOT EXISTS technical_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS special_requirements TEXT,
ADD COLUMN IF NOT EXISTS freight_class VARCHAR(20),
ADD COLUMN IF NOT EXISTS piece_count INT;

-- Add indexes for clarification workflow
CREATE INDEX IF NOT EXISTS idx_loads_thread_id ON loads(thread_id);
CREATE INDEX IF NOT EXISTS idx_loads_status_clarification ON loads(status) WHERE status = 'AWAITING_INFO';
CREATE INDEX IF NOT EXISTS idx_loads_freight_type ON loads(freight_type);

-- Update existing status values if needed
UPDATE loads SET status = 'READY_TO_QUOTE' WHERE status = 'NEW_RFQ' AND missing_fields = '{}';
UPDATE loads SET status = 'AWAITING_INFO' WHERE status = 'NEW_RFQ' AND missing_fields != '{}';

-- Add comments for documentation
COMMENT ON COLUMN loads.thread_id IS 'Email thread ID for tracking clarification conversations';
COMMENT ON COLUMN loads.original_email_subject IS 'Subject of the original load request email';
COMMENT ON COLUMN loads.original_email_content IS 'Content of the original load request email';
COMMENT ON COLUMN loads.last_clarification_sent IS 'Timestamp of the last clarification email sent';
COMMENT ON COLUMN loads.clarification_count IS 'Number of clarification emails sent for this load';
COMMENT ON COLUMN loads.freight_type IS 'Type of freight (FTL_DRY_VAN, FTL_REEFER, FTL_FLATBED, FTL_HAZMAT, LTL, PARTIAL)';
COMMENT ON COLUMN loads.pickup_location IS 'Complete pickup address';
COMMENT ON COLUMN loads.delivery_location IS 'Complete delivery address';
COMMENT ON COLUMN loads.temperature IS 'Temperature requirements (JSON: {min, max, unit})';
COMMENT ON COLUMN loads.dimensions IS 'Shipment dimensions (JSON: {length, width, height})';