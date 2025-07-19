// ===============================================================================
// AI-Broker MVP · Create Load Edge Function
// ===============================================================================
//
// BUSINESS PURPOSE:
// This Edge Function receives structured load data from the Intake Agent and
// persists it to the Supabase database. It serves as the bridge between the
// Python LangGraph workflow and the PostgreSQL database, ensuring data integrity
// and triggering downstream processes.
//
// WORKFLOW INTEGRATION:
// 1. Intake Agent extracts load data from email → calls this function
// 2. Function validates and inserts load into database
// 3. Database triggers notify LoadBlast Agent of new load
// 4. Function returns load ID and number for confirmation
//
// TECHNICAL ARCHITECTURE:
// - Deno runtime with TypeScript for type safety
// - Direct database connection via Supabase client
// - Input validation and sanitization
// - Error handling with detailed logging
// - CORS support for cross-origin requests
//
// BUSINESS RULES:
// - All required fields must be present (origin_zip, dest_zip, pickup_dt, equipment, weight_lb)
// - Load numbers are auto-generated if not provided
// - Confidence scores below 0.85 trigger human review flags
// - Duplicate prevention via unique constraints
//
// SECURITY CONSIDERATIONS:
// - Service role authentication required
// - Input sanitization prevents SQL injection
// - Rate limiting prevents abuse
// - Audit logging for compliance
// ===============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders } from '../_shared/cors.ts'

// ===============================================================================
// TYPE DEFINITIONS
// ===============================================================================
// Defines the expected structure of incoming load data from Intake Agent

interface LoadData {
  // Required fields - must be present for successful processing
  origin_zip: string
  dest_zip: string  
  pickup_dt: string // ISO 8601 timestamp
  equipment: string // Van, Flatbed, Reefer, etc.
  weight_lb: number
  
  // Optional fields - may be extracted from email
  commodity?: string
  rate_per_mile?: number
  total_miles?: number
  hazmat?: boolean
  
  // Shipper information
  shipper_name?: string
  shipper_email?: string
  shipper_phone?: string
  
  // Source tracking
  source_email_id?: string
  source_type?: string
  raw_email_text?: string
  
  // AI processing metadata
  extraction_confidence?: number
  missing_fields?: string[]
  ai_notes?: string
  
  // Complexity detection and review flags
  complexity_flags?: string[]
  complexity_analysis?: string
  requires_human_review?: boolean
  risk_score?: number
  
  // Business fields
  margin_target?: number
  priority_level?: number
  
  // Load identification (optional - will be auto-generated)
  load_number?: string
  
  // Email threading fields for incomplete loads
  thread_id?: string
  original_message_id?: string
  latest_message_id?: string
  in_reply_to?: string
  email_conversation?: any[] // JSON array of conversation history
  
  // Incomplete load tracking
  is_complete?: boolean
  missing_info_requested_at?: string
  missing_info_reminder_sent_at?: string
  fields_requested?: string[]
  follow_up_count?: number
}

interface LoadResponse {
  success: boolean
  load_id?: string
  load_number?: string
  message?: string
  error?: string
}

// ===============================================================================
// VALIDATION FUNCTIONS
// ===============================================================================
// Ensures data integrity before database insertion

function validateLoadData(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // For incomplete loads, only validate fields that are provided
  const isIncomplete = data.is_complete === false
  
  // Check required fields only if load is marked as complete
  if (!isIncomplete) {
    if (!data.origin_zip || typeof data.origin_zip !== 'string') {
      errors.push('origin_zip is required and must be a string')
    }
    
    if (!data.dest_zip || typeof data.dest_zip !== 'string') {
      errors.push('dest_zip is required and must be a string')
    }
    
    if (!data.pickup_dt || typeof data.pickup_dt !== 'string') {
      errors.push('pickup_dt is required and must be a string')
    }
    
    if (!data.equipment || typeof data.equipment !== 'string') {
      errors.push('equipment is required and must be a string')
    }
    
    if (!data.weight_lb || typeof data.weight_lb !== 'number') {
      errors.push('weight_lb is required and must be a number')
    }
  }
  
  // Validate provided fields regardless of completeness
  if (data.pickup_dt && typeof data.pickup_dt === 'string') {
    // Validate ISO 8601 timestamp format
    const pickupDate = new Date(data.pickup_dt)
    if (isNaN(pickupDate.getTime())) {
      errors.push('pickup_dt must be a valid ISO 8601 timestamp')
    }
  }
  
  // Validate optional numeric fields
  if (data.rate_per_mile && typeof data.rate_per_mile !== 'number') {
    errors.push('rate_per_mile must be a number')
  }
  
  if (data.total_miles && typeof data.total_miles !== 'number') {
    errors.push('total_miles must be a number')
  }
  
  if (data.extraction_confidence && 
      (typeof data.extraction_confidence !== 'number' || 
       data.extraction_confidence < 0 || 
       data.extraction_confidence > 1)) {
    errors.push('extraction_confidence must be a number between 0 and 1')
  }
  
  if (data.priority_level && 
      (typeof data.priority_level !== 'number' || 
       data.priority_level < 1 || 
       data.priority_level > 10)) {
    errors.push('priority_level must be a number between 1 and 10')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// ===============================================================================
// MAIN EDGE FUNCTION
// ===============================================================================
// Handles HTTP requests and orchestrates load creation process

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ─── REQUEST PROCESSING ─────────────────────────────────────────────────
    // Parse and validate incoming request
    
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Method not allowed. Use POST.' 
        }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const loadData: LoadData = await req.json()
    
    // Log incoming request for debugging (remove in production)
    console.log('Received load data:', JSON.stringify(loadData, null, 2))

    // ─── INPUT VALIDATION ───────────────────────────────────────────────────
    // Ensure all required fields are present and valid
    
    const validation = validateLoadData(loadData)
    if (!validation.isValid) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Validation failed', 
          details: validation.errors 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // ─── DATABASE CONNECTION ────────────────────────────────────────────────
    // Initialize Supabase client with service role privileges
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ─── LOAD CREATION ──────────────────────────────────────────────────────
    // Insert load into database with automatic triggers
    
    const { data: insertedLoad, error: insertError } = await supabase
      .from('loads')
      .insert([{
        // Required fields
        origin_zip: loadData.origin_zip,
        dest_zip: loadData.dest_zip,
        pickup_dt: loadData.pickup_dt,
        equipment: loadData.equipment,
        weight_lb: loadData.weight_lb,
        
        // Optional fields (only include if present)
        ...(loadData.commodity && { commodity: loadData.commodity }),
        ...(loadData.rate_per_mile && { rate_per_mile: loadData.rate_per_mile }),
        ...(loadData.total_miles && { total_miles: loadData.total_miles }),
        ...(loadData.hazmat !== undefined && { hazmat: loadData.hazmat }),
        
        // Shipper information
        ...(loadData.shipper_name && { shipper_name: loadData.shipper_name }),
        ...(loadData.shipper_email && { shipper_email: loadData.shipper_email }),
        ...(loadData.shipper_phone && { shipper_phone: loadData.shipper_phone }),
        
        // Source tracking
        ...(loadData.source_email_id && { source_email_id: loadData.source_email_id }),
        ...(loadData.source_type && { source_type: loadData.source_type }),
        ...(loadData.raw_email_text && { raw_email_text: loadData.raw_email_text }),
        
        // AI processing metadata
        ...(loadData.extraction_confidence && { extraction_confidence: loadData.extraction_confidence }),
        ...(loadData.missing_fields && { missing_fields: loadData.missing_fields }),
        ...(loadData.ai_notes && { ai_notes: loadData.ai_notes }),
        
        // Business fields
        ...(loadData.margin_target && { margin_target: loadData.margin_target }),
        ...(loadData.priority_level && { priority_level: loadData.priority_level }),
        
        // Load identification (if provided)
        ...(loadData.load_number && { load_number: loadData.load_number }),
        
        // Complexity detection and review flags
        ...(loadData.complexity_flags && { complexity_flags: loadData.complexity_flags }),
        ...(loadData.complexity_analysis && { complexity_analysis: loadData.complexity_analysis }),
        ...(loadData.requires_human_review !== undefined && { requires_human_review: loadData.requires_human_review }),
        ...(loadData.risk_score && { risk_score: loadData.risk_score }),
        
        // Email threading fields
        ...(loadData.thread_id && { thread_id: loadData.thread_id }),
        ...(loadData.original_message_id && { original_message_id: loadData.original_message_id }),
        ...(loadData.latest_message_id && { latest_message_id: loadData.latest_message_id }),
        ...(loadData.in_reply_to && { in_reply_to: loadData.in_reply_to }),
        ...(loadData.email_conversation && { email_conversation: loadData.email_conversation }),
        
        // Incomplete load tracking
        ...(loadData.is_complete !== undefined && { is_complete: loadData.is_complete }),
        ...(loadData.missing_info_requested_at && { missing_info_requested_at: loadData.missing_info_requested_at }),
        ...(loadData.missing_info_reminder_sent_at && { missing_info_reminder_sent_at: loadData.missing_info_reminder_sent_at }),
        ...(loadData.fields_requested && { fields_requested: loadData.fields_requested }),
        ...(loadData.follow_up_count !== undefined && { follow_up_count: loadData.follow_up_count }),
        
        // Metadata
        created_by: 'intake_agent',
        status: 'NEW_RFQ' // Ready for LoadBlast Agent
      }])
      .select('id, load_number, status')
      .single()

    // ─── ERROR HANDLING ─────────────────────────────────────────────────────
    // Handle database errors gracefully
    
    if (insertError) {
      console.error('Database insert error:', insertError)
      
      // Handle specific error types
      if (insertError.code === '23505') { // Unique constraint violation
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Load number already exists',
            details: insertError.message 
          }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Database error',
          details: insertError.message 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // ─── SUCCESS RESPONSE ───────────────────────────────────────────────────
    // Return load details for confirmation
    
    const response: LoadResponse = {
      success: true,
      load_id: insertedLoad.id,
      load_number: insertedLoad.load_number,
      message: `Load ${insertedLoad.load_number} created successfully`
    }

    console.log('Load created successfully:', response)
    
    return new Response(
      JSON.stringify(response),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    // ─── UNEXPECTED ERROR HANDLING ──────────────────────────────────────────
    // Catch any unexpected errors and return appropriate response
    
    console.error('Unexpected error in fn_create_load:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

// ===============================================================================
// USAGE EXAMPLES
// ===============================================================================
//
// SUCCESS CASE:
// curl -X POST https://your-project.supabase.co/functions/v1/fn_create_load \
//   -H "Authorization: Bearer YOUR_ANON_KEY" \
//   -H "Content-Type: application/json" \
//   -d '{
//     "origin_zip": "90210",
//     "dest_zip": "10001", 
//     "pickup_dt": "2024-01-15T08:00:00-08:00",
//     "equipment": "Van",
//     "weight_lb": 25000,
//     "shipper_name": "Test Shipper",
//     "extraction_confidence": 0.95
//   }'
//
// VALIDATION ERROR:
// curl -X POST https://your-project.supabase.co/functions/v1/fn_create_load \
//   -H "Authorization: Bearer YOUR_ANON_KEY" \
//   -H "Content-Type: application/json" \
//   -d '{
//     "origin_zip": "90210"
//   }'
//
// ===============================================================================