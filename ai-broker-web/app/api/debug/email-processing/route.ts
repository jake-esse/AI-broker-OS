import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'
// import { IntakeAgent } from '@/lib/agents/intake'  // DEPRECATED: Using LLM-based intake only
import { IntakeAgentLLM } from '@/lib/agents/intake-llm'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get the broker
    const broker = await prisma.broker.findFirst({
      where: { userId: user.id }
    })

    if (!broker) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    // Get recent emails
    const emails = await prisma.email.findMany({
      where: { brokerId: broker.id },
      orderBy: { receivedAt: 'desc' },
      take: 10
    })

    // Process each email to show what would happen
    // NOTE: Only using LLM-based processing now, regex-based intake is deprecated
    const intakeAgentLLM = new IntakeAgentLLM()
    const results = []

    for (const email of emails) {
      const emailData = {
        from: email.fromAddress,
        to: email.toAddress,
        subject: email.subject || '',
        content: email.content || '',
        brokerId: broker.id
      }

      // Process with LLM agent only
      let llmResult
      try {
        llmResult = await intakeAgentLLM.processEmail(emailData)
      } catch (error: any) {
        llmResult = {
          action: 'ignore',
          confidence: 0,
          reason: `LLM Error: ${error.message}`
        }
      }

      results.push({
        emailId: email.id,
        from: email.fromAddress,
        subject: email.subject,
        receivedAt: email.receivedAt,
        status: email.status,
        processingResult: llmResult,  // Using LLM result as the main result
        contentPreview: email.content?.substring(0, 200)
      })
    }

    // Get recent loads
    const loads = await prisma.load.findMany({
      where: { brokerId: broker.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    return NextResponse.json({
      broker: {
        id: broker.id,
        email: broker.email,
        companyName: broker.companyName
      },
      emailCount: emails.length,
      loadCount: loads.length,
      emailProcessingResults: results,
      recentLoads: loads.map(load => ({
        id: load.id,
        status: load.status,
        originZip: load.originZip,
        destZip: load.destZip,
        createdAt: load.createdAt,
        sourceType: load.sourceType
      }))
    })
  } catch (error: any) {
    console.error('Debug error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to debug email processing' },
      { status: 500 }
    )
  }
}

// Test POST endpoint to manually process a test email
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { testEmail } = body

    // Get the broker
    const broker = await prisma.broker.findFirst({
      where: { userId: user.id }
    })

    if (!broker) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    // Create a test email if content provided
    if (testEmail) {
      const email = await prisma.email.create({
        data: {
          brokerId: broker.id,
          fromAddress: testEmail.from || 'test@example.com',
          toAddress: testEmail.to || broker.email,
          subject: testEmail.subject || 'Test Load Request',
          content: testEmail.content || `
Test load request:
Pickup: Chicago, IL 60601
Delivery: New York, NY 10001
Weight: 25,000 lbs
Commodity: General Freight
Pickup Date: ASAP
          `,
          messageId: `test-${Date.now()}`,
          provider: 'test',
          receivedAt: new Date(),
          status: 'received'
        }
      })

      // Process it with LLM agent only
      // NOTE: Regex-based intake is deprecated
      const intakeAgentLLM = new IntakeAgentLLM()
      
      const emailData = {
        from: email.fromAddress,
        to: email.toAddress,
        subject: email.subject || '',
        content: email.content || '',
        brokerId: broker.id
      }
      
      let llmResult
      try {
        llmResult = await intakeAgentLLM.processEmail(emailData)
      } catch (error: any) {
        llmResult = {
          action: 'ignore',
          confidence: 0,
          reason: `LLM Error: ${error.message}`
        }
      }

      return NextResponse.json({
        email: email,
        processingResult: llmResult
      })
    }

    return NextResponse.json({ error: 'No test email provided' }, { status: 400 })
  } catch (error: any) {
    console.error('Test processing error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process test email' },
      { status: 500 }
    )
  }
}