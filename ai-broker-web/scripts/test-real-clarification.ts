/**
 * Test real clarification email sending
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import prisma from '../lib/prisma'
import { OAuthEmailSender } from '../lib/email/oauth-sender'
import { ClarificationGenerator } from '../lib/email/clarification-generator'

async function testRealClarification() {
  console.log('📧 Testing Real Clarification Email\n')
  
  const brokerId = 'b5a660c8-0bd7-4070-ae28-ad9bb815529e'
  
  // Get broker and email connection
  const broker = await prisma.broker.findUnique({
    where: { id: brokerId }
  })
  
  const connection = await prisma.emailConnection.findFirst({
    where: { brokerId, status: 'active' }
  })
  
  console.log('Broker:', broker?.companyName)
  console.log('Email Connection:', connection?.email, `(${connection?.provider})`)
  console.log('')
  
  // Generate test clarification email
  const emailData = ClarificationGenerator.generateEmail({
    shipperEmail: 'jake.esse@icloud.com', // Your actual email for testing
    brokerName: broker?.companyName || 'Test Broker',
    freightType: 'FTL_FLATBED',
    extractedData: {
      pickup_location: 'Dallas, TX',
      weight: 45000,
      commodity: 'Construction Equipment'
    },
    missingFields: ['delivery_location', 'pickup_date'],
    validationWarnings: []
  })
  
  console.log('Email Subject:', emailData.subject)
  console.log('Email To:', 'jake.esse@icloud.com')
  console.log('')
  
  // Send via OAuth
  const sender = new OAuthEmailSender()
  console.log('Sending email...')
  
  const result = await sender.sendEmail(brokerId, {
    to: 'jake.esse@icloud.com',
    subject: emailData.subject,
    htmlContent: emailData.htmlContent,
    textContent: emailData.textContent
  })
  
  console.log('\nResult:')
  console.log('Success:', result.success)
  console.log('Provider:', result.provider)
  console.log('Message ID:', result.messageId)
  console.log('Error:', result.error || 'None')
  
  await prisma.$disconnect()
}

testRealClarification().catch(console.error)