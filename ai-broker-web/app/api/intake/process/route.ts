import { NextRequest, NextResponse } from 'next/server'
import * as db from '@/lib/database/operations'
// import { IntakeAgent } from '@/lib/agents/intake'  // DEPRECATED: Using LLM-based intake only
// import { IntakeAgentLLM } from '@/lib/agents/intake-llm'  // DEPRECATED: Using enhanced version
import { IntakeAgentLLMEnhanced } from '@/lib/agents/intake-llm-enhanced'
import prisma from '@/lib/prisma'
import { FreightValidator } from '@/lib/freight-types/freight-validator'
import { ClarificationGenerator } from '@/lib/email/clarification-generator'
import { OAuthEmailSender } from '@/lib/email/oauth-sender'

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const { email_id, broker_id, channel, content, raw_data, from, to, subject, in_reply_to, references } = body

    console.log('[Intake API] Processing request:', { email_id, broker_id, from, subject, is_reply: !!in_reply_to })

    // Initialize enhanced intake agent with freight type validation
    const intakeAgent = new IntakeAgentLLMEnhanced()

    // Process the email content
    const result = await intakeAgent.processEmail({
      from: from || raw_data?.from || '',
      to: to || raw_data?.to || '',
      subject: subject || raw_data?.subject || '',
      content: content || '',
      brokerId: broker_id,
      inReplyTo: in_reply_to || raw_data?.inReplyTo,
      references: references || raw_data?.references,
      messageId: raw_data?.messageId
    }, email_id)

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

    // Handle the result based on action
    if (result.action === 'proceed_to_quote') {
      // The IntakeAgent already created the load, just return the result
      return NextResponse.json({
        action: result.action,
        load_id: result.load_id,
        freight_type: result.freight_type,
        extracted_data: result.extracted_data,
        confidence: result.confidence,
        validation_warnings: result.validation_warnings,
      })

    } else if (result.action === 'request_clarification') {
      // Get broker details
      const broker = await prisma.broker.findUnique({
        where: { id: broker_id },
        include: { user: true }
      })
      
      if (!broker) {
        return NextResponse.json(
          { error: 'Broker not found' },
          { status: 404 }
        )
      }

      // Generate clarification email
      const emailData = ClarificationGenerator.generateEmail({
        shipperEmail: from,
        brokerName: broker.companyName || broker.user?.name || 'Your Freight Broker',
        freightType: result.freight_type || 'UNKNOWN',
        extractedData: result.extracted_data || {},
        missingFields: result.missing_fields || [],
        validationWarnings: result.validation_warnings
      })

      // Get the original email message ID for threading
      let originalMessageId: string | undefined
      if (email_id) {
        const originalEmail = await prisma.email.findUnique({
          where: { id: email_id },
          select: { rawData: true }
        })
        if (originalEmail?.rawData) {
          originalMessageId = OAuthEmailSender.extractMessageId(originalEmail.rawData)
        }
      }

      // Send clarification email via OAuth
      const sender = new OAuthEmailSender()
      const sendResult = await sender.sendEmail(broker_id, {
        to: from,
        subject: emailData.subject,
        htmlContent: emailData.htmlContent,
        textContent: emailData.textContent,
        inReplyTo: originalMessageId,
        references: originalMessageId
      })

      if (sendResult.success) {
        // Create clarification request record
        const clarificationRequest = await prisma.clarificationRequest.create({
          data: {
            brokerId: broker_id,
            shipperEmail: from,
            freightType: result.freight_type || 'UNKNOWN',
            extractedData: result.extracted_data || {},
            missingFields: result.missing_fields || [],
            validationWarnings: result.validation_warnings || [],
            emailSent: true,
            emailId: sendResult.messageId,
            emailMessageId: originalMessageId, // Store for threading
            sentAt: new Date()
          }
        })

        // Create a chat message for tracking
        if (result.extracted_data && (result.extracted_data.pickup_location || result.extracted_data.delivery_location)) {
          await prisma.chatMessage.create({
            data: {
              loadId: 'pending-' + clarificationRequest.id, // Temporary ID until load is created
              brokerId: broker_id,
              role: 'assistant',
              content: `I've sent an email requesting the additional information needed to provide your quote. I'll process your quote as soon as you reply with the missing details.`,
              metadata: {
                action: 'clarification_sent',
                clarification_request_id: clarificationRequest.id,
                missing_fields: result.missing_fields,
                freight_type: result.freight_type
              }
            }
          })
        }

        console.log(`[Intake API] Clarification email sent via ${sendResult.provider} to ${from}`)

        return NextResponse.json({
          action: result.action,
          freight_type: result.freight_type,
          clarification_needed: result.clarification_needed,
          missing_fields: result.missing_fields,
          extracted_data: result.extracted_data,
          reason: result.reason,
          clarification_sent: true,
          clarification_request_id: clarificationRequest.id,
          email_provider: sendResult.provider,
          validation_warnings: result.validation_warnings,
        })
      } else {
        // Failed to send clarification
        console.error('[Intake API] Failed to send clarification:', sendResult.error)
        
        return NextResponse.json({
          action: result.action,
          freight_type: result.freight_type,
          clarification_needed: result.clarification_needed,
          missing_fields: result.missing_fields,
          extracted_data: result.extracted_data,
          reason: result.reason,
          clarification_sent: false,
          clarification_error: sendResult.error,
          validation_warnings: result.validation_warnings,
        })
      }

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