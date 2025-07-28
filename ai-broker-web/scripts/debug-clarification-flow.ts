/**
 * Debug script to trace clarification email flow
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import prisma from '../lib/prisma'

async function debugClarificationFlow() {
  console.log('🔍 Debugging Clarification Email Flow\n')
  
  const brokerId = 'b5a660c8-0bd7-4070-ae28-ad9bb815529e'
  
  // 1. Check environment
  console.log('1️⃣ Environment Check:')
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set (' + process.env.OPENAI_API_KEY.substring(0, 7) + '...)' : 'NOT SET')
  console.log('NEXT_PUBLIC_URL:', process.env.NEXT_PUBLIC_URL || 'NOT SET')
  console.log('')
  
  // 2. Check email connections
  console.log('2️⃣ Email Connections:')
  const connections = await prisma.emailConnection.findMany({
    where: { brokerId }
  })
  
  connections.forEach(conn => {
    console.log(`- ${conn.email} (${conn.provider}): ${conn.status}`)
    console.log(`  OAuth tokens: ${conn.oauthAccessToken ? '✓' : '✗'}`)
  })
  console.log('')
  
  // 3. Check recent emails
  console.log('3️⃣ Recent Emails (last 3):')
  const emails = await prisma.email.findMany({
    where: { brokerId },
    orderBy: { createdAt: 'desc' },
    take: 3
  })
  
  emails.forEach(email => {
    console.log(`- ${email.id}`)
    console.log(`  From: ${email.fromAddress}`)
    console.log(`  Subject: ${email.subject}`)
    console.log(`  Status: ${email.status}`)
    console.log(`  Processed: ${email.processedAt ? '✓' : '✗'}`)
  })
  console.log('')
  
  // 4. Check clarification requests
  console.log('4️⃣ Clarification Requests:')
  const requests = await prisma.clarificationRequest.findMany({
    where: { brokerId },
    orderBy: { createdAt: 'desc' },
    take: 3
  })
  
  if (requests.length === 0) {
    console.log('No clarification requests found')
  } else {
    requests.forEach(req => {
      console.log(`- ${req.id}`)
      console.log(`  Shipper: ${req.shipperEmail}`)
      console.log(`  Missing: ${req.missingFields.join(', ')}`)
      console.log(`  Email sent: ${req.emailSent ? '✓' : '✗'}`)
    })
  }
  console.log('')
  
  // 5. Test intake agent initialization
  console.log('5️⃣ Testing Intake Agent:')
  try {
    const { IntakeAgentLLMEnhanced } = await import('../lib/agents/intake-llm-enhanced')
    const agent = new IntakeAgentLLMEnhanced()
    console.log('✅ Intake agent initialized successfully')
  } catch (error: any) {
    console.log('❌ Failed to initialize intake agent:', error.message)
  }
  console.log('')
  
  // 6. Create and process a test email
  console.log('6️⃣ Creating Test Email with Missing Info:')
  const testEmail = await prisma.email.create({
    data: {
      messageId: `debug-test-${Date.now()}@example.com`,
      fromAddress: 'debug-shipper@example.com',
      toAddress: 'jake@hiaiden.com',
      subject: 'Need flatbed quote',
      content: `
        Hi,
        
        I need to ship construction equipment.
        Weight is 45,000 lbs.
        Pickup from Dallas, TX.
        
        Thanks!
      `,
      brokerId: brokerId,
      status: 'received',
      receivedAt: new Date()
    }
  })
  console.log('Created test email:', testEmail.id)
  
  // 7. Process via API
  console.log('\n7️⃣ Processing via Intake API:')
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
  
  try {
    const response = await fetch(`${baseUrl}/api/intake/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_id: testEmail.id,
        broker_id: brokerId,
        channel: 'email',
        content: testEmail.content,
        from: testEmail.fromAddress,
        to: testEmail.toAddress,
        subject: testEmail.subject
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log('❌ API Error:', response.status, errorText)
    } else {
      const result = await response.json()
      console.log('✅ API Response:', JSON.stringify(result, null, 2))
    }
  } catch (error: any) {
    console.log('❌ Fetch Error:', error.message)
  }
  
  // 8. Check if clarification was created
  console.log('\n8️⃣ Checking for New Clarification Request:')
  const newRequest = await prisma.clarificationRequest.findFirst({
    where: {
      shipperEmail: 'debug-shipper@example.com',
      brokerId
    },
    orderBy: { createdAt: 'desc' }
  })
  
  if (newRequest) {
    console.log('✅ Clarification request created:')
    console.log('  ID:', newRequest.id)
    console.log('  Missing fields:', newRequest.missingFields)
    console.log('  Email sent:', newRequest.emailSent)
  } else {
    console.log('❌ No clarification request created')
  }
  
  // Cleanup
  console.log('\n🧹 Cleaning up test data...')
  await prisma.email.delete({ where: { id: testEmail.id } })
  if (newRequest) {
    await prisma.clarificationRequest.delete({ where: { id: newRequest.id } })
  }
  
  await prisma.$disconnect()
}

debugClarificationFlow().catch(console.error)