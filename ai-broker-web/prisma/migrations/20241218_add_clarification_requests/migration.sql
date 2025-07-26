-- CreateTable
CREATE TABLE "clarification_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "broker_id" UUID NOT NULL,
    "shipper_email" TEXT NOT NULL,
    "freight_type" TEXT NOT NULL,
    "extracted_data" JSONB NOT NULL,
    "missing_fields" TEXT[],
    "validation_warnings" TEXT[],
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "email_id" TEXT,
    "email_message_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "response_received" BOOLEAN NOT NULL DEFAULT false,
    "response_received_at" TIMESTAMP(3),
    "response_email_id" UUID,
    "merged_data" JSONB,
    "load_created" BOOLEAN NOT NULL DEFAULT false,
    "load_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clarification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_clarification_requests_broker_id" ON "clarification_requests"("broker_id");

-- CreateIndex
CREATE INDEX "idx_clarification_requests_shipper_email" ON "clarification_requests"("shipper_email");

-- CreateIndex
CREATE INDEX "idx_clarification_requests_created_at" ON "clarification_requests"("created_at");

-- CreateIndex
CREATE INDEX "idx_clarification_requests_message_id" ON "clarification_requests"("email_message_id");