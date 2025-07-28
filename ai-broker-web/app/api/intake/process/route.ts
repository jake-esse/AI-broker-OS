import { NextRequest, NextResponse } from 'next/server'
import * as db from '@/lib/database/operations'
// import { IntakeAgent } from '@/lib/agents/intake'  // DEPRECATED: Using LLM-based intake only
// import { IntakeAgentLLM } from '@/lib/agents/intake-llm'  // DEPRECATED: Using enhanced version
// import { IntakeAgentLLMEnhanced } from '@/lib/agents/intake-llm-enhanced'  // DEPRECATED: Using clarification flow
import { IntakeAgentWithClarification } from '@/lib/agents/intake-with-clarification'  // Now using directly with updated schema
// import { IntakeClarificationAdapter } from '@/lib/agents/intake-clarification-adapter'  // DEPRECATED: Schema now supports direct use
import prisma from '@/lib/prisma'
import { FreightValidator } from '@/lib/freight-types/freight-validator'
import { ClarificationGenerator } from '@/lib/email/clarification-generator'
import { OAuthEmailSender } from '@/lib/email/oauth-sender'

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const { email_id, broker_id, channel, content, raw_data, from, to, subject, in_reply_to, references } = body

    console.log('[Intake API] Processing request:', { email_id, broker_id, from, subject, is_reply: !!in_reply_to })
    console.log('[Intake API] OpenAI Key present:', !!process.env.OPENAI_API_KEY)
    console.log('[Intake API] OpenAI Key prefix:', process.env.OPENAI_API_KEY?.substring(0, 7) + '...')

    // Initialize clarification-enabled intake agent
    let intakeAgent: IntakeAgentWithClarification
    try {
      intakeAgent = new IntakeAgentWithClarification()
    } catch (error: any) {
      console.error('[Intake API] Failed to initialize intake agent:', error.message)
      throw new Error(`Failed to initialize intake agent: ${error.message}`)
    }

    // Process the email
    const result = await intakeAgent.processInitialEmail({
      from: from || raw_data?.from || '',
      to: to || raw_data?.to || '',
      subject: subject || raw_data?.subject || '',
      content: content || '',
      brokerId: broker_id,
      messageId: raw_data?.messageId,
      inReplyTo: in_reply_to || raw_data?.inReplyTo,
      references: references || raw_data?.references
    })

    // Update email status
    if (email_id) {
      await prisma.email.update({
        where: { id: email_id },
        data: { 
          status: 'processed',
          processedAt: new Date()
        }
      })
    }

    console.log('[Intake API] Result:', result)

    // Handle the result based on status
    if (result.status === 'quote_ready') {
      // Load is ready for quoting
      return NextResponse.json({
        action: 'proceed_to_quote',
        load_id: result.loadId,
        freight_type: result.freightType,
        extracted_data: result.extractedData,
        status: 'ready'
      })

    } else if (result.status === 'clarification_sent') {
      // Clarification was sent by the agent
      return NextResponse.json({
        action: 'request_clarification',
        load_id: result.loadId,
        freight_type: result.freightType,
        missing_fields: result.missingFields,
        extracted_data: result.extractedData,
        clarification_sent: result.clarificationEmailSent,
        status: 'awaiting_response'
      })

    } else {
      // Ignored (not a load or unprocessable)
      return NextResponse.json({
        action: 'ignore',
        status: result.status
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