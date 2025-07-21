// ===============================================================================
// AI-Broker MVP · Create Load Edge Function (Updated for Production Schema)
// ===============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders } from '../_shared/cors.ts'

// ===============================================================================
// TYPE DEFINITIONS (Updated to match actual database schema)
// ===============================================================================

interface LoadData {
  // Location fields (matching actual schema)
  origin_zip?: string
  dest_zip?: string
  
  // Date and equipment (matching actual schema)  
  pickup_dt?: string  // Note: actual column is pickup_dt, not pickup_date
  equipment?: string  // Note: actual column is equipment, not equipment_type
  weight_lb?: number  // Note: actual column is weight_lb, not weight_lbs
  
  // Optional fields
  commodity?: string
  rate_per_mile?: number
  total_miles?: number
  hazmat?: boolean
  
  // Shipper information
  shipper_name?: string
  shipper_email?: string
  shipper_phone?: string
  
  // Source tracking (matching actual schema)
  source_email_id?: string
  source_type?: string
  raw_email_text?: string
  source_email_account_id?: string
  
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
  
  // Additional fields from actual schema
  post_to_carriers?: boolean
  post_to_dat?: boolean
  posting_delay_minutes?: number
  max_carriers_to_contact?: number
  preferred_rate_per_mile?: number
  complexity_overrides?: any
  broker_review_status?: string
  assigned_specialist?: string
  broker_review_notes?: string
  review_reason?: string
}

interface LoadResponse {
  success: boolean
  load_id?: string
  load_number?: string
  message?: string
  error?: string
}

// ===============================================================================
// VALIDATION FUNCTIONS (Updated for actual schema)
// ===============================================================================

function validateLoadData(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // Basic validation - at least one piece of location info should be present
  if (!data.origin_zip && !data.dest_zip) {
    errors.push('At least origin_zip or dest_zip should be provided')
  }
  
  // Validate pickup date format if provided
  if (data.pickup_dt && typeof data.pickup_dt === 'string') {
    // Accept various date formats
    const datePattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/
    if (!datePattern.test(data.pickup_dt)) {
      errors.push('pickup_dt should be in YYYY-MM-DD or ISO format')
    }
  }
  
  // Validate numeric fields
  if (data.weight_lb && (typeof data.weight_lb !== 'number' || data.weight_lb <= 0)) {
    errors.push('weight_lb must be a positive number')
  }
  
  if (data.rate_per_mile && (typeof data.rate_per_mile !== 'number' || data.rate_per_mile <= 0)) {
    errors.push('rate_per_mile must be a positive number')
  }
  
  if (data.extraction_confidence && 
      (typeof data.extraction_confidence !== 'number' || 
       data.extraction_confidence < 0 || 
       data.extraction_confidence > 1)) {
    errors.push('extraction_confidence must be a number between 0 and 1')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// ===============================================================================
// MAIN EDGE FUNCTION
// ===============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
    
    console.log('Received load data:', JSON.stringify(loadData, null, 2))

    // Validate input
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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Build insert object matching actual schema
    const insertData: any = {
      // Core fields (matching actual database columns)
      ...(loadData.origin_zip && { origin_zip: loadData.origin_zip }),
      ...(loadData.dest_zip && { dest_zip: loadData.dest_zip }),
      ...(loadData.pickup_dt && { pickup_dt: loadData.pickup_dt }),
      ...(loadData.equipment && { equipment: loadData.equipment }),
      ...(loadData.weight_lb && { weight_lb: loadData.weight_lb }),
      
      // Optional fields
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
      ...(loadData.source_email_account_id && { source_email_account_id: loadData.source_email_account_id }),
      
      // AI processing metadata
      ...(loadData.extraction_confidence !== undefined && { extraction_confidence: loadData.extraction_confidence }),
      ...(loadData.missing_fields && { missing_fields: loadData.missing_fields }),
      ...(loadData.ai_notes && { ai_notes: loadData.ai_notes }),
      
      // Business fields
      ...(loadData.margin_target && { margin_target: loadData.margin_target }),
      ...(loadData.priority_level && { priority_level: loadData.priority_level }),
      
      // Load identification
      ...(loadData.load_number && { load_number: loadData.load_number }),
      
      // Complexity and review
      ...(loadData.complexity_flags && { complexity_flags: loadData.complexity_flags }),
      ...(loadData.complexity_analysis && { complexity_analysis: loadData.complexity_analysis }),
      ...(loadData.requires_human_review !== undefined && { requires_human_review: loadData.requires_human_review }),
      ...(loadData.risk_score && { risk_score: loadData.risk_score }),
      
      // Additional business fields
      ...(loadData.post_to_carriers !== undefined && { post_to_carriers: loadData.post_to_carriers }),
      ...(loadData.post_to_dat !== undefined && { post_to_dat: loadData.post_to_dat }),
      ...(loadData.posting_delay_minutes && { posting_delay_minutes: loadData.posting_delay_minutes }),
      ...(loadData.max_carriers_to_contact && { max_carriers_to_contact: loadData.max_carriers_to_contact }),
      ...(loadData.preferred_rate_per_mile && { preferred_rate_per_mile: loadData.preferred_rate_per_mile }),
      ...(loadData.complexity_overrides && { complexity_overrides: loadData.complexity_overrides }),
      ...(loadData.broker_review_status && { broker_review_status: loadData.broker_review_status }),
      ...(loadData.assigned_specialist && { assigned_specialist: loadData.assigned_specialist }),
      ...(loadData.broker_review_notes && { broker_review_notes: loadData.broker_review_notes }),
      ...(loadData.review_reason && { review_reason: loadData.review_reason }),
      
      // Metadata
      created_by: 'intake_agent',
      status: 'NEW_RFQ'
    }

    // Insert into loads table
    const { data: insertedLoad, error: insertError } = await supabase
      .from('loads')
      .insert([insertData])
      .select('id, load_number, status')
      .single()

    if (insertError) {
      console.error('Database insert error:', insertError)
      
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

    // Success response
    const response: LoadResponse = {
      success: true,
      load_id: insertedLoad.id,
      load_number: insertedLoad.load_number,
      message: `Load ${insertedLoad.load_number || insertedLoad.id} created successfully`
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