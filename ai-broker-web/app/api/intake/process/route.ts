import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntakeAgent } from '@/lib/agents/intake'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { email_id, broker_id, channel, content, raw_data, from, to, subject } = body

    console.log('[Intake API] Processing request:', { email_id, broker_id, from, subject })

    // Initialize intake agent
    const intakeAgent = new IntakeAgent()

    // Process the email content
    const result = await intakeAgent.processEmail({
      from: from || raw_data?.from || '',
      to: to || raw_data?.to || '',
      subject: subject || raw_data?.subject || '',
      content: content || '',
      brokerId: broker_id,
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

    console.log('[Intake API] Result:', result)

    // Handle the result based on action
    if (result.action === 'proceed_to_quote') {
      // The IntakeAgent already created the load, just return the result
      return NextResponse.json({
        action: result.action,
        load_id: result.load_id,
        extracted_data: result.extracted_data,
        confidence: result.confidence,
      })

    } else if (result.action === 'request_clarification') {
      // For now, we'll just return the result
      // In a full implementation, you'd create a pending load and send clarification email
      return NextResponse.json({
        action: result.action,
        clarification_needed: result.clarification_needed,
        extracted_data: result.extracted_data,
        reason: result.reason,
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