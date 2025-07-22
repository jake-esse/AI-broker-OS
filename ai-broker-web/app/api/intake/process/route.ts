import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntakeAgent } from '@/lib/agents/intake'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { email_id, broker_id, channel, content, raw_data } = body

    // Initialize intake agent
    const intakeAgent = new IntakeAgent()

    // Process the email content
    const result = await intakeAgent.process_quote_request({
      broker_id,
      channel,
      content,
      raw_data,
    })

    // Update email status
    if (email_id) {
      await supabase
        .from('emails')
        .update({ 
          status: 'processed',
          processed_at: new Date().toISOString()
        })
        .eq('id', email_id)
    }

    // Handle the result based on action
    if (result.action === 'proceed_to_quote') {
      // Create load record
      const { data: load, error: loadError } = await supabase
        .from('loads')
        .insert({
          broker_id,
          reference_number: result.load_data.reference_number,
          shipper_name: result.load_data.shipper_name,
          shipper_email: result.load_data.shipper_email,
          origin_city: result.load_data.origin_city,
          origin_state: result.load_data.origin_state,
          origin_zip: result.load_data.origin_zip,
          dest_city: result.load_data.dest_city,
          dest_state: result.load_data.dest_state,
          dest_zip: result.load_data.dest_zip,
          pickup_date: result.load_data.pickup_date,
          delivery_date: result.load_data.delivery_date,
          commodity: result.load_data.commodity,
          weight_lbs: result.load_data.weight_lbs,
          equipment_type: result.load_data.equipment_type || 'Dry Van',
          special_instructions: result.load_data.special_instructions,
          status: 'quote_requested',
          channel: channel,
          raw_request: content,
          source_email_id: email_id,
        })
        .select()
        .single()

      if (loadError) {
        throw loadError
      }

      // Create initial chat message
      await supabase
        .from('chat_messages')
        .insert({
          load_id: load.id,
          sender_type: 'system',
          message: 'Load created from email request',
          metadata: { email_id },
        })

      // Create AI analysis message
      await supabase
        .from('chat_messages')
        .insert({
          load_id: load.id,
          sender_type: 'ai',
          message: result.analysis_summary || 'Load details extracted successfully. Ready to generate quote.',
          confidence_score: result.confidence_score,
        })

      return NextResponse.json({
        action: result.action,
        load_id: load.id,
        load_data: result.load_data,
        confidence_score: result.confidence_score,
      })

    } else if (result.action === 'request_clarification') {
      // Create a pending load record
      const { data: pendingLoad, error: pendingError } = await supabase
        .from('loads')
        .insert({
          broker_id,
          shipper_email: raw_data?.from || '',
          status: 'pending_clarification',
          channel: channel,
          raw_request: content,
          source_email_id: email_id,
          missing_fields: result.missing_fields,
        })
        .select()
        .single()

      if (pendingError) {
        throw pendingError
      }

      // Create chat message for clarification
      await supabase
        .from('chat_messages')
        .insert({
          load_id: pendingLoad.id,
          sender_type: 'ai',
          message: result.clarification_message,
          requires_response: true,
          metadata: {
            missing_fields: result.missing_fields,
            email_id,
          },
        })

      // Send clarification email
      await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: raw_data?.from || '',
          subject: `Re: ${raw_data?.subject || 'Quote Request'} - Additional Information Needed`,
          html: result.clarification_message,
          replyTo: `load-${pendingLoad.id}@ai-broker.com`,
        }),
      })

      return NextResponse.json({
        action: result.action,
        load_id: pendingLoad.id,
        missing_fields: result.missing_fields,
        clarification_message: result.clarification_message,
      })

    } else {
      // Unknown or spam
      return NextResponse.json({
        action: result.action,
        reason: result.reason,
      })
    }

  } catch (error: any) {
    console.error('Intake processing error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process intake request' },
      { status: 500 }
    )
  }
}