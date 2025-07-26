import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { ClarificationGenerator } from '@/lib/email/clarification-generator'
import { FreightType, LoadData } from '@/lib/freight-types/freight-validator'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      broker_id, 
      shipper_email, 
      freight_type, 
      extracted_data, 
      missing_fields,
      validation_warnings 
    } = body

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
      shipperEmail: shipper_email,
      brokerName: broker.companyName || broker.user.name || 'Your Freight Broker',
      freightType: freight_type as FreightType,
      extractedData: extracted_data as LoadData,
      missingFields: missing_fields,
      validationWarnings: validation_warnings
    })

    // Send email using Resend
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured')
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      )
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${broker.companyName} <noreply@${process.env.RESEND_DOMAIN || 'example.com'}>`,
        to: shipper_email,
        reply_to: broker.email,
        subject: emailData.subject,
        html: emailData.htmlContent,
        text: emailData.textContent,
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Failed to send clarification email:', error)
      throw new Error('Failed to send email')
    }

    const result = await response.json()

    // Create a record of the clarification request
    await prisma.clarificationRequest.create({
      data: {
        brokerId: broker_id,
        shipperEmail: shipper_email,
        freightType: freight_type,
        extractedData: extracted_data,
        missingFields: missing_fields,
        validationWarnings: validation_warnings || [],
        emailSent: true,
        emailId: result.id,
        sentAt: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      email_id: result.id,
      message: 'Clarification email sent successfully'
    })

  } catch (error: any) {
    console.error('Error sending clarification:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send clarification' },
      { status: 500 }
    )
  }
}