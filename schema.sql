-- AI Broker Database Schema
-- Exported from Supabase

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create custom types if they don't exist
DO $$ BEGIN
    CREATE TYPE connection_status AS ENUM ('ACTIVE', 'ERROR', 'AUTHORIZATION_REQUIRED', 'RECONNECT_REQUIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE email_provider AS ENUM ('gmail', 'outlook', 'exchange', 'imap');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- BROKERS TABLE
CREATE TABLE IF NOT EXISTS brokers (
    updated_at timestamptz DEFAULT now(), 
    email text NOT NULL, 
    preferences jsonb DEFAULT '{}'::jsonb, 
    created_at timestamptz DEFAULT now(), 
    oauth_tokens jsonb DEFAULT '{}'::jsonb, 
    api_keys jsonb DEFAULT '{}'::jsonb, 
    id uuid NOT NULL DEFAULT uuid_generate_v4(), 
    company_name text NOT NULL, 
    user_id uuid, 
    subscription_tier text DEFAULT 'trial'::text,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_brokers_email ON brokers USING btree (email);
CREATE INDEX IF NOT EXISTS brokers_email_key ON brokers USING btree (email);
CREATE INDEX IF NOT EXISTS idx_brokers_user_id ON brokers USING btree (user_id);

-- CARRIER_PERFORMANCE_SUMMARY TABLE
CREATE TABLE IF NOT EXISTS carrier_performance_summary (
    preference_tier integer, 
    completion_rate_percent numeric, 
    average_rate_per_mile numeric, 
    loads_offered integer, 
    equipment_types text[], 
    updated_at timestamptz, 
    contact_email varchar(255), 
    service_areas text[], 
    id uuid, 
    created_at timestamptz, 
    last_contact_date timestamptz, 
    contact_status text, 
    carrier_name varchar(255), 
    status varchar(20), 
    acceptance_rate_percent numeric, 
    loads_completed integer, 
    credit_rating varchar(10), 
    loads_accepted integer
);

-- CARRIER_QUOTES TABLE
CREATE TABLE IF NOT EXISTS carrier_quotes (
    id bigint NOT NULL DEFAULT nextval('carrier_quotes_id_seq'::regclass), 
    email_msg_id text, 
    updated_at timestamptz DEFAULT now(), 
    received_at timestamptz DEFAULT now(), 
    special_notes text, 
    raw_email_content text, 
    extraction_confidence numeric DEFAULT 0.0, 
    equipment_type text, 
    load_id bigint, 
    delivery_date date, 
    score numeric, 
    pickup_date date, 
    status text DEFAULT 'NEW'::text, 
    rate_type text, 
    carrier_id bigint, 
    quoted_rate numeric, 
    accessorials text, 
    created_at timestamptz DEFAULT now(), 
    fuel_surcharge numeric,
    PRIMARY KEY (id)
);

-- Create sequence if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS carrier_quotes_id_seq;

CREATE INDEX IF NOT EXISTS carrier_quotes_load_id_idx ON carrier_quotes USING btree (load_id);
CREATE INDEX IF NOT EXISTS carrier_quotes_carrier_id_idx ON carrier_quotes USING btree (carrier_id);
CREATE INDEX IF NOT EXISTS carrier_quotes_score_idx ON carrier_quotes USING btree (score DESC);
CREATE INDEX IF NOT EXISTS carrier_quotes_status_idx ON carrier_quotes USING btree (status);

-- CARRIERS TABLE
CREATE TABLE IF NOT EXISTS carriers (
    updated_at timestamptz DEFAULT now(), 
    last_contact_date timestamptz, 
    service_areas text[] DEFAULT ARRAY[]::text[], 
    credit_rating varchar(10), 
    created_by varchar(255) DEFAULT 'broker_ui'::character varying, 
    loads_completed integer DEFAULT 0, 
    insurance_expiry date, 
    contact_phone varchar(20), 
    preference_tier integer DEFAULT 3, 
    created_at timestamptz DEFAULT now(), 
    contact_email varchar(255) NOT NULL, 
    notes text, 
    average_rate_per_mile numeric, 
    modified_by varchar(255), 
    loads_accepted integer DEFAULT 0, 
    sms_enabled boolean DEFAULT false, 
    contact_name varchar(255), 
    dot_number varchar(20), 
    id uuid NOT NULL DEFAULT uuid_generate_v4(), 
    carrier_name varchar(255) NOT NULL, 
    is_preferred boolean DEFAULT false, 
    equipment_types text[] DEFAULT ARRAY[]::text[], 
    status varchar(20) DEFAULT 'ACTIVE'::character varying, 
    mc_number varchar(20), 
    phone_number varchar(20), 
    email_enabled boolean DEFAULT true, 
    loads_offered integer DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS unique_carrier_email ON carriers USING btree (contact_email);
CREATE INDEX IF NOT EXISTS idx_carriers_equipment ON carriers USING gin (equipment_types);
CREATE INDEX IF NOT EXISTS idx_carriers_preferred ON carriers USING btree (is_preferred, preference_tier);
CREATE INDEX IF NOT EXISTS idx_carriers_status ON carriers USING btree (status);
CREATE INDEX IF NOT EXISTS idx_carriers_email ON carriers USING btree (contact_email);
CREATE INDEX IF NOT EXISTS idx_carriers_service_areas ON carriers USING gin (service_areas);

-- CHAT_MESSAGES TABLE
CREATE TABLE IF NOT EXISTS chat_messages (
    created_at timestamptz DEFAULT now(), 
    role text NOT NULL, 
    load_id uuid NOT NULL, 
    content text NOT NULL, 
    id uuid NOT NULL DEFAULT gen_random_uuid(), 
    broker_id uuid NOT NULL, 
    metadata jsonb,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_load_id ON chat_messages USING btree (load_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_broker_id ON chat_messages USING btree (broker_id);

-- COMMUNICATIONS TABLE
CREATE TABLE IF NOT EXISTS communications (
    thread_id text, 
    ai_generated boolean DEFAULT false, 
    id uuid NOT NULL DEFAULT uuid_generate_v4(), 
    load_id uuid, 
    updated_at timestamptz DEFAULT now(), 
    broker_id uuid, 
    created_at timestamptz DEFAULT now(), 
    status text DEFAULT 'sent'::text, 
    oauth_provider text, 
    parent_message_id uuid, 
    in_reply_to text, 
    channel text, 
    direction text, 
    message_id text, 
    extracted_data jsonb, 
    from_address text, 
    to_address text, 
    cc_addresses text[], 
    ai_confidence numeric, 
    subject text, 
    content text, 
    attachments jsonb DEFAULT '[]'::jsonb,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_communications_load_id ON communications USING btree (load_id);
CREATE INDEX IF NOT EXISTS idx_communications_thread_id ON communications USING btree (thread_id);
CREATE INDEX IF NOT EXISTS idx_communications_broker_id ON communications USING btree (broker_id);

-- COMPLEXITY_TYPES TABLE
CREATE TABLE IF NOT EXISTS complexity_types (
    documentation_required text, 
    complexity_code varchar(20) NOT NULL, 
    complexity_name varchar(100) NOT NULL, 
    created_at timestamptz DEFAULT now(), 
    equipment_triggers text[] DEFAULT ARRAY[]::text[], 
    handling_instructions text, 
    weight_triggers jsonb, 
    created_by varchar(255) DEFAULT 'system'::character varying, 
    detection_keywords text[] DEFAULT ARRAY[]::text[], 
    requires_escort boolean DEFAULT false, 
    updated_at timestamptz DEFAULT now(), 
    priority_level integer DEFAULT 3, 
    carrier_requirements text, 
    requires_permits boolean DEFAULT false, 
    base_risk_score integer DEFAULT 1, 
    detection_patterns text[] DEFAULT ARRAY[]::text[], 
    requires_special_equipment boolean DEFAULT false, 
    id uuid NOT NULL DEFAULT uuid_generate_v4(), 
    requires_certification boolean DEFAULT false,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_complexity_types_code ON complexity_types USING btree (complexity_code);
CREATE INDEX IF NOT EXISTS complexity_types_complexity_code_key ON complexity_types USING btree (complexity_code);

-- EMAIL_ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS email_accounts (
    imap_password text, 
    oauth_scope text, 
    provider email_provider NOT NULL, 
    imap_use_tls boolean DEFAULT true, 
    status connection_status NOT NULL DEFAULT 'AUTHORIZATION_REQUIRED'::connection_status, 
    imap_port integer, 
    token_expires_at timestamptz, 
    webhook_subscription_id text, 
    updated_at timestamptz DEFAULT now(), 
    email_address text NOT NULL, 
    last_sync_at timestamptz, 
    webhook_secret text, 
    last_error text, 
    webhook_expires_at timestamptz, 
    imap_host text, 
    created_at timestamptz DEFAULT now(), 
    error_count integer DEFAULT 0, 
    tenant_id text, 
    monitor_folders text[] DEFAULT ARRAY['INBOX'::text], 
    broker_id uuid NOT NULL, 
    processing_enabled boolean DEFAULT true, 
    auto_reply_enabled boolean DEFAULT true, 
    access_token text, 
    sender_whitelist text[], 
    id uuid NOT NULL DEFAULT gen_random_uuid(), 
    created_by text DEFAULT 'system'::text, 
    refresh_token text, 
    sender_blacklist text[], 
    client_id text, 
    subject_filters text[], 
    display_name text, 
    imap_username text,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_status ON email_accounts USING btree (status);
CREATE INDEX IF NOT EXISTS idx_email_accounts_last_sync ON email_accounts USING btree (last_sync_at);
CREATE INDEX IF NOT EXISTS idx_email_accounts_broker_id ON email_accounts USING btree (broker_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_provider ON email_accounts USING btree (provider);
CREATE INDEX IF NOT EXISTS email_accounts_broker_id_email_address_key ON email_accounts USING btree (broker_id, email_address);
CREATE INDEX IF NOT EXISTS idx_email_accounts_token_expires ON email_accounts USING btree (token_expires_at);

-- EMAIL_ATTACHMENTS TABLE
CREATE TABLE IF NOT EXISTS email_attachments (
    email_id uuid NOT NULL, 
    filename text NOT NULL, 
    content_type text, 
    storage_path text, 
    created_at timestamptz DEFAULT now(), 
    id uuid NOT NULL DEFAULT gen_random_uuid(), 
    size integer,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_email_id ON email_attachments USING btree (email_id);

-- EMAIL_CONNECTIONS TABLE
CREATE TABLE IF NOT EXISTS email_connections (
    oauth_refresh_token text, 
    provider text NOT NULL, 
    updated_at timestamptz DEFAULT now(), 
    created_at timestamptz DEFAULT now(), 
    error_message text, 
    broker_id uuid NOT NULL, 
    imap_password_encrypted text, 
    oauth_token_expires_at timestamptz, 
    status text NOT NULL DEFAULT 'active'::text, 
    imap_host text, 
    imap_use_ssl boolean DEFAULT true, 
    is_primary boolean DEFAULT false, 
    user_id uuid, 
    oauth_access_token text, 
    last_checked timestamptz, 
    id uuid NOT NULL DEFAULT gen_random_uuid(), 
    email text NOT NULL, 
    imap_port integer, 
    imap_username text,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_email_connections_user_id ON email_connections USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_email_connections_status ON email_connections USING btree (status);
CREATE INDEX IF NOT EXISTS idx_email_connections_broker_id ON email_connections USING btree (broker_id);
CREATE INDEX IF NOT EXISTS email_connections_broker_email_provider_unique ON email_connections USING btree (broker_id, email, provider);
CREATE INDEX IF NOT EXISTS email_connections_user_provider_email_key ON email_connections USING btree (user_id, provider, email);

-- EMAIL_PROCESSING_LOG TABLE
CREATE TABLE IF NOT EXISTS email_processing_log (
    subject text, 
    email_body_text text, 
    complexity_flags text[], 
    thread_id text, 
    created_at timestamptz DEFAULT now(), 
    processing_status text NOT NULL, 
    raw_email_headers jsonb, 
    email_account_id uuid, 
    id uuid NOT NULL DEFAULT gen_random_uuid(), 
    retry_count integer DEFAULT 0, 
    email_body_html text, 
    attachments_info jsonb, 
    error_details jsonb, 
    received_at timestamptz, 
    message_id text NOT NULL, 
    extraction_confidence numeric, 
    sender_email text, 
    broker_id uuid NOT NULL, 
    intent_classification text, 
    load_id uuid, 
    load_number text, 
    error_message text, 
    processed_at timestamptz DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_email_processing_log_status ON email_processing_log USING btree (processing_status);
CREATE INDEX IF NOT EXISTS idx_email_processing_log_sender ON email_processing_log USING btree (sender_email);
CREATE INDEX IF NOT EXISTS unique_message_per_account ON email_processing_log USING btree (email_account_id, message_id);
CREATE INDEX IF NOT EXISTS idx_email_processing_log_processed_at ON email_processing_log USING btree (processed_at);
CREATE INDEX IF NOT EXISTS idx_email_processing_log_account_id ON email_processing_log USING btree (email_account_id);
CREATE INDEX IF NOT EXISTS idx_email_processing_log_broker_id ON email_processing_log USING btree (broker_id);

-- EMAILS TABLE
CREATE TABLE IF NOT EXISTS emails (
    message_id text NOT NULL, 
    raw_data jsonb, 
    content text, 
    processed_at timestamptz DEFAULT now(), 
    subject text, 
    provider text, 
    from_address text NOT NULL, 
    status text NOT NULL DEFAULT 'received'::text, 
    received_at timestamptz NOT NULL, 
    created_at timestamptz DEFAULT now(), 
    id uuid NOT NULL DEFAULT gen_random_uuid(), 
    broker_id uuid NOT NULL, 
    to_address text NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails USING btree (received_at);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails USING btree (status);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails USING btree (message_id);
CREATE INDEX IF NOT EXISTS idx_emails_broker_id ON emails USING btree (broker_id);

-- EQUIPMENT_COVERAGE_ANALYSIS TABLE (View or Materialized View)
CREATE TABLE IF NOT EXISTS equipment_coverage_analysis (
    equipment_type text, 
    avg_acceptance_rate numeric, 
    tier_3_count bigint, 
    tier_2_count bigint, 
    tier_1_count bigint, 
    carrier_count bigint, 
    preferred_count bigint
);

-- LOAD_BLASTS TABLE
CREATE TABLE IF NOT EXISTS load_blasts (
    load_id uuid, 
    id uuid NOT NULL DEFAULT uuid_generate_v4(), 
    created_at timestamptz DEFAULT now(), 
    carrier_id uuid, 
    blast_type varchar(20) NOT NULL, 
    blast_status varchar(20) DEFAULT 'PENDING'::character varying, 
    subject_line text, 
    message_content text, 
    sent_at timestamptz, 
    delivered_at timestamptz, 
    opened_at timestamptz, 
    clicked_at timestamptz, 
    response_received_at timestamptz, 
    response_type varchar(20), 
    response_content text, 
    resend_message_id varchar(255), 
    twilio_message_id varchar(255), 
    dat_posting_id varchar(255), 
    error_message text, 
    retry_count integer DEFAULT 0, 
    created_by varchar(255) DEFAULT 'loadblast_agent'::character varying,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_load_blasts_load_id ON load_blasts USING btree (load_id);
CREATE INDEX IF NOT EXISTS idx_load_blasts_sent_at ON load_blasts USING btree (sent_at);
CREATE INDEX IF NOT EXISTS idx_load_blasts_status ON load_blasts USING btree (blast_status);
CREATE INDEX IF NOT EXISTS idx_load_blasts_carrier_id ON load_blasts USING btree (carrier_id);

-- LOADS TABLE
CREATE TABLE IF NOT EXISTS loads (
    broker_reviewed_at timestamptz, 
    broker_review_notes text, 
    weight_lb integer NOT NULL, 
    shipper_name varchar(255), 
    equipment varchar(50) NOT NULL, 
    complexity_overrides text[] DEFAULT ARRAY[]::text[], 
    pickup_dt timestamptz NOT NULL, 
    shipper_email varchar(255), 
    dest_zip varchar(10) NOT NULL, 
    shipper_phone varchar(20), 
    commodity varchar(255), 
    origin_zip varchar(10) NOT NULL, 
    source_email_id varchar(255), 
    status varchar(20) DEFAULT 'NEW_RFQ'::character varying, 
    reviewed_by varchar(255), 
    risk_score integer DEFAULT 1, 
    load_number varchar(50), 
    source_type varchar(20) DEFAULT 'EMAIL'::character varying, 
    source_email_account_id uuid, 
    raw_email_text text, 
    updated_at timestamptz DEFAULT now(), 
    extraction_confidence numeric, 
    broker_id uuid, 
    missing_fields text[], 
    ai_notes text, 
    margin_target numeric, 
    created_at timestamptz DEFAULT now(), 
    priority_level integer DEFAULT 5, 
    created_by varchar(255) DEFAULT 'intake_agent'::character varying, 
    modified_by varchar(255), 
    post_to_carriers boolean DEFAULT true, 
    post_to_dat boolean DEFAULT false, 
    posting_delay_minutes integer DEFAULT 0, 
    max_carriers_to_contact integer DEFAULT 10, 
    id uuid NOT NULL DEFAULT uuid_generate_v4(), 
    preferred_rate_per_mile numeric, 
    complexity_flags text[] DEFAULT ARRAY[]::text[], 
    requires_human_review boolean DEFAULT false, 
    review_reason text, 
    complexity_analysis text, 
    broker_review_status varchar(20), 
    assigned_specialist varchar(255), 
    hazmat boolean DEFAULT false, 
    total_miles integer, 
    rate_per_mile numeric,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_loads_origin_dest ON loads USING btree (origin_zip, dest_zip);
CREATE INDEX IF NOT EXISTS idx_loads_broker_id ON loads USING btree (broker_id);
CREATE INDEX IF NOT EXISTS idx_loads_source_email_account ON loads USING btree (source_email_account_id);
CREATE INDEX IF NOT EXISTS idx_loads_risk_score ON loads USING btree (risk_score DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_loads_review_status ON loads USING btree (broker_review_status, broker_reviewed_at);
CREATE INDEX IF NOT EXISTS idx_loads_complexity_review ON loads USING btree (requires_human_review, risk_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loads_assigned_specialist ON loads USING btree (assigned_specialist);
CREATE INDEX IF NOT EXISTS idx_loads_complexity_flags ON loads USING gin (complexity_flags);
CREATE INDEX IF NOT EXISTS loads_load_number_key ON loads USING btree (load_number);
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads USING btree (status);
CREATE INDEX IF NOT EXISTS idx_loads_pickup_dt ON loads USING btree (pickup_dt);
CREATE INDEX IF NOT EXISTS idx_loads_created_at ON loads USING btree (created_at);

-- NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(), 
    type text NOT NULL, 
    title text NOT NULL, 
    read boolean DEFAULT false, 
    metadata jsonb, 
    broker_id uuid NOT NULL, 
    created_at timestamptz DEFAULT now(), 
    message text NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_broker_id ON notifications USING btree (broker_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications USING btree (read);

-- OAUTH_STATES TABLE
CREATE TABLE IF NOT EXISTS oauth_states (
    created_at timestamptz DEFAULT now(), 
    user_id uuid NOT NULL, 
    expires_at timestamptz NOT NULL, 
    state text NOT NULL, 
    provider text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states USING btree (state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_id ON oauth_states USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states USING btree (expires_at);

-- PROFILES TABLE
CREATE TABLE IF NOT EXISTS profiles (
    created_at timestamptz NOT NULL DEFAULT now(), 
    id uuid NOT NULL, 
    onboarding_completed_at timestamptz, 
    updated_at timestamptz NOT NULL DEFAULT now(), 
    company_name text, 
    phone text, 
    onboarding_completed boolean DEFAULT false, 
    mc_number text,
    PRIMARY KEY (id)
);

-- QUOTES TABLE
CREATE TABLE IF NOT EXISTS quotes (
    response_method text, 
    sent_at timestamptz DEFAULT now(), 
    rate_per_mile numeric, 
    updated_at timestamptz DEFAULT now(), 
    rate numeric, 
    status text DEFAULT 'pending'::text, 
    id uuid NOT NULL DEFAULT uuid_generate_v4(), 
    responded_at timestamptz, 
    carrier_mc text, 
    created_at timestamptz DEFAULT now(), 
    load_id uuid, 
    carrier_id uuid, 
    carrier_name text, 
    valid_until timestamptz, 
    carrier_email text, 
    notes text, 
    carrier_phone text,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_quotes_load_id ON quotes USING btree (load_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes USING btree (status);
CREATE INDEX IF NOT EXISTS idx_quotes_carrier_id ON quotes USING btree (carrier_id);

-- USER_SETTINGS TABLE
CREATE TABLE IF NOT EXISTS user_settings (
    updated_at timestamptz NOT NULL DEFAULT now(), 
    confidence_thresholds jsonb DEFAULT '{"auto_quote": 85, "auto_dispatch": 90, "auto_carrier_select": 75}'::jsonb, 
    id uuid NOT NULL DEFAULT gen_random_uuid(), 
    notifications jsonb DEFAULT '{"load_updates": true, "daily_summary": false, "action_required": true}'::jsonb, 
    created_at timestamptz NOT NULL DEFAULT now(), 
    user_id uuid NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS user_settings_user_id_key ON user_settings USING btree (user_id);

-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    last_provider text, 
    last_login timestamptz, 
    id uuid NOT NULL DEFAULT gen_random_uuid(), 
    created_at timestamptz DEFAULT now(), 
    name text, 
    provider text, 
    email text NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users USING btree (email);
CREATE INDEX IF NOT EXISTS users_email_key ON users USING btree (email);

-- WEBHOOK_EVENTS TABLE
CREATE TABLE IF NOT EXISTS webhook_events (
    processing_error text, 
    raw_payload jsonb NOT NULL, 
    provider email_provider NOT NULL, 
    id uuid NOT NULL DEFAULT gen_random_uuid(), 
    email_account_id uuid, 
    processed boolean DEFAULT false, 
    processed_payload jsonb, 
    event_type text NOT NULL, 
    received_at timestamptz DEFAULT now(), 
    created_at timestamptz DEFAULT now(), 
    processed_at timestamptz, 
    webhook_signature text,
    PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events USING btree (received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events USING btree (processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_account_id ON webhook_events USING btree (email_account_id);

-- Add any foreign key constraints (these might need adjustment based on your actual relationships)
-- ALTER TABLE brokers ADD CONSTRAINT brokers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- ALTER TABLE email_connections ADD CONSTRAINT email_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
-- ALTER TABLE email_connections ADD CONSTRAINT email_connections_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES brokers(id);
-- ALTER TABLE loads ADD CONSTRAINT loads_broker_id_fkey FOREIGN KEY (broker_id) REFERENCES brokers(id);
-- etc...