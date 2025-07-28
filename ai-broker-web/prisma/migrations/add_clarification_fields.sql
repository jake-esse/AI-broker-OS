-- Add clarification-related fields to loads table
ALTER TABLE "loads" 
ADD COLUMN IF NOT EXISTS "thread_id" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "original_email_subject" TEXT,
ADD COLUMN IF NOT EXISTS "original_email_content" TEXT,
ADD COLUMN IF NOT EXISTS "last_clarification_sent" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "clarification_count" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "freight_type" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "pickup_location" TEXT,
ADD COLUMN IF NOT EXISTS "delivery_location" TEXT,
ADD COLUMN IF NOT EXISTS "pickup_date" DATE,
ADD COLUMN IF NOT EXISTS "equipment_type" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "weight" INTEGER,
ADD COLUMN IF NOT EXISTS "temperature" JSONB,
ADD COLUMN IF NOT EXISTS "dimensions" JSONB,
ADD COLUMN IF NOT EXISTS "hazmat_class" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "un_number" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "proper_shipping_name" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "packing_group" VARCHAR(10),
ADD COLUMN IF NOT EXISTS "emergency_contact" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "technical_name" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "special_requirements" TEXT,
ADD COLUMN IF NOT EXISTS "freight_class" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "piece_count" INTEGER;

-- Add indexes for clarification workflow
CREATE INDEX IF NOT EXISTS "idx_loads_thread_id" ON "loads"("thread_id");
CREATE INDEX IF NOT EXISTS "idx_loads_freight_type" ON "loads"("freight_type");