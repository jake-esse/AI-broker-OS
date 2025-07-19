-- ===============================================================================
-- AI-Broker MVP · Loads Table Schema
-- ===============================================================================
-- 
-- BUSINESS PURPOSE:
-- This table stores freight loads from shipper tenders through delivery completion.
-- It serves as the central data structure for the entire freight brokerage workflow,
-- connecting intake, carrier sourcing, quoting, booking, and settlement processes.
--
-- WORKFLOW INTEGRATION:
-- 1. Intake Agent → Creates new load records with status 'NEW_RFQ'
-- 2. LoadBlast Agent → Reads NEW_RFQ loads and sends carrier offers
-- 3. QuoteCollector Agent → Updates loads with carrier quotes
-- 4. Broker UI → Displays loads for human oversight and booking
-- 5. Settlement Agent → Updates loads through delivery and payment
--
-- TECHNICAL ARCHITECTURE:
-- - PostgreSQL table with UUID primary keys for distributed system compatibility
-- - Row Level Security (RLS) for multi-tenant broker operations
-- - Triggers for automated load numbering and real-time notifications
-- - Indexes optimized for common query patterns (status, date, location)
-- - JSON columns for flexible metadata storage
--
-- BUSINESS RULES:
-- - All loads must have origin/destination/pickup date/equipment/weight
-- - Load numbers are auto-generated if not provided by shipper
-- - Status transitions follow freight lifecycle: NEW_RFQ → QUOTED → BOOKED → etc.
-- - Confidence scoring helps prioritize loads for human review
-- - pg_notify enables real-time agent coordination
--
-- COMPLIANCE CONSIDERATIONS:
-- - Audit trail maintained through created_at/updated_at timestamps
-- - Source email text preserved for dispute resolution
-- - RLS policies ensure data isolation between broker customers
-- ===============================================================================

-- Enable UUID extension for generating unique IDs
-- This ensures globally unique identifiers across distributed systems
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===============================================================================
-- MAIN LOADS TABLE
-- ===============================================================================
-- Central table storing all freight loads from tender through completion
-- Designed to handle high-volume operations with efficient indexing
CREATE TABLE IF NOT EXISTS loads (
    -- ─── PRIMARY KEY AND METADATA ───────────────────────────────────────────
    -- UUID primary key ensures global uniqueness for distributed systems
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Timestamp tracking for audit trail and SLA monitoring
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- ─── LOAD IDENTIFICATION ────────────────────────────────────────────────
    -- Unique load number for human reference (auto-generated if not provided)
    -- Format: LD20240115-0001 (LD + date + sequence)
    load_number VARCHAR(50) UNIQUE,
    
    -- Status tracking through freight lifecycle
    -- NEW_RFQ: Just received, ready for carrier outreach
    -- QUOTED: Received carrier quotes, ready for booking
    -- BOOKED: Assigned to carrier, waiting for pickup
    -- IN_TRANSIT: Load picked up, en route to destination
    -- DELIVERED: Delivered, awaiting proof of delivery
    -- INVOICED: Invoiced to shipper, awaiting payment
    status VARCHAR(20) DEFAULT 'NEW_RFQ',
    
    -- ─── REQUIRED FIELDS FROM INTAKE AGENT ──────────────────────────────────
    -- These fields are essential for carrier sourcing and must be present
    -- Origin zip code - used for carrier proximity matching
    origin_zip VARCHAR(10) NOT NULL,
    
    -- Destination zip code - used for carrier lane analysis
    dest_zip VARCHAR(10) NOT NULL,
    
    -- Pickup date/time - critical for capacity planning
    pickup_dt TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Equipment type - determines carrier eligibility
    -- Common values: Van, Flatbed, Reefer, Stepdeck, RGN, Tanker
    equipment VARCHAR(50) NOT NULL,
    
    -- Weight in pounds - affects carrier capacity and rates
    weight_lb INTEGER NOT NULL,
    
    -- ─── OPTIONAL FIELDS THAT MAY BE EXTRACTED ──────────────────────────────
    -- Additional details that improve carrier matching and pricing
    commodity VARCHAR(255), -- What's being shipped (affects handling/rates)
    rate_per_mile DECIMAL(10,2), -- Shipper's offered rate per mile
    total_miles INTEGER, -- Distance calculation for pricing
    hazmat BOOLEAN DEFAULT FALSE, -- Hazardous materials flag (affects carrier eligibility)
    
    -- ─── SHIPPER INFORMATION ────────────────────────────────────────────────
    -- Contact details for communications and relationship management
    shipper_name VARCHAR(255),
    shipper_email VARCHAR(255),
    shipper_phone VARCHAR(20),
    
    -- ─── SOURCE TRACKING ────────────────────────────────────────────────────
    -- Maintains audit trail and enables source-specific processing
    source_email_id VARCHAR(255), -- Original email identifier for tracking
    source_type VARCHAR(20) DEFAULT 'EMAIL', -- EMAIL, EDI, MANUAL, API
    raw_email_text TEXT, -- Original email content for dispute resolution
    
    -- ─── AI PROCESSING METADATA ─────────────────────────────────────────────
    -- Tracks AI extraction quality and identifies potential issues
    extraction_confidence DECIMAL(3,2), -- 0.00 to 1.00 confidence score
    missing_fields TEXT[], -- Array of fields that couldn't be extracted
    ai_notes TEXT, -- Additional context or warnings from AI processing
    
    -- ─── COMPLEXITY DETECTION AND REVIEW FLAGS ──────────────────────────────
    -- Comprehensive freight complexity analysis for human review workflow
    complexity_flags TEXT[] DEFAULT ARRAY[]::TEXT[], -- Array of detected complexity types
    complexity_analysis TEXT, -- Detailed analysis of detected complexity patterns
    requires_human_review BOOLEAN DEFAULT FALSE, -- Flag indicating if load needs broker review
    risk_score INTEGER DEFAULT 0, -- Risk score from 0-100 based on complexity factors
    reviewed_by VARCHAR(255), -- Broker who reviewed the complex load
    reviewed_at TIMESTAMP WITH TIME ZONE, -- When the load was reviewed and approved
    review_notes TEXT -- Broker notes from complexity review
    
    -- ─── BUSINESS FIELDS ────────────────────────────────────────────────────
    -- Support business operations and profitability analysis
    margin_target DECIMAL(5,2), -- Target margin percentage for this load
    priority_level INTEGER DEFAULT 5, -- 1-10 scale for load prioritization
    
    -- ─── AUDIT FIELDS ───────────────────────────────────────────────────────
    -- Track who created/modified records for accountability
    created_by VARCHAR(255) DEFAULT 'intake_agent',
    modified_by VARCHAR(255)
);

-- ===============================================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- ===============================================================================
-- These indexes support common query patterns in the freight brokerage workflow

-- Index on status for filtering loads by lifecycle stage
-- Used by: LoadBlast Agent (NEW_RFQ), Broker UI (all statuses), Reports
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status);

-- Index on pickup date for timeline-based queries
-- Used by: Capacity planning, SLA monitoring, dispatch scheduling
CREATE INDEX IF NOT EXISTS idx_loads_pickup_dt ON loads(pickup_dt);

-- Index on created_at for recent loads queries
-- Used by: Broker dashboard, recent activity feeds, performance metrics
CREATE INDEX IF NOT EXISTS idx_loads_created_at ON loads(created_at);

-- Composite index for geographic queries (origin/destination analysis)
-- Used by: Lane analysis, carrier sourcing, rate benchmarking
CREATE INDEX IF NOT EXISTS idx_loads_origin_dest ON loads(origin_zip, dest_zip);

-- Index for complexity and review workflow queries
-- Used by: Broker dashboard, LoadBlast Agent, complexity analytics
CREATE INDEX IF NOT EXISTS idx_loads_complexity_review ON loads(requires_human_review, complexity_flags);

-- GIN index for complexity flags array queries
-- Used by: Complexity filtering, risk analysis, freight type reporting
CREATE INDEX IF NOT EXISTS idx_loads_complexity_flags ON loads USING GIN (complexity_flags);

-- ===============================================================================
-- AUTOMATED TIMESTAMP MANAGEMENT
-- ===============================================================================
-- Automatically updates the updated_at field whenever a record is modified
-- Critical for audit trails and change tracking

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- Set updated_at to current timestamp on any update
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger fires before any UPDATE operation on loads table
CREATE TRIGGER update_loads_updated_at 
    BEFORE UPDATE ON loads 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ===============================================================================
-- REAL-TIME NOTIFICATION SYSTEM
-- ===============================================================================
-- Enables immediate agent coordination when new loads are created
-- LoadBlast Agent subscribes to 'load.created' notifications for instant processing

CREATE OR REPLACE FUNCTION notify_new_load()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify for NEW_RFQ status loads (ready for carrier outreach)
    -- This prevents notification spam for status updates
    IF NEW.status = 'NEW_RFQ' THEN
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
                'weight_lb', NEW.weight_lb
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger fires after INSERT operations to notify downstream agents
CREATE TRIGGER trigger_notify_new_load
    AFTER INSERT ON loads
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_load();

-- ===============================================================================
-- AUTOMATIC LOAD NUMBER GENERATION
-- ===============================================================================
-- Generates human-readable load numbers when not provided by shipper
-- Format: LD20240115-0001 (LD + YYYYMMDD + sequence)

CREATE OR REPLACE FUNCTION generate_load_number()
RETURNS TRIGGER AS $$
BEGIN
    -- Only generate if load_number is not provided
    IF NEW.load_number IS NULL THEN
        -- Format: LD + current date + 4-digit sequence
        -- Example: LD20240115-0001
        NEW.load_number := 'LD' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('load_number_seq')::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Sequence for generating unique daily load numbers
-- Resets daily through the date component in load_number format
CREATE SEQUENCE IF NOT EXISTS load_number_seq START 1;

-- Trigger fires before INSERT to generate load numbers
CREATE TRIGGER trigger_generate_load_number
    BEFORE INSERT ON loads
    FOR EACH ROW
    EXECUTE FUNCTION generate_load_number();

-- ===============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ===============================================================================
-- Ensures data isolation in multi-tenant broker environments
-- Critical for SaaS deployment where multiple brokers share infrastructure

-- Enable RLS on the loads table
ALTER TABLE loads ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can manage all loads
-- Used by: Edge Functions, background jobs, system processes
CREATE POLICY "Service role can manage loads" ON loads
    FOR ALL USING (auth.role() = 'service_role');

-- Policy: Authenticated users can view loads
-- Used by: Broker UI, reports, human users
CREATE POLICY "Users can view loads" ON loads
    FOR SELECT USING (auth.role() = 'authenticated');

-- Policy: Authenticated users can create loads
-- Used by: Manual load entry, import processes
CREATE POLICY "Users can create loads" ON loads
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ===============================================================================
-- SAMPLE DATA FOR TESTING
-- ===============================================================================
-- Creates a sample load for testing the complete workflow
-- Helps validate that all triggers and functions work correctly

INSERT INTO loads (
    origin_zip, dest_zip, pickup_dt, equipment, weight_lb,
    shipper_name, shipper_email, commodity,
    source_type, ai_notes, extraction_confidence
) VALUES (
    '90210', '10001', '2024-01-15 08:00:00-08:00', 'Van', 25000,
    'Sample Shipper Inc', 'shipping@sample.com', 'Electronics',
    'MANUAL', 'Sample load for testing AI-Broker MVP', 1.00
) ON CONFLICT (load_number) DO NOTHING;

-- ===============================================================================
-- MAINTENANCE NOTES
-- ===============================================================================
-- 
-- REGULAR MAINTENANCE:
-- - Monitor load_number_seq for wraparound (reset annually)
-- - Archive completed loads older than 2 years to loads_archive table
-- - Vacuum and analyze table weekly for optimal performance
-- - Monitor pg_notify queue for agent coordination issues
--
-- SCALING CONSIDERATIONS:
-- - Partition by created_at when table exceeds 1M rows
-- - Consider separate tables for different load types (LTL vs FTL)
-- - Add materialized views for common aggregate queries
-- - Implement connection pooling for high-concurrency scenarios
--
-- FUTURE ENHANCEMENTS:
-- - Add PostGIS for geographic distance calculations
-- - Implement JSON columns for flexible equipment requirements
-- - Add full-text search indexes for commodity descriptions
-- - Create views for common business intelligence queries
-- ===============================================================================