-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "users" (
    "last_provider" TEXT,
    "last_login" TIMESTAMP(3),
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "provider" TEXT,
    "email" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brokers" (
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oauth_tokens" JSONB NOT NULL DEFAULT '{}',
    "api_keys" JSONB NOT NULL DEFAULT '{}',
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_name" TEXT NOT NULL,
    "user_id" UUID,
    "subscription_tier" TEXT NOT NULL DEFAULT 'trial',

    CONSTRAINT "brokers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_connections" (
    "oauth_refresh_token" TEXT,
    "provider" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_message" TEXT,
    "broker_id" UUID NOT NULL,
    "imap_password_encrypted" TEXT,
    "oauth_token_expires_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "imap_host" TEXT,
    "imap_use_ssl" BOOLEAN NOT NULL DEFAULT true,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "user_id" UUID,
    "oauth_access_token" TEXT,
    "last_checked" TIMESTAMP(3),
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "imap_port" INTEGER,
    "imap_username" TEXT,

    CONSTRAINT "email_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loads" (
    "broker_reviewed_at" TIMESTAMP(3),
    "broker_review_notes" TEXT,
    "weight_lb" INTEGER NOT NULL,
    "shipper_name" VARCHAR(255),
    "equipment" VARCHAR(50) NOT NULL,
    "complexity_overrides" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pickup_dt" TIMESTAMP(3) NOT NULL,
    "shipper_email" VARCHAR(255),
    "dest_zip" VARCHAR(10) NOT NULL,
    "shipper_phone" VARCHAR(20),
    "commodity" VARCHAR(255),
    "origin_zip" VARCHAR(10) NOT NULL,
    "source_email_id" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'NEW_RFQ',
    "reviewed_by" VARCHAR(255),
    "risk_score" INTEGER NOT NULL DEFAULT 1,
    "load_number" VARCHAR(50),
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'EMAIL',
    "source_email_account_id" UUID,
    "raw_email_text" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extraction_confidence" DECIMAL(3,2),
    "broker_id" UUID,
    "missing_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_notes" TEXT,
    "margin_target" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority_level" INTEGER NOT NULL DEFAULT 5,
    "created_by" VARCHAR(255) NOT NULL DEFAULT 'intake_agent',
    "modified_by" VARCHAR(255),
    "post_to_carriers" BOOLEAN NOT NULL DEFAULT true,
    "post_to_dat" BOOLEAN NOT NULL DEFAULT false,
    "posting_delay_minutes" INTEGER NOT NULL DEFAULT 0,
    "max_carriers_to_contact" INTEGER NOT NULL DEFAULT 10,
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "preferred_rate_per_mile" DECIMAL(10,2),
    "complexity_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requires_human_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reason" TEXT,
    "complexity_analysis" TEXT,
    "broker_review_status" VARCHAR(20),
    "assigned_specialist" VARCHAR(255),
    "hazmat" BOOLEAN NOT NULL DEFAULT false,
    "total_miles" INTEGER,
    "rate_per_mile" DECIMAL(10,2),

    CONSTRAINT "loads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carriers" (
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_contact_date" TIMESTAMP(3),
    "service_areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "credit_rating" VARCHAR(10),
    "created_by" VARCHAR(255) NOT NULL DEFAULT 'broker_ui',
    "loads_completed" INTEGER NOT NULL DEFAULT 0,
    "insurance_expiry" DATE,
    "contact_phone" VARCHAR(20),
    "preference_tier" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contact_email" VARCHAR(255) NOT NULL,
    "notes" TEXT,
    "average_rate_per_mile" DECIMAL(10,2),
    "modified_by" VARCHAR(255),
    "loads_accepted" INTEGER NOT NULL DEFAULT 0,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "contact_name" VARCHAR(255),
    "dot_number" VARCHAR(20),
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "carrier_name" VARCHAR(255) NOT NULL,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "equipment_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "mc_number" VARCHAR(20),
    "phone_number" VARCHAR(20),
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "loads_offered" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "response_method" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rate_per_mile" DECIMAL(10,2),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rate" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "responded_at" TIMESTAMP(3),
    "carrier_mc" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "load_id" UUID,
    "carrier_id" UUID,
    "carrier_name" TEXT,
    "valid_until" TIMESTAMP(3),
    "carrier_email" TEXT,
    "notes" TEXT,
    "carrier_phone" TEXT,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL,
    "load_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "broker_id" UUID NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communications" (
    "thread_id" TEXT,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "load_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "broker_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "oauth_provider" TEXT,
    "parent_message_id" UUID,
    "in_reply_to" TEXT,
    "channel" TEXT,
    "direction" TEXT,
    "message_id" TEXT,
    "extracted_data" JSONB,
    "from_address" TEXT,
    "to_address" TEXT,
    "cc_addresses" TEXT[],
    "ai_confidence" DECIMAL(3,2),
    "subject" TEXT,
    "content" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_accounts" (
    "imap_password" TEXT,
    "oauth_scope" TEXT,
    "imap_use_tls" BOOLEAN NOT NULL DEFAULT true,
    "imap_port" INTEGER,
    "token_expires_at" TIMESTAMP(3),
    "webhook_subscription_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_address" TEXT NOT NULL,
    "last_sync_at" TIMESTAMP(3),
    "webhook_secret" TEXT,
    "last_error" TEXT,
    "webhook_expires_at" TIMESTAMP(3),
    "imap_host" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "tenant_id" TEXT,
    "monitor_folders" TEXT[] DEFAULT ARRAY['INBOX']::TEXT[],
    "broker_id" UUID NOT NULL,
    "processing_enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_reply_enabled" BOOLEAN NOT NULL DEFAULT true,
    "access_token" TEXT,
    "sender_whitelist" TEXT[],
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_by" TEXT NOT NULL DEFAULT 'system',
    "refresh_token" TEXT,
    "sender_blacklist" TEXT[],
    "client_id" TEXT,
    "subject_filters" TEXT[],
    "display_name" TEXT,
    "imap_username" TEXT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AUTHORIZATION_REQUIRED',

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_processing_log" (
    "subject" TEXT,
    "email_body_text" TEXT,
    "complexity_flags" TEXT[],
    "thread_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_status" TEXT NOT NULL,
    "raw_email_headers" JSONB,
    "email_account_id" UUID,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "email_body_html" TEXT,
    "attachments_info" JSONB,
    "error_details" JSONB,
    "received_at" TIMESTAMP(3),
    "message_id" TEXT NOT NULL,
    "extraction_confidence" DECIMAL(3,2),
    "sender_email" TEXT,
    "broker_id" UUID NOT NULL,
    "intent_classification" TEXT,
    "load_id" UUID,
    "load_number" TEXT,
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_processing_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails" (
    "message_id" TEXT NOT NULL,
    "raw_data" JSONB,
    "content" TEXT,
    "processed_at" TIMESTAMP(3),
    "subject" TEXT,
    "provider" TEXT,
    "from_address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "received_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "broker_id" UUID NOT NULL,
    "to_address" TEXT NOT NULL,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "load_blasts" (
    "load_id" UUID,
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "carrier_id" UUID,
    "blast_type" VARCHAR(20) NOT NULL,
    "blast_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "subject_line" TEXT,
    "message_content" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "response_received_at" TIMESTAMP(3),
    "response_type" VARCHAR(20),
    "response_content" TEXT,
    "resend_message_id" VARCHAR(255),
    "twilio_message_id" VARCHAR(255),
    "dat_posting_id" VARCHAR(255),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" VARCHAR(255) NOT NULL DEFAULT 'loadblast_agent',

    CONSTRAINT "load_blasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "broker_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_states" (
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL,
    "provider" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "user_settings" (
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence_thresholds" JSONB NOT NULL DEFAULT '{"auto_quote": 85, "auto_dispatch": 90, "auto_carrier_select": 75}',
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notifications" JSONB NOT NULL DEFAULT '{"load_updates": true, "daily_summary": false, "action_required": true}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "brokers_email_key" ON "brokers"("email");

-- CreateIndex
CREATE INDEX "idx_brokers_email" ON "brokers"("email");

-- CreateIndex
CREATE INDEX "idx_brokers_user_id" ON "brokers"("user_id");

-- CreateIndex
CREATE INDEX "email_connections_broker_email_provider_unique" ON "email_connections"("broker_id", "email", "provider");

-- CreateIndex
CREATE INDEX "idx_email_connections_broker_id" ON "email_connections"("broker_id");

-- CreateIndex
CREATE INDEX "idx_email_connections_status" ON "email_connections"("status");

-- CreateIndex
CREATE INDEX "idx_email_connections_user_id" ON "email_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_connections_user_id_provider_email_key" ON "email_connections"("user_id", "provider", "email");

-- CreateIndex
CREATE UNIQUE INDEX "loads_load_number_key" ON "loads"("load_number");

-- CreateIndex
CREATE INDEX "loads_complexity_flags_idx" ON "loads"("complexity_flags");

-- CreateIndex
CREATE INDEX "idx_loads_assigned_specialist" ON "loads"("assigned_specialist");

-- CreateIndex
CREATE INDEX "idx_loads_broker_id" ON "loads"("broker_id");

-- CreateIndex
CREATE INDEX "idx_loads_complexity_review" ON "loads"("requires_human_review", "risk_score" DESC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_loads_created_at" ON "loads"("created_at");

-- CreateIndex
CREATE INDEX "idx_loads_origin_dest" ON "loads"("origin_zip", "dest_zip");

-- CreateIndex
CREATE INDEX "idx_loads_pickup_dt" ON "loads"("pickup_dt");

-- CreateIndex
CREATE INDEX "idx_loads_review_status" ON "loads"("broker_review_status", "broker_reviewed_at");

-- CreateIndex
CREATE INDEX "idx_loads_risk_score" ON "loads"("risk_score" DESC, "created_at");

-- CreateIndex
CREATE INDEX "idx_loads_source_email_account" ON "loads"("source_email_account_id");

-- CreateIndex
CREATE INDEX "idx_loads_status" ON "loads"("status");

-- CreateIndex
CREATE UNIQUE INDEX "carriers_contact_email_key" ON "carriers"("contact_email");

-- CreateIndex
CREATE INDEX "carriers_equipment_types_idx" ON "carriers"("equipment_types");

-- CreateIndex
CREATE INDEX "carriers_service_areas_idx" ON "carriers"("service_areas");

-- CreateIndex
CREATE INDEX "idx_carriers_email" ON "carriers"("contact_email");

-- CreateIndex
CREATE INDEX "idx_carriers_preferred" ON "carriers"("is_preferred", "preference_tier");

-- CreateIndex
CREATE INDEX "idx_carriers_status" ON "carriers"("status");

-- CreateIndex
CREATE INDEX "unique_carrier_email" ON "carriers"("contact_email");

-- CreateIndex
CREATE INDEX "idx_quotes_carrier_id" ON "quotes"("carrier_id");

-- CreateIndex
CREATE INDEX "idx_quotes_load_id" ON "quotes"("load_id");

-- CreateIndex
CREATE INDEX "idx_quotes_status" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "idx_chat_messages_broker_id" ON "chat_messages"("broker_id");

-- CreateIndex
CREATE INDEX "idx_chat_messages_created_at" ON "chat_messages"("created_at");

-- CreateIndex
CREATE INDEX "idx_chat_messages_load_id" ON "chat_messages"("load_id");

-- CreateIndex
CREATE INDEX "idx_communications_broker_id" ON "communications"("broker_id");

-- CreateIndex
CREATE INDEX "idx_communications_load_id" ON "communications"("load_id");

-- CreateIndex
CREATE INDEX "idx_communications_thread_id" ON "communications"("thread_id");

-- CreateIndex
CREATE INDEX "email_accounts_status_idx" ON "email_accounts"("status");

-- CreateIndex
CREATE INDEX "email_accounts_provider_idx" ON "email_accounts"("provider");

-- CreateIndex
CREATE INDEX "idx_email_accounts_broker_id" ON "email_accounts"("broker_id");

-- CreateIndex
CREATE INDEX "idx_email_accounts_last_sync" ON "email_accounts"("last_sync_at");

-- CreateIndex
CREATE INDEX "idx_email_accounts_token_expires" ON "email_accounts"("token_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_broker_id_email_address_key" ON "email_accounts"("broker_id", "email_address");

-- CreateIndex
CREATE INDEX "idx_email_processing_log_account_id" ON "email_processing_log"("email_account_id");

-- CreateIndex
CREATE INDEX "idx_email_processing_log_broker_id" ON "email_processing_log"("broker_id");

-- CreateIndex
CREATE INDEX "idx_email_processing_log_processed_at" ON "email_processing_log"("processed_at");

-- CreateIndex
CREATE INDEX "idx_email_processing_log_sender" ON "email_processing_log"("sender_email");

-- CreateIndex
CREATE INDEX "idx_email_processing_log_status" ON "email_processing_log"("processing_status");

-- CreateIndex
CREATE UNIQUE INDEX "email_processing_log_email_account_id_message_id_key" ON "email_processing_log"("email_account_id", "message_id");

-- CreateIndex
CREATE UNIQUE INDEX "emails_message_id_key" ON "emails"("message_id");

-- CreateIndex
CREATE INDEX "idx_emails_broker_id" ON "emails"("broker_id");

-- CreateIndex
CREATE INDEX "idx_emails_message_id" ON "emails"("message_id");

-- CreateIndex
CREATE INDEX "idx_emails_received_at" ON "emails"("received_at");

-- CreateIndex
CREATE INDEX "idx_emails_status" ON "emails"("status");

-- CreateIndex
CREATE INDEX "idx_load_blasts_carrier_id" ON "load_blasts"("carrier_id");

-- CreateIndex
CREATE INDEX "idx_load_blasts_load_id" ON "load_blasts"("load_id");

-- CreateIndex
CREATE INDEX "idx_load_blasts_sent_at" ON "load_blasts"("sent_at");

-- CreateIndex
CREATE INDEX "idx_load_blasts_status" ON "load_blasts"("blast_status");

-- CreateIndex
CREATE INDEX "idx_notifications_broker_id" ON "notifications"("broker_id");

-- CreateIndex
CREATE INDEX "idx_notifications_created_at" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "idx_notifications_read" ON "notifications"("read");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_states_state_key" ON "oauth_states"("state");

-- CreateIndex
CREATE INDEX "idx_oauth_states_expires_at" ON "oauth_states"("expires_at");

-- CreateIndex
CREATE INDEX "idx_oauth_states_state" ON "oauth_states"("state");

-- CreateIndex
CREATE INDEX "idx_oauth_states_user_id" ON "oauth_states"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");
