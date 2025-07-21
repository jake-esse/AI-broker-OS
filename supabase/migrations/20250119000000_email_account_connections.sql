-- ===============================================================================
-- AI-Broker MVP · Multi-Tenant Email Account Connections Migration
-- ===============================================================================
--
-- BUSINESS PURPOSE:
-- This migration enables brokers to connect their own email accounts (Gmail, 
-- Outlook, IMAP) to the AI-Broker system. Each broker can connect multiple email
-- accounts and the system will monitor them for incoming freight requests.
--
-- SECURITY ARCHITECTURE:
-- - OAuth tokens are encrypted at rest using Supabase's built-in encryption
-- - Row Level Security (RLS) ensures brokers only access their own connections
-- - Refresh tokens enable long-term access without storing passwords
-- - Provider-specific scopes limit access to email reading only
--
-- TECHNICAL ARCHITECTURE:
-- - Supports Gmail API, Microsoft Graph API, and IMAP connections
-- - Webhook subscriptions for real-time notifications (Gmail/Outlook)
-- - Polling configuration for IMAP and providers without webhooks
-- - Email processing state tracking and error handling
-- - Audit logging for compliance and debugging
--
-- INTEGRATION POINTS:
-- - Links to existing loads table via source_email_account_id
-- - Triggers pg_notify for real-time email processing
-- - Supports the existing intake_graph.py workflow
-- ===============================================================================

-- ===============================================================================
-- ENUM TYPES: Define standardized values for email providers and connection states
-- ===============================================================================

-- EMAIL PROVIDER ENUM: Defines all supported email service providers
-- BUSINESS PURPOSE: Standardizes email provider identification across the system
-- USAGE: Used in email_accounts table to identify which API/protocol to use
-- AI CONTEXT: When processing emails, this determines which authentication method
--             and API endpoints to use for each connected email account
CREATE TYPE email_provider AS ENUM (
    'GMAIL',        -- Google Gmail API integration (OAuth 2.0 + Gmail API)
    'OUTLOOK',      -- Microsoft Outlook.com personal accounts (OAuth 2.0 + Graph API)  
    'EXCHANGE',     -- Microsoft Exchange Online business accounts (OAuth 2.0 + Graph API)
    'IMAP_GENERIC', -- Generic IMAP servers (app passwords or OAuth where supported)
    'YAHOO',        -- Yahoo Mail (IMAP with app passwords)
    'CUSTOM'        -- Custom email providers (IMAP configuration required)
);

-- CONNECTION STATUS ENUM: Tracks the health and state of email account connections
-- BUSINESS PURPOSE: Enables monitoring and troubleshooting of email integrations
-- USAGE: Updated automatically by system processes and OAuth refresh logic
-- AI CONTEXT: Used to determine if an email account can process messages or needs
--             human intervention (re-authorization, troubleshooting)
CREATE TYPE connection_status AS ENUM (
    'ACTIVE',                 -- Account connected and processing emails successfully
    'INACTIVE',               -- Account temporarily disabled by broker (processing paused)
    'ERROR',                  -- Connection failed due to technical issues (retry needed)
    'TOKEN_EXPIRED',          -- OAuth tokens expired and refresh failed (re-auth required)
    'AUTHORIZATION_REQUIRED'  -- Initial state or authorization revoked (OAuth setup needed)
);

-- ===============================================================================
-- EMAIL ACCOUNTS TABLE: Core table for storing broker email account connections
-- ===============================================================================
-- BUSINESS PURPOSE: 
-- This table enables freight brokers to connect their business email accounts to the 
-- AI-Broker system for automated freight load processing. Each broker can connect 
-- multiple email accounts from different providers (Gmail, Outlook, IMAP, etc.).
--
-- WORKFLOW INTEGRATION:
-- 1. Broker initiates OAuth flow or enters IMAP credentials via dashboard
-- 2. System stores encrypted credentials and connection configuration
-- 3. Background services monitor these accounts for incoming freight emails
-- 4. Emails are processed through intake_graph.py workflow automatically
-- 5. Processing results and errors are logged for monitoring and debugging
--
-- SECURITY MODEL:
-- - OAuth tokens encrypted at rest by Supabase (industry standard)
-- - Row Level Security ensures brokers only access their own accounts
-- - Webhook secrets and IMAP passwords encrypted for data protection
-- - Audit trail maintained for compliance and security monitoring
--
-- AI SYSTEM INTEGRATION:
-- - email_intake_service.py uses this data to authenticate with email providers
-- - oauth_service.py manages token refresh and credential validation
-- - imap_email_service.py polls accounts that don't support webhooks
-- - Webhook Edge Functions update status based on real-time notifications

CREATE TABLE email_accounts (
    -- ═══════════════════════════════════════════════════════════════════════
    -- PRIMARY IDENTIFICATION AND RELATIONSHIPS
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- UNIQUE IDENTIFIER: UUID primary key for this email account connection
    -- USAGE: Referenced by email_processing_log and webhook_events tables
    -- AI CONTEXT: Used to link processed emails back to their source account
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- MULTI-TENANT ISOLATION: Links email account to specific broker
    -- BUSINESS RULE: Each broker can only access their own email accounts
    -- SECURITY: Enforced by Row Level Security policies below
    -- AI CONTEXT: Determines which broker's processing rules and settings to apply
    broker_id UUID NOT NULL, -- Links to future brokers/users table when implemented
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- EMAIL ACCOUNT IDENTIFICATION AND PROVIDER INFO
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- EMAIL ADDRESS: The actual email address being monitored
    -- BUSINESS RULE: Must be unique per broker (one connection per email per broker)
    -- VALIDATION: Email format validated by application layer
    -- AI CONTEXT: Used for email routing and response generation
    email_address TEXT NOT NULL,
    
    -- DISPLAY NAME: Human-readable name for this email account (optional)
    -- USAGE: Shown in dashboard and logs for easier identification
    -- EXAMPLE: "Main Dispatch Email" or "Secondary Tender Account"
    display_name TEXT,
    
    -- PROVIDER TYPE: Determines which API/protocol to use for email access
    -- TECHNICAL IMPACT: Controls authentication method and API endpoints
    -- AI CONTEXT: email_intake_service.py uses this to route to correct handler
    provider email_provider NOT NULL,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- CONNECTION HEALTH AND STATUS MONITORING
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- CONNECTION STATUS: Current health state of this email account connection
    -- BUSINESS IMPACT: Only ACTIVE accounts process emails automatically
    -- MONITORING: Dashboard alerts when accounts need attention
    -- AI CONTEXT: System skips processing for non-ACTIVE accounts
    status connection_status NOT NULL DEFAULT 'AUTHORIZATION_REQUIRED',
    
    -- LAST SYNC TIMESTAMP: When this account was last successfully accessed
    -- MONITORING: Used to detect stale connections and trigger health checks
    -- PERFORMANCE: Helps identify accounts that may need attention
    last_sync_at TIMESTAMPTZ,
    
    -- ERROR TRACKING: Last error message for troubleshooting
    -- SUPPORT: Helps diagnose connection issues and guide fixes
    -- AI CONTEXT: Used by retry logic to determine appropriate error handling
    last_error TEXT,
    
    -- ERROR COUNT: Number of consecutive errors (resets on success)
    -- BUSINESS RULE: Too many errors may pause processing to prevent spam
    -- ESCALATION: High error counts trigger admin notifications
    error_count INTEGER DEFAULT 0,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- OAUTH 2.0 CREDENTIALS (Gmail, Outlook, Exchange)
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- ACCESS TOKEN: Current OAuth access token for API calls
    -- SECURITY: Encrypted at rest by Supabase, rotated automatically
    -- LIFESPAN: Typically expires in 1 hour, refreshed automatically
    -- AI CONTEXT: Used by email APIs to authenticate and read emails
    access_token TEXT,
    
    -- REFRESH TOKEN: Long-term token for obtaining new access tokens
    -- SECURITY: Encrypted at rest, enables long-term automated access
    -- BUSINESS VALUE: Prevents need for broker to re-authorize frequently
    -- AI CONTEXT: oauth_service.py uses this for automatic token refresh
    refresh_token TEXT,
    
    -- TOKEN EXPIRATION: When current access token expires
    -- AUTOMATION: System automatically refreshes before expiration
    -- MONITORING: Alerts generated for refresh failures
    token_expires_at TIMESTAMPTZ,
    
    -- OAUTH SCOPE: Permissions granted by broker during authorization
    -- SECURITY: Defines what the system can access (read emails, send replies)
    -- VALIDATION: Ensures system has necessary permissions for operation
    oauth_scope TEXT,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- PROVIDER-SPECIFIC CONFIGURATION
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- OAUTH CLIENT ID: Application identifier for OAuth provider
    -- FLEXIBILITY: Allows custom OAuth apps per broker if needed
    -- DEFAULT: Uses system-wide OAuth application for most cases
    client_id TEXT,
    
    -- MICROSOFT TENANT ID: For Microsoft business accounts
    -- ENTERPRISE: Required for Microsoft 365 business accounts
    -- ROUTING: Determines which Microsoft endpoint to use
    tenant_id TEXT,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- IMAP CONFIGURATION (Yahoo, Custom Providers, Generic IMAP)
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- IMAP SERVER HOSTNAME: Server address for IMAP connections
    -- REQUIRED FOR: IMAP_GENERIC, YAHOO, CUSTOM providers
    -- EXAMPLES: "imap.gmail.com", "imap.mail.yahoo.com", "mail.company.com"
    imap_host TEXT,
    
    -- IMAP PORT: Server port for IMAP connections
    -- STANDARD: 993 for TLS/SSL, 143 for plain (not recommended)
    -- SECURITY: Should always use TLS/SSL for production
    imap_port INTEGER,
    
    -- TLS/SSL ENCRYPTION: Whether to use encrypted IMAP connection
    -- SECURITY: Should always be TRUE for production deployments
    -- COMPLIANCE: Required for handling sensitive freight data
    imap_use_tls BOOLEAN DEFAULT true,
    
    -- IMAP USERNAME: Usually the email address
    -- AUTHENTICATION: Used for IMAP login authentication
    -- NOTE: May differ from email_address for some providers
    imap_username TEXT,
    
    -- IMAP PASSWORD: App password or OAuth token for IMAP access
    -- SECURITY: Encrypted at rest by Supabase
    -- MODERN AUTH: Prefer app passwords over account passwords
    imap_password TEXT,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- WEBHOOK INTEGRATION (Gmail, Outlook real-time notifications)
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- WEBHOOK SUBSCRIPTION ID: Provider's identifier for webhook subscription
    -- LIFECYCLE: Created when account connects, renewed before expiration
    -- TROUBLESHOOTING: Used to manage webhook subscriptions via provider APIs
    webhook_subscription_id TEXT,
    
    -- WEBHOOK SECRET: Shared secret for validating webhook authenticity
    -- SECURITY: Prevents malicious webhook submissions
    -- VALIDATION: Ensures webhooks actually come from email provider
    webhook_secret TEXT,
    
    -- WEBHOOK EXPIRATION: When webhook subscription expires
    -- AUTOMATION: System automatically renews before expiration
    -- MONITORING: Alerts generated for renewal failures
    webhook_expires_at TIMESTAMPTZ,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- EMAIL PROCESSING BEHAVIOR AND CONFIGURATION
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- MONITORED FOLDERS: Which email folders to check for freight emails
    -- FLEXIBILITY: Allows brokers to organize freight emails in subfolders
    -- PERFORMANCE: Reduces processing load by focusing on relevant folders
    -- AI CONTEXT: email_intake_service.py only processes emails from these folders
    monitor_folders TEXT[] DEFAULT ARRAY['INBOX'],
    
    -- PROCESSING ENABLED: Master switch for email processing
    -- BUSINESS CONTROL: Allows brokers to pause processing without disconnecting
    -- TROUBLESHOOTING: Can disable during maintenance or issue resolution
    -- AI CONTEXT: System skips disabled accounts in processing loops
    processing_enabled BOOLEAN DEFAULT true,
    
    -- AUTO-REPLY ENABLED: Whether to send automated missing info requests
    -- BUSINESS FEATURE: Enables automatic follow-up for incomplete load tenders
    -- COMPLIANCE: Some brokers may need to disable for regulatory reasons
    -- AI CONTEXT: Controls whether ask_more() function sends emails
    auto_reply_enabled BOOLEAN DEFAULT true,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- EMAIL FILTERING AND BUSINESS RULES
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- SENDER WHITELIST: Only process emails from these specific senders
    -- BUSINESS RULE: Restricts processing to known, trusted shippers
    -- SECURITY: Prevents processing of spam or malicious emails
    -- AI CONTEXT: intake_graph.py checks sender before processing
    sender_whitelist TEXT[],
    
    -- SENDER BLACKLIST: Never process emails from these senders
    -- SECURITY: Blocks known spam sources or problematic shippers
    -- BUSINESS RULE: Overrides whitelist (blacklist takes precedence)
    -- AI CONTEXT: System immediately rejects emails from blacklisted senders
    sender_blacklist TEXT[],
    
    -- SUBJECT FILTERS: Keywords that must appear in subject line
    -- EFFICIENCY: Reduces false positives by focusing on freight-related emails
    -- EXAMPLES: ["tender", "load", "freight", "shipment", "quote"]
    -- AI CONTEXT: Pre-filters emails before expensive LLM classification
    subject_filters TEXT[],
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- AUDIT TRAIL AND METADATA
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- CREATION TIMESTAMP: When this email account was first connected
    -- AUDIT: Required for compliance and troubleshooting
    -- ANALYTICS: Used for adoption and usage reporting
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- LAST UPDATE TIMESTAMP: When this record was last modified
    -- AUDIT: Tracks configuration changes and maintenance activities
    -- AUTOMATION: Updated by trigger function when record changes
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- CREATOR IDENTIFICATION: Who or what created this connection
    -- AUDIT: Tracks whether connection was made via dashboard, API, or migration
    -- TROUBLESHOOTING: Helps identify the source of configuration issues
    created_by TEXT DEFAULT 'system',
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- DATA INTEGRITY CONSTRAINTS AND BUSINESS RULES
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- UNIQUENESS CONSTRAINT: One connection per email address per broker
    -- BUSINESS RULE: Prevents duplicate connections and configuration conflicts
    -- DATA INTEGRITY: Ensures clear ownership and eliminates ambiguity
    UNIQUE(broker_id, email_address),
    
    -- PROVIDER-SPECIFIC VALIDATION: Ensures required fields are present
    -- OAUTH PROVIDERS: Must have access_token for API authentication
    -- IMAP PROVIDERS: Must have host and credentials for connection
    -- DATA INTEGRITY: Prevents incomplete configurations that would fail
    CHECK (
        -- OAuth-based providers must have access tokens
        (provider IN ('GMAIL', 'OUTLOOK', 'EXCHANGE') AND access_token IS NOT NULL)
        OR
        -- IMAP providers must have server configuration
        (provider IN ('IMAP_GENERIC', 'YAHOO', 'CUSTOM') AND imap_host IS NOT NULL)
    )
);

-- ===============================================================================
-- EMAIL PROCESSING LOG TABLE: Comprehensive audit trail for email processing
-- ===============================================================================
-- BUSINESS PURPOSE:
-- This table provides complete visibility into email processing activities for 
-- compliance, troubleshooting, and performance optimization. Every email processed
-- by the AI-Broker system is logged here with detailed results and metadata.
--
-- COMPLIANCE VALUE:
-- - Maintains audit trail required for freight industry regulations
-- - Tracks AI decision-making process for transparency and accountability  
-- - Enables reconstruction of processing history for dispute resolution
-- - Documents data retention and handling for privacy compliance
--
-- OPERATIONAL VALUE:
-- - Enables debugging of processing failures and edge cases
-- - Provides analytics for system performance and improvement
-- - Tracks AI confidence scores for model performance monitoring
-- - Identifies patterns in email types and processing success rates
--
-- AI SYSTEM INTEGRATION:
-- - intake_graph.py logs every processing attempt and result
-- - email_intake_service.py creates entries for multi-provider processing
-- - Dashboard queries this table for real-time monitoring and alerts
-- - Analytics systems use this data for performance metrics and reporting

CREATE TABLE email_processing_log (
    -- ═══════════════════════════════════════════════════════════════════════
    -- PRIMARY IDENTIFICATION AND RELATIONSHIPS
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- UNIQUE IDENTIFIER: UUID primary key for this processing attempt
    -- AUDIT: Links to external systems and provides unique reference
    -- ANALYTICS: Used for detailed analysis of individual processing events
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- EMAIL ACCOUNT LINK: Which email account this email came from
    -- BUSINESS VALUE: Enables tracking performance per connected account
    -- CASCADE DELETE: Removes logs when email account is deleted
    -- AI CONTEXT: Links processing results back to source configuration
    email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
    
    -- BROKER IDENTIFICATION: Denormalized for query performance
    -- ANALYTICS: Enables fast queries by broker without joining tables
    -- MULTI-TENANT: Ensures proper data isolation and access control
    -- PERFORMANCE: Avoids expensive joins in dashboard and reporting queries
    broker_id UUID NOT NULL,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- EMAIL IDENTIFICATION AND METADATA
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- EMAIL MESSAGE ID: Unique identifier from email provider
    -- DEDUPLICATION: Prevents processing the same email multiple times
    -- TROUBLESHOOTING: Links back to original email in provider system
    -- THREADING: Used to link responses to original load requests
    message_id TEXT NOT NULL,
    
    -- CONVERSATION THREAD ID: Groups related emails together
    -- BUSINESS VALUE: Tracks entire conversation flow for missing info handling
    -- AI CONTEXT: Used by missing info response handling to find original loads
    -- ANALYTICS: Enables analysis of conversation patterns and success rates
    thread_id TEXT,
    
    -- EMAIL SUBJECT: Subject line for human readability and filtering
    -- TROUBLESHOOTING: Helps identify types of emails and processing patterns
    -- ANALYTICS: Used for subject line pattern analysis and optimization
    -- BUSINESS VALUE: Enables brokers to quickly identify email content
    subject TEXT,
    
    -- SENDER EMAIL ADDRESS: Who sent this email
    -- BUSINESS RULES: Used for whitelist/blacklist filtering validation
    -- ANALYTICS: Tracks which shippers send most/best load requests
    -- RELATIONSHIP MANAGEMENT: Identifies frequent shipper partners
    sender_email TEXT,
    
    -- EMAIL RECEIVED TIMESTAMP: When email was originally received
    -- SLA TRACKING: Measures processing time from receipt to completion
    -- ANALYTICS: Identifies peak email volume periods for scaling
    -- BUSINESS VALUE: Tracks response time commitments to shippers
    received_at TIMESTAMPTZ,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- PROCESSING EXECUTION AND RESULTS
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- PROCESSING TIMESTAMP: When AI system processed this email
    -- PERFORMANCE: Measures total processing time and system load
    -- TROUBLESHOOTING: Identifies processing delays and bottlenecks
    -- SLA COMPLIANCE: Tracks adherence to processing time commitments
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- PROCESSING STATUS: Overall result of processing attempt
    -- MONITORING: Enables alerts for high error rates or failures
    -- BUSINESS IMPACT: Tracks system reliability and broker confidence
    -- VALUES: SUCCESS, ERROR, SKIPPED, RETRY_NEEDED, PARTIAL_SUCCESS
    processing_status TEXT NOT NULL,
    
    -- INTENT CLASSIFICATION: What type of email this was determined to be
    -- AI DECISION: Result of intent classification by LLM
    -- ROUTING: Determines which processing workflow was used
    -- VALUES: LOAD_REQUEST, MISSING_INFO_RESPONSE, RATE_QUOTE, CONFIRMATION, OTHER
    -- ANALYTICS: Tracks accuracy of intent detection over time
    intent_classification TEXT,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- BUSINESS RESULTS AND OUTCOMES
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- CREATED LOAD ID: UUID of load record created (if successful)
    -- BUSINESS VALUE: Links processing log to actual business outcome
    -- ANALYTICS: Tracks conversion rate from emails to loads
    -- AUDITING: Enables tracing loads back to source emails
    load_id UUID,
    
    -- GENERATED LOAD NUMBER: Human-readable load identifier
    -- BUSINESS REFERENCE: Used in communications with brokers and carriers
    -- TROUBLESHOOTING: Easier to reference than UUIDs in support cases
    -- INTEGRATION: Links to other systems that use load numbers
    load_number TEXT,
    
    -- AI CONFIDENCE SCORE: How confident the AI was in its extraction
    -- RANGE: 0.00 to 1.00 (higher means more confident)
    -- QUALITY CONTROL: Used to flag potentially incorrect extractions
    -- MODEL IMPROVEMENT: Tracks AI performance over time for retraining
    -- BUSINESS RULE: Low confidence may trigger human review
    extraction_confidence NUMERIC(3,2),
    
    -- COMPLEXITY FLAGS: Types of complexity detected in this load
    -- BUSINESS SAFETY: Identifies loads requiring human broker expertise
    -- AUTOMATION LIMITS: Prevents AI from handling complex freight types
    -- EXAMPLES: ['HAZMAT', 'OVERSIZE', 'MULTI_STOP', 'INTERMODAL']
    -- ANALYTICS: Tracks frequency of different complexity types
    complexity_flags TEXT[],
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- ERROR HANDLING AND DEBUGGING
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- ERROR MESSAGE: Human-readable description of any processing error
    -- TROUBLESHOOTING: First line of investigation for failed processing
    -- SUPPORT: Helps brokers understand why emails weren't processed
    -- MONITORING: Used for alerting and automated error categorization
    error_message TEXT,
    
    -- ERROR DETAILS: Structured error information for debugging
    -- TECHNICAL DEBUGGING: Stack traces, API responses, system state
    -- AUTOMATION: Machine-readable error details for automated handling
    -- INTEGRATION: Error details from external APIs and services
    error_details JSONB,
    
    -- RETRY COUNT: Number of times processing was attempted
    -- RELIABILITY: Tracks system resilience and retry effectiveness
    -- COST CONTROL: Prevents infinite retry loops that waste resources
    -- MONITORING: High retry counts indicate systemic issues
    retry_count INTEGER DEFAULT 0,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- EMAIL CONTENT PRESERVATION (for debugging and reprocessing)
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- RAW EMAIL HEADERS: Complete email headers as JSON
    -- DEBUGGING: Full email metadata for troubleshooting edge cases
    -- COMPLIANCE: Preserves delivery path and authentication info
    -- REPROCESSING: Enables replay of processing with full context
    raw_email_headers JSONB,
    
    -- EMAIL BODY TEXT: Plain text version of email content
    -- AI INPUT: The actual text that was processed by the LLM
    -- REPROCESSING: Enables rerunning AI processing with same input
    -- HUMAN REVIEW: Allows brokers to see exactly what AI processed
    email_body_text TEXT,
    
    -- EMAIL BODY HTML: HTML version of email content (if available)
    -- FORMATTING: Preserves original email formatting and structure
    -- DEBUGGING: Some processing issues only apparent in HTML version
    -- ATTACHMENT CONTEXT: HTML may reference attachments not in plain text
    email_body_html TEXT,
    
    -- ATTACHMENT METADATA: Information about email attachments
    -- BUSINESS VALUE: Many freight tenders include PDF or Excel attachments
    -- FUTURE ENHANCEMENT: Enables attachment processing capabilities
    -- COMPLIANCE: Tracks what additional data was available but not processed
    attachments_info JSONB,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- AUDIT TRAIL AND METADATA
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- LOG CREATION TIMESTAMP: When this log entry was created
    -- AUDIT: Required for compliance and data retention policies
    -- PERFORMANCE: Tracks system processing speed and throughput
    -- ANALYTICS: Used for time-series analysis of processing patterns
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- DATA INTEGRITY CONSTRAINTS
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- UNIQUENESS CONSTRAINT: Prevents duplicate processing of same email
    -- DATA INTEGRITY: One log entry per message per email account
    -- BUSINESS RULE: Ensures accurate processing metrics and billing
    -- PERFORMANCE: Enables fast deduplication checks during processing
    CONSTRAINT unique_message_per_account UNIQUE(email_account_id, message_id)
);

-- ===============================================================================
-- WEBHOOK EVENTS TABLE: Real-time email notification event storage
-- ===============================================================================
-- BUSINESS PURPOSE:
-- This table captures and queues webhook events from email providers (Gmail, Outlook)
-- for reliable processing. It enables real-time email processing while providing
-- durability, replay capability, and audit trail for webhook-based integrations.
--
-- TECHNICAL ARCHITECTURE:
-- - Gmail sends Pub/Sub notifications when new emails arrive
-- - Outlook sends Graph API webhooks for mailbox changes
-- - Edge Functions receive webhooks and store events in this table
-- - Background workers process events asynchronously for reliability
-- - Failed events can be retried or analyzed for troubleshooting
--
-- RELIABILITY FEATURES:
-- - Event deduplication prevents duplicate processing
-- - Retry capability for failed processing attempts
-- - Complete payload preservation for debugging and replay
-- - Processing status tracking for monitoring and alerting
--
-- AI SYSTEM INTEGRATION:
-- - Webhook Edge Functions insert events into this table
-- - email_intake_service.py processes events asynchronously
-- - Failed events trigger alerts and manual investigation
-- - Event history enables performance analysis and optimization

CREATE TABLE webhook_events (
    -- ═══════════════════════════════════════════════════════════════════════
    -- PRIMARY IDENTIFICATION AND RELATIONSHIPS
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- UNIQUE IDENTIFIER: UUID primary key for this webhook event
    -- DEDUPLICATION: Used to prevent processing the same event multiple times
    -- TROUBLESHOOTING: Enables tracking individual events through the system
    -- ANALYTICS: Used for webhook performance and reliability analysis
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- EMAIL ACCOUNT LINK: Which email account this webhook event is for
    -- ROUTING: Determines which account's configuration to use for processing
    -- CASCADE DELETE: Removes webhook history when email account is deleted
    -- SECURITY: Ensures webhook events are only processed for authorized accounts
    email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- WEBHOOK EVENT IDENTIFICATION AND METADATA
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- EMAIL PROVIDER: Which service sent this webhook
    -- ROUTING: Determines which processing logic to use (Gmail vs Outlook)
    -- ANALYTICS: Tracks webhook reliability and performance per provider
    -- DEBUGGING: Helps identify provider-specific issues and patterns
    provider email_provider NOT NULL,
    
    -- EVENT TYPE: What kind of change triggered this webhook
    -- GMAIL EXAMPLES: 'gmail.message.created', 'gmail.message.updated'
    -- OUTLOOK EXAMPLES: 'message.created', 'message.updated', 'message.deleted'
    -- FILTERING: Enables processing only relevant event types
    -- ANALYTICS: Tracks frequency of different event types
    event_type TEXT NOT NULL,
    
    -- WEBHOOK SIGNATURE: Cryptographic signature for authenticity validation
    -- SECURITY: Prevents malicious webhook submissions and replay attacks
    -- VALIDATION: Ensures webhook actually came from the email provider
    -- COMPLIANCE: Provides audit trail of webhook authenticity verification
    webhook_signature TEXT,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- EVENT PAYLOAD AND PROCESSING DATA
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- RAW PAYLOAD: Complete webhook payload as received from provider
    -- DEBUGGING: Preserves exact webhook data for troubleshooting
    -- REPLAY: Enables reprocessing events with original data
    -- COMPLIANCE: Maintains complete audit trail of received data
    -- ANALYSIS: Allows analysis of webhook payload evolution over time
    raw_payload JSONB NOT NULL,
    
    -- PROCESSED PAYLOAD: Normalized event data after parsing
    -- STANDARDIZATION: Common format regardless of provider differences
    -- EFFICIENCY: Pre-processed data for faster email retrieval
    -- DEBUGGING: Shows how raw payload was interpreted by the system
    -- ANALYTICS: Enables analysis of processed vs raw data accuracy
    processed_payload JSONB,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- PROCESSING STATUS AND LIFECYCLE MANAGEMENT
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- PROCESSING STATUS: Whether this webhook event has been processed
    -- WORKFLOW: FALSE = pending, TRUE = completed
    -- RELIABILITY: Enables retry of failed events and duplicate prevention
    -- MONITORING: Tracks processing backlog and system health
    -- ALERTING: High numbers of unprocessed events trigger alerts
    processed BOOLEAN DEFAULT false,
    
    -- PROCESSING TIMESTAMP: When this webhook event was processed
    -- PERFORMANCE: Measures webhook processing latency and throughput
    -- SLA TRACKING: Ensures timely processing of email notifications
    -- DEBUGGING: Helps identify processing delays and bottlenecks
    -- ANALYTICS: Used for system performance optimization
    processed_at TIMESTAMPTZ,
    
    -- PROCESSING ERROR: Description of any processing failure
    -- TROUBLESHOOTING: First line of investigation for webhook failures
    -- ALERTING: Triggers notifications for manual investigation
    -- PATTERNS: Enables identification of common failure modes
    -- RECOVERY: Guides retry strategies and error handling improvements
    processing_error TEXT,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- AUDIT TRAIL AND LIFECYCLE TIMESTAMPS
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- WEBHOOK RECEIVED TIMESTAMP: When webhook was received by our system
    -- LATENCY: Measures delay between email event and webhook notification
    -- PROVIDER SLA: Tracks email provider webhook delivery performance
    -- DEBUGGING: Helps identify webhook delivery issues and patterns
    -- ANALYTICS: Used for webhook reliability and timing analysis
    received_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- RECORD CREATION TIMESTAMP: When this database record was created
    -- AUDIT: Required for compliance and data retention policies
    -- PERFORMANCE: Tracks database insertion speed and system load
    -- CONSISTENCY: Should be same as received_at under normal operation
    -- DEBUGGING: Differences indicate system processing delays
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===============================================================================
-- INDEXES AND PERFORMANCE OPTIMIZATION
-- ===============================================================================
-- PERFORMANCE STRATEGY:
-- These indexes are carefully designed to optimize the most common query patterns
-- in the AI-Broker email integration system. They balance query performance with
-- storage space and write performance, focusing on dashboard queries, monitoring,
-- and real-time processing workflows.
--
-- INDEX DESIGN PRINCIPLES:
-- - Multi-tenant queries (by broker_id) are heavily optimized
-- - Time-based queries for dashboards and analytics are prioritized  
-- - Status-based filtering for monitoring and alerting is optimized
-- - Provider-specific queries for troubleshooting are supported
-- - Write performance is preserved by avoiding over-indexing

-- ═══════════════════════════════════════════════════════════════════════
-- EMAIL ACCOUNTS TABLE INDEXES
-- ═══════════════════════════════════════════════════════════════════════

-- BROKER MULTI-TENANCY INDEX: Enables fast queries by broker
-- USAGE: Dashboard queries, broker-specific reporting, RLS policy optimization
-- QUERY PATTERN: "SELECT * FROM email_accounts WHERE broker_id = ?"
-- PERFORMANCE: Essential for multi-tenant isolation and broker dashboard
CREATE INDEX idx_email_accounts_broker_id ON email_accounts(broker_id);

-- CONNECTION STATUS INDEX: Enables fast filtering by account health
-- USAGE: Monitoring queries, system health checks, account management
-- QUERY PATTERN: "SELECT * FROM email_accounts WHERE status = 'ACTIVE'"
-- BUSINESS VALUE: Quickly identify accounts needing attention or maintenance
CREATE INDEX idx_email_accounts_status ON email_accounts(status);

-- EMAIL PROVIDER INDEX: Enables fast queries by provider type
-- USAGE: Provider-specific troubleshooting, performance analysis by provider
-- QUERY PATTERN: "SELECT * FROM email_accounts WHERE provider = 'GMAIL'"
-- ANALYTICS: Compare performance and reliability across email providers
CREATE INDEX idx_email_accounts_provider ON email_accounts(provider);

-- LAST SYNC TIMESTAMP INDEX: Enables fast queries for stale connection detection
-- USAGE: Monitoring queries to find accounts that haven't synced recently
-- QUERY PATTERN: "SELECT * FROM email_accounts WHERE last_sync_at < NOW() - INTERVAL '1 hour'"
-- ALERTING: Quickly identify accounts that may have connection issues
CREATE INDEX idx_email_accounts_last_sync ON email_accounts(last_sync_at);

-- TOKEN EXPIRATION INDEX: Enables fast queries for token refresh management
-- USAGE: Background jobs that refresh expiring OAuth tokens
-- QUERY PATTERN: "SELECT * FROM email_accounts WHERE token_expires_at < NOW() + INTERVAL '5 minutes'"
-- AUTOMATION: Ensures proactive token refresh before expiration
CREATE INDEX idx_email_accounts_token_expires ON email_accounts(token_expires_at);

-- ═══════════════════════════════════════════════════════════════════════
-- EMAIL PROCESSING LOG TABLE INDEXES
-- ═══════════════════════════════════════════════════════════════════════

-- EMAIL ACCOUNT ASSOCIATION INDEX: Enables fast queries by source account
-- USAGE: Account-specific processing history, troubleshooting email issues
-- QUERY PATTERN: "SELECT * FROM email_processing_log WHERE email_account_id = ?"
-- BUSINESS VALUE: Track processing performance per connected email account
CREATE INDEX idx_email_processing_log_account_id ON email_processing_log(email_account_id);

-- BROKER MULTI-TENANCY INDEX: Enables fast broker-specific analytics
-- USAGE: Broker dashboard queries, performance reporting, billing analytics
-- QUERY PATTERN: "SELECT * FROM email_processing_log WHERE broker_id = ?"
-- PERFORMANCE: Avoids expensive joins with email_accounts table
CREATE INDEX idx_email_processing_log_broker_id ON email_processing_log(broker_id);

-- PROCESSING TIMESTAMP INDEX: Enables fast time-based queries and analytics
-- USAGE: Dashboard time-series charts, performance monitoring, SLA tracking
-- QUERY PATTERN: "SELECT * FROM email_processing_log WHERE processed_at >= '2025-01-01'"
-- ANALYTICS: Essential for processing volume and timing analysis
CREATE INDEX idx_email_processing_log_processed_at ON email_processing_log(processed_at);

-- PROCESSING STATUS INDEX: Enables fast filtering by processing outcome
-- USAGE: Error monitoring, success rate analysis, troubleshooting queries
-- QUERY PATTERN: "SELECT * FROM email_processing_log WHERE processing_status = 'ERROR'"
-- MONITORING: Quickly identify failed processing attempts for investigation
CREATE INDEX idx_email_processing_log_status ON email_processing_log(processing_status);

-- SENDER EMAIL INDEX: Enables fast queries by email sender
-- USAGE: Shipper-specific analytics, sender pattern analysis, blacklist management
-- QUERY PATTERN: "SELECT * FROM email_processing_log WHERE sender_email = 'shipper@company.com'"
-- BUSINESS VALUE: Track processing success rates per shipper relationship
CREATE INDEX idx_email_processing_log_sender ON email_processing_log(sender_email);

-- ═══════════════════════════════════════════════════════════════════════
-- WEBHOOK EVENTS TABLE INDEXES
-- ═══════════════════════════════════════════════════════════════════════

-- EMAIL ACCOUNT ASSOCIATION INDEX: Enables fast queries by webhook source
-- USAGE: Account-specific webhook history, troubleshooting webhook issues
-- QUERY PATTERN: "SELECT * FROM webhook_events WHERE email_account_id = ?"
-- DEBUGGING: Track webhook delivery and processing per email account
CREATE INDEX idx_webhook_events_account_id ON webhook_events(email_account_id);

-- PROCESSING STATUS INDEX: Enables fast queries for unprocessed events
-- USAGE: Background workers finding pending events, monitoring webhook backlog
-- QUERY PATTERN: "SELECT * FROM webhook_events WHERE processed = false"
-- RELIABILITY: Essential for webhook event processing queue management
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);

-- RECEIVED TIMESTAMP INDEX: Enables fast time-based queries and cleanup
-- USAGE: Webhook timing analysis, data retention cleanup, performance monitoring
-- QUERY PATTERN: "SELECT * FROM webhook_events WHERE received_at >= '2025-01-01'"
-- MAINTENANCE: Supports efficient deletion of old webhook events
CREATE INDEX idx_webhook_events_received_at ON webhook_events(received_at);

-- ===============================================================================
-- ROW LEVEL SECURITY (RLS): Multi-tenant data isolation and access control
-- ===============================================================================
-- SECURITY ARCHITECTURE:
-- This section implements Row Level Security to ensure that brokers can only
-- access their own email accounts and processing data. This is critical for
-- multi-tenant SaaS deployment where multiple freight brokers share the same
-- database but must be completely isolated from each other's data.
--
-- BUSINESS REQUIREMENTS:
-- - Complete data isolation between brokers (regulatory compliance)
-- - Transparent security (no application-level filtering required)
-- - Service role bypass for system operations and maintenance
-- - Performance optimization (RLS policies use existing indexes)
--
-- TECHNICAL IMPLEMENTATION:
-- - Uses Supabase auth.uid() to identify the current broker
-- - Policies are automatically enforced at the PostgreSQL level
-- - Service role can bypass RLS for system operations
-- - Policies are designed to use existing indexes for performance

-- ═══════════════════════════════════════════════════════════════════════
-- ENABLE ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════
-- SECURITY REQUIREMENT: Enable RLS on all tables containing broker data
-- COMPLIANCE: Ensures automatic enforcement of data isolation
-- PERFORMANCE: PostgreSQL optimizes RLS queries using table indexes

-- ENABLE RLS: Email accounts table
-- IMPACT: Brokers can only see their own connected email accounts
-- ENFORCEMENT: All SELECT, INSERT, UPDATE, DELETE operations are filtered
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;

-- ENABLE RLS: Email processing log table  
-- IMPACT: Brokers can only see processing logs for their own emails
-- ENFORCEMENT: Analytics and monitoring queries are automatically filtered
ALTER TABLE email_processing_log ENABLE ROW LEVEL SECURITY;

-- ENABLE RLS: Webhook events table
-- IMPACT: Brokers can only see webhook events for their own email accounts
-- ENFORCEMENT: Debugging and troubleshooting queries are automatically filtered
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════
-- EMAIL ACCOUNTS TABLE POLICIES
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS RULE: Brokers manage only their own email account connections
-- SECURITY: Complete isolation prevents access to other brokers' credentials
-- PERFORMANCE: Uses idx_email_accounts_broker_id for fast filtering

-- SELECT POLICY: Brokers can view their own email accounts
-- USAGE: Dashboard queries, account management, monitoring
-- SECURITY: auth.uid() must match broker_id in the email account record
-- PERFORMANCE: Leverages broker_id index for efficient filtering
CREATE POLICY "Brokers can view their own email accounts" ON email_accounts
    FOR SELECT USING (broker_id = auth.uid()::uuid);

-- INSERT POLICY: Brokers can create email accounts for themselves
-- USAGE: OAuth connection flow, IMAP account setup
-- SECURITY: New accounts must have the current broker's ID
-- BUSINESS RULE: Prevents brokers from creating accounts for other brokers
CREATE POLICY "Brokers can insert their own email accounts" ON email_accounts
    FOR INSERT WITH CHECK (broker_id = auth.uid()::uuid);

-- UPDATE POLICY: Brokers can modify their own email accounts
-- USAGE: Account settings changes, token refresh, status updates
-- SECURITY: Can only update accounts they own
-- BUSINESS RULE: Prevents modification of other brokers' account settings
CREATE POLICY "Brokers can update their own email accounts" ON email_accounts
    FOR UPDATE USING (broker_id = auth.uid()::uuid);

-- DELETE POLICY: Brokers can remove their own email accounts
-- USAGE: Account disconnection, cleanup, deactivation
-- SECURITY: Can only delete accounts they own
-- BUSINESS RULE: Prevents deletion of other brokers' email connections
CREATE POLICY "Brokers can delete their own email accounts" ON email_accounts
    FOR DELETE USING (broker_id = auth.uid()::uuid);

-- ═══════════════════════════════════════════════════════════════════════
-- EMAIL PROCESSING LOG TABLE POLICIES
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS RULE: Brokers see only processing logs for their own emails
-- COMPLIANCE: Maintains audit trail isolation between brokers
-- PERFORMANCE: Uses denormalized broker_id for fast filtering without joins

-- SELECT POLICY: Brokers can view their own processing logs
-- USAGE: Dashboard analytics, troubleshooting, performance monitoring
-- SECURITY: broker_id field must match current authenticated broker
-- PERFORMANCE: Uses idx_email_processing_log_broker_id for efficient queries
-- ANALYTICS: Enables broker-specific reporting without data leakage
CREATE POLICY "Brokers can view their own processing logs" ON email_processing_log
    FOR SELECT USING (broker_id = auth.uid()::uuid);

-- NOTE: No INSERT/UPDATE/DELETE policies for processing logs
-- RATIONALE: Only system processes should write to the processing log
-- SECURITY: Brokers cannot modify audit trail data

-- ═══════════════════════════════════════════════════════════════════════
-- WEBHOOK EVENTS TABLE POLICIES
-- ═══════════════════════════════════════════════════════════════════════
-- BUSINESS RULE: Brokers see webhook events only for their own email accounts
-- SECURITY: Indirect filtering through email_accounts table ownership
-- PERFORMANCE: Uses subquery that leverages email_accounts indexes

-- SELECT POLICY: Brokers can view webhook events for their email accounts
-- USAGE: Webhook troubleshooting, delivery monitoring, debugging
-- SECURITY: Must own the email account associated with the webhook event
-- PERFORMANCE: Subquery uses idx_email_accounts_broker_id index
-- COMPLEXITY: More complex than direct broker_id check but maintains referential integrity
CREATE POLICY "Brokers can view their own webhook events" ON webhook_events
    FOR SELECT USING (
        email_account_id IN (
            SELECT id FROM email_accounts WHERE broker_id = auth.uid()::uuid
        )
    );

-- NOTE: No INSERT/UPDATE/DELETE policies for webhook events
-- RATIONALE: Only system webhook handlers should write webhook events
-- SECURITY: Brokers cannot inject fake webhook events

-- ═══════════════════════════════════════════════════════════════════════
-- SERVICE ROLE BYPASS POLICIES
-- ═══════════════════════════════════════════════════════════════════════
-- SYSTEM REQUIREMENT: Background services need full access for operations
-- SECURITY: Only the service role (system processes) can bypass RLS
-- USAGE: OAuth token refresh, webhook processing, system maintenance

-- SERVICE ROLE BYPASS: Email accounts table
-- USAGE: System processes managing OAuth tokens, webhook subscriptions
-- SECURITY: Only service_role can perform cross-broker operations
-- AUTOMATION: Enables token refresh and system maintenance without broker context
CREATE POLICY "Service role has full access to email accounts" ON email_accounts
    FOR ALL USING (auth.role() = 'service_role');

-- SERVICE ROLE BYPASS: Processing logs table
-- USAGE: System processes logging email processing results
-- SECURITY: Only service_role can write processing logs across all brokers
-- AUTOMATION: Enables AI system to log processing without broker authentication
CREATE POLICY "Service role has full access to processing logs" ON email_processing_log
    FOR ALL USING (auth.role() = 'service_role');

-- SERVICE ROLE BYPASS: Webhook events table
-- USAGE: System webhook handlers processing events from email providers
-- SECURITY: Only service_role can process webhook events across all brokers
-- AUTOMATION: Enables webhook processing without individual broker authentication
CREATE POLICY "Service role has full access to webhook events" ON webhook_events
    FOR ALL USING (auth.role() = 'service_role');

-- ===============================================================================
-- TRIGGERS AND FUNCTIONS: Automated maintenance and event notifications
-- ===============================================================================
-- AUTOMATION PURPOSE:
-- These triggers and functions provide automated maintenance and real-time
-- notifications for the email integration system. They ensure data consistency
-- and enable real-time processing without requiring manual intervention.
--
-- BUSINESS VALUE:
-- - Automatic timestamp maintenance for audit trails
-- - Real-time notifications for webhook event processing
-- - Data consistency and integrity enforcement
-- - Reduced operational overhead and manual maintenance

-- ═══════════════════════════════════════════════════════════════════════
-- AUTOMATIC TIMESTAMP MAINTENANCE
-- ═══════════════════════════════════════════════════════════════════════

-- TIMESTAMP UPDATE FUNCTION: Automatically maintains updated_at timestamps
-- BUSINESS PURPOSE: Provides audit trail of when records were last modified
-- AUTOMATION: Eliminates need for application code to manage timestamps
-- COMPLIANCE: Ensures accurate audit trails for regulatory requirements
-- USAGE: Applied to any table that needs automatic timestamp maintenance
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- AUTOMATIC MAINTENANCE: Set updated_at to current timestamp on every update
    -- AUDIT TRAIL: Provides precise tracking of when records were modified
    -- CONSISTENCY: Ensures all updates have accurate timestamps regardless of source
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- EMAIL ACCOUNTS TIMESTAMP TRIGGER: Maintains updated_at for email accounts
-- ACTIVATION: Triggered on every UPDATE operation on email_accounts table
-- BUSINESS VALUE: Tracks when account settings, tokens, or status changed
-- COMPLIANCE: Required for audit trails in regulated freight industry
-- PERFORMANCE: Minimal overhead as it only updates one timestamp field
CREATE TRIGGER update_email_accounts_updated_at
    BEFORE UPDATE ON email_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════
-- REAL-TIME EVENT NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════

-- WEBHOOK EVENT NOTIFICATION FUNCTION: Notifies system of new webhook events
-- BUSINESS PURPOSE: Enables real-time processing of incoming email webhooks
-- INTEGRATION: Connects database events to application processing services
-- RELIABILITY: Ensures webhook events are processed even if initial handler fails
-- SCALABILITY: Allows multiple workers to process webhook events concurrently
CREATE OR REPLACE FUNCTION notify_webhook_event()
RETURNS TRIGGER AS $$
BEGIN
    -- REAL-TIME NOTIFICATION: Send PostgreSQL notification for new webhook event
    -- PAYLOAD FORMAT: JSON object with essential webhook processing information
    -- INTEGRATION POINT: Python services listen for these notifications
    -- RELIABILITY: Ensures webhook events don't get lost or delayed
    PERFORM pg_notify(
        'webhook_event',  -- NOTIFICATION CHANNEL: webhook processing services listen here
        json_build_object(
            'email_account_id', NEW.email_account_id,  -- Which account received the webhook
            'provider', NEW.provider,                   -- Which email provider sent it
            'event_type', NEW.event_type,              -- What type of email event occurred
            'webhook_id', NEW.id                       -- Database ID for processing reference
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- WEBHOOK EVENT NOTIFICATION TRIGGER: Activates real-time processing
-- ACTIVATION: Triggered on every INSERT into webhook_events table
-- TIMING: AFTER INSERT ensures the webhook event is fully committed to database
-- BUSINESS IMPACT: Enables immediate email processing for faster broker response
-- SCALABILITY: Multiple background workers can listen and process concurrently
-- RELIABILITY: If processing fails, event remains in database for retry
CREATE TRIGGER webhook_event_notification
    AFTER INSERT ON webhook_events
    FOR EACH ROW
    EXECUTE FUNCTION notify_webhook_event();

-- ===============================================================================
-- UPDATE EXISTING LOADS TABLE: Integration with email account tracking
-- ===============================================================================
-- INTEGRATION PURPOSE:
-- This section extends the existing loads table to track which email account
-- was the source of each load request. This enables complete traceability from
-- email receipt through load creation to carrier assignment and delivery.
--
-- BUSINESS VALUE:
-- - Complete audit trail from email to load delivery
-- - Performance analytics per email account
-- - Source-based filtering and reporting capabilities
-- - Integration with existing load management workflows

-- EMAIL ACCOUNT REFERENCE: Links loads back to their email source
-- BUSINESS VALUE: Enables tracking which email account generated each load
-- ANALYTICS: Allows analysis of load volume and success rates per email account
-- AUDIT TRAIL: Provides complete traceability from email to delivered load
-- INTEGRATION: Connects new email system with existing load management
-- NULLABLE: Existing loads won't have this field, new loads will
ALTER TABLE loads ADD COLUMN source_email_account_id UUID REFERENCES email_accounts(id);

-- SOURCE ACCOUNT INDEX: Optimizes queries by email account source
-- USAGE: Analytics queries, account performance reporting, troubleshooting
-- QUERY PATTERN: "SELECT * FROM loads WHERE source_email_account_id = ?"
-- BUSINESS VALUE: Fast identification of loads from specific email accounts
-- PERFORMANCE: Enables efficient broker-specific load reporting
CREATE INDEX idx_loads_source_email_account ON loads(source_email_account_id);

-- ===============================================================================
-- DATABASE DOCUMENTATION AND METADATA
-- ===============================================================================
-- DOCUMENTATION PURPOSE:
-- These comments provide human-readable descriptions of each table's purpose
-- and are visible in database administration tools and schema browsers.
--
-- MAINTENANCE VALUE:
-- - Quick reference for database administrators
-- - Onboarding documentation for new developers
-- - Integration guidance for external systems
-- - Compliance documentation for auditors

-- EMAIL ACCOUNTS TABLE DOCUMENTATION
-- SUMMARY: Complete email account connection and configuration management
-- AUDIENCE: Database administrators, developers, integration teams
-- SCOPE: OAuth, IMAP, webhook configuration, and account lifecycle management
COMMENT ON TABLE email_accounts IS 'Multi-tenant email account connections with OAuth 2.0 and IMAP support for automated freight email processing. Stores encrypted credentials, processing configuration, and account health monitoring data.';

-- EMAIL PROCESSING LOG TABLE DOCUMENTATION  
-- SUMMARY: Comprehensive audit trail of all email processing activities
-- AUDIENCE: Compliance teams, support engineers, analytics teams
-- SCOPE: Processing results, AI confidence scores, error tracking, performance metrics
COMMENT ON TABLE email_processing_log IS 'Comprehensive audit log of email processing attempts and results. Tracks AI classification, extraction confidence, processing errors, and business outcomes for compliance and analytics.';

-- WEBHOOK EVENTS TABLE DOCUMENTATION
-- SUMMARY: Real-time webhook event storage and processing queue
-- AUDIENCE: DevOps engineers, system administrators, troubleshooting teams  
-- SCOPE: Webhook delivery, processing status, reliability monitoring, event replay
COMMENT ON TABLE webhook_events IS 'Real-time webhook events from email providers (Gmail, Outlook) with processing status tracking. Enables reliable event processing, debugging, and performance monitoring.';

-- ===============================================================================
-- USAGE EXAMPLES
-- ===============================================================================
--
-- Connect a Gmail account:
-- INSERT INTO email_accounts (broker_id, email_address, provider, access_token, refresh_token)
-- VALUES ('broker-uuid', 'broker@company.com', 'GMAIL', 'access_token', 'refresh_token');
--
-- Connect an IMAP account:
-- INSERT INTO email_accounts (broker_id, email_address, provider, imap_host, imap_port, imap_username, imap_password)
-- VALUES ('broker-uuid', 'broker@custom.com', 'IMAP_GENERIC', 'mail.custom.com', 993, 'broker@custom.com', 'app_password');
--
-- Query processing statistics:
-- SELECT provider, COUNT(*) as total_emails, 
--        SUM(CASE WHEN processing_status = 'SUCCESS' THEN 1 ELSE 0 END) as successful
-- FROM email_processing_log 
-- WHERE broker_id = 'broker-uuid' 
-- GROUP BY provider;
--
-- ===============================================================================