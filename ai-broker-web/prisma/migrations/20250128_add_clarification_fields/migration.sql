-- Add missing fields for IntakeAgentWithClarification
ALTER TABLE "loads" 
ADD COLUMN IF NOT EXISTS "freight_type" VARCHAR(50) DEFAULT 'UNKNOWN',
ADD COLUMN IF NOT EXISTS "pickup_location" TEXT,
ADD COLUMN IF NOT EXISTS "delivery_location" TEXT,
ADD COLUMN IF NOT EXISTS "weight" INTEGER,
ADD COLUMN IF NOT EXISTS "pickup_date" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "equipment_type" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "temperature" JSONB,
ADD COLUMN IF NOT EXISTS "dimensions" JSONB,
ADD COLUMN IF NOT EXISTS "hazmat_class" VARCHAR(10),
ADD COLUMN IF NOT EXISTS "un_number" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "proper_shipping_name" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "packing_group" VARCHAR(5),
ADD COLUMN IF NOT EXISTS "emergency_contact" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "technical_name" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "special_requirements" TEXT,
ADD COLUMN IF NOT EXISTS "freight_class" VARCHAR(10),
ADD COLUMN IF NOT EXISTS "piece_count" INTEGER,
ADD COLUMN IF NOT EXISTS "thread_id" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "original_email_subject" TEXT,
ADD COLUMN IF NOT EXISTS "original_email_content" TEXT;

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS "idx_loads_freight_type" ON "loads"("freight_type");
CREATE INDEX IF NOT EXISTS "idx_loads_thread_id" ON "loads"("thread_id");

-- Add comments for clarity
COMMENT ON COLUMN "loads"."freight_type" IS 'Type of freight: FTL_DRY_VAN, FTL_REEFER, FTL_FLATBED, FTL_HAZMAT, LTL, PARTIAL, UNKNOWN';
COMMENT ON COLUMN "loads"."temperature" IS 'Temperature requirements as JSON: {min: number, max: number, unit: F|C}';
COMMENT ON COLUMN "loads"."dimensions" IS 'Dimensions as JSON: {length: number, width: number, height: number}';
COMMENT ON COLUMN "loads"."thread_id" IS 'Email thread ID for tracking clarification conversations';