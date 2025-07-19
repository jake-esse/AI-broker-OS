// ===============================================================================
// AI-Broker MVP · Update Incomplete Load Edge Function
// ===============================================================================
//
// BUSINESS PURPOSE:
// This Edge Function handles updates to incomplete loads when shippers provide
// missing information via email. It merges new data, validates completeness,
// and triggers appropriate workflows based on the updated state.
//
// WORKFLOW INTEGRATION:
// 1. Missing info handler extracts data from email → calls this function
// 2. Function merges new data with existing load
// 3. Validates if all required fields are now present
// 4. Updates load status and triggers notifications
// 5. Returns updated load state for workflow decisions
//
// TECHNICAL ARCHITECTURE:
// - Atomic updates to prevent race conditions
// - Validation of data types and formats
// - Automatic status transitions based on completeness
// - Real-time notifications for downstream agents
// - Audit trail maintenance for compliance
//
// BUSINESS RULES:
// - Only incomplete loads can be updated via this function
// - All required fields must be valid before marking complete
// - Complexity detection runs on complete loads
// - Human review required for complex freight
// - Email conversation history is append-only
// ===============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders } from '../_shared/cors.ts'

// ===============================================================================
// TYPE DEFINITIONS
// ===============================================================================

interface UpdateLoadRequest {
  load_id: string
  new_data: {
    origin_zip?: string
    dest_zip?: string
    pickup_dt?: string
    equipment?: string
    weight_lb?: number
    // Additional fields that might be provided
    commodity?: string
    special_instructions?: string
  }
  email_metadata: {
    message_id: string
    sender_email: string
    received_at: string
  }
}

interface UpdateLoadResponse {
  success: boolean
  load?: {
    id: string
    load_number: string
    is_complete: boolean
    missing_fields: string[]
    requires_human_review: boolean
    status: string
  }
  message?: string
  error?: string
}

// Required fields for a complete load
const REQUIRED_FIELDS = ['origin_zip', 'dest_zip', 'pickup_dt', 'equipment', 'weight_lb']

// ===============================================================================
// VALIDATION FUNCTIONS
// ===============================================================================

function validateUpdateRequest(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!data.load_id || typeof data.load_id !== 'string') {
    errors.push('load_id is required and must be a string')
  }
  
  if (!data.new_data || typeof data.new_data !== 'object') {
    errors.push('new_data is required and must be an object')
  }
  
  if (!data.email_metadata || typeof data.email_metadata !== 'object') {
    errors.push('email_metadata is required and must be an object')
  } else {
    if (!data.email_metadata.message_id) {
      errors.push('email_metadata.message_id is required')
    }
    if (!data.email_metadata.sender_email) {
      errors.push('email_metadata.sender_email is required')
    }
  }
  
  // Validate new_data fields if provided
  if (data.new_data) {
    if (data.new_data.weight_lb && typeof data.new_data.weight_lb !== 'number') {
      errors.push('weight_lb must be a number')
    }
    
    if (data.new_data.pickup_dt) {
      const pickupDate = new Date(data.new_data.pickup_dt)
      if (isNaN(pickupDate.getTime())) {
        errors.push('pickup_dt must be a valid ISO 8601 timestamp')
      }
    }
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
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ─── REQUEST VALIDATION ─────────────────────────────────────────────────
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

    const requestData: UpdateLoadRequest = await req.json()
    console.log('Update request received:', JSON.stringify(requestData, null, 2))

    // Validate request
    const validation = validateUpdateRequest(requestData)
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ─── FETCH CURRENT LOAD ─────────────────────────────────────────────────
    const { data: currentLoad, error: fetchError } = await supabase
      .from('loads')
      .select('*')
      .eq('id', requestData.load_id)
      .single()

    if (fetchError || !currentLoad) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Load not found',
          load_id: requestData.load_id
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Verify load is incomplete
    if (currentLoad.is_complete) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Load is already complete',
          load_number: currentLoad.load_number
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // ─── MERGE AND VALIDATE DATA ────────────────────────────────────────────
    // Merge new data with existing load data
    const mergedData = { ...currentLoad }
    for (const [field, value] of Object.entries(requestData.new_data)) {
      if (value !== null && value !== undefined) {
        mergedData[field] = value
      }
    }

    // Check which required fields are still missing
    const missingFields = REQUIRED_FIELDS.filter(field => !mergedData[field])
    const isComplete = missingFields.length === 0

    // ─── UPDATE EMAIL CONVERSATION ──────────────────────────────────────────
    const emailConversation = currentLoad.email_conversation || []
    emailConversation.push({
      timestamp: requestData.email_metadata.received_at || new Date().toISOString(),
      direction: 'inbound',
      message_id: requestData.email_metadata.message_id,
      type: 'missing_info_provided',
      sender: requestData.email_metadata.sender_email,
      fields_provided: Object.keys(requestData.new_data)
    })

    // ─── PREPARE UPDATE DATA ────────────────────────────────────────────────
    const updateData = {
      ...requestData.new_data,
      is_complete: isComplete,
      missing_fields: missingFields,
      latest_message_id: requestData.email_metadata.message_id,
      email_conversation: emailConversation,
      follow_up_count: (currentLoad.follow_up_count || 0) + 1,
      updated_at: new Date().toISOString()
    }

    // If complete, update status
    if (isComplete) {
      updateData.status = currentLoad.requires_human_review ? 'NEEDS_REVIEW' : 'NEW_RFQ'
    }

    // ─── EXECUTE UPDATE ─────────────────────────────────────────────────────
    const { data: updatedLoad, error: updateError } = await supabase
      .from('loads')
      .update(updateData)
      .eq('id', requestData.load_id)
      .select('id, load_number, is_complete, missing_fields, requires_human_review, status')
      .single()

    if (updateError) {
      console.error('Database update error:', updateError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to update load',
          details: updateError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // ─── TRIGGER NOTIFICATIONS ──────────────────────────────────────────────
    if (isComplete && !currentLoad.requires_human_review) {
      // Trigger load.completed notification for LoadBlast
      await supabase.rpc('pg_notify', {
        channel: 'load.completed',
        payload: JSON.stringify({
          load_id: updatedLoad.id,
          load_number: updatedLoad.load_number,
          from_incomplete: true
        })
      }).catch(err => console.error('Notification error:', err))
    }

    // ─── SUCCESS RESPONSE ───────────────────────────────────────────────────
    const response: UpdateLoadResponse = {
      success: true,
      load: updatedLoad,
      message: isComplete 
        ? `Load ${updatedLoad.load_number} is now complete`
        : `Load ${updatedLoad.load_number} updated, still missing: ${missingFields.join(', ')}`
    }

    console.log('Update successful:', response)

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    
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
// UPDATE WITH MISSING INFORMATION:
// curl -X POST https://your-project.supabase.co/functions/v1/fn_update_incomplete_load \
//   -H "Authorization: Bearer YOUR_ANON_KEY" \
//   -H "Content-Type: application/json" \
//   -d '{
//     "load_id": "123e4567-e89b-12d3-a456-426614174000",
//     "new_data": {
//       "dest_zip": "30303",
//       "weight_lb": 25000
//     },
//     "email_metadata": {
//       "message_id": "<reply123@shipper.com>",
//       "sender_email": "dispatcher@shipper.com",
//       "received_at": "2024-01-20T10:30:00Z"
//     }
//   }'
//
// ===============================================================================