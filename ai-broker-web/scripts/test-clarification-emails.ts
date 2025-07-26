/**
 * Test script for clarification email sending
 * 
 * Run with: npx tsx scripts/test-clarification-emails.ts
 * 
 * Prerequisites:
 * - Broker account with connected Gmail or Outlook
 * - Valid database connection
 */

import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced'
import { OAuthEmailSender } from '../lib/email/oauth-sender'
import { ClarificationGenerator } from '../lib/email/clarification-generator'
import { FreightValidator } from '../lib/freight-types/freight-validator'
import prisma from '../lib/prisma'

// Test email with missing information
const incompleteEmail = {
  from: 'test-shipper@example.com',
  to: 'broker@example.com',
  subject: 'Need shipping quote',
  content: `
    Hi,
    
    I need to ship frozen seafood from Miami.
    It's about 40,000 lbs and needs to stay at 32-34°F.
    
    Can you give me a quote?
    
    Thanks
  `,
  brokerId: process.env.TEST_BROKER_ID || ''
}

async function testClarificationFlow() {
  console.log('🚛 Testing Clarification Email Flow\n')
  console.log('=' .repeat(80))
  
  if (!process.env.TEST_BROKER_ID) {
    console.error('❌ Please set TEST_BROKER_ID environment variable')
    console.log('Find a broker ID with: npx prisma studio')
    return
  }

  try {
    // Step 1: Get broker details
    console.log('\n📋 Step 1: Getting broker details...')
    const broker = await prisma.broker.findUnique({
      where: { id: process.env.TEST_BROKER_ID },
      include: { user: true }
    })

    if (!broker) {
      console.error('❌ Broker not found')
      return
    }

    console.log(`✅ Found broker: ${broker.companyName} (${broker.email})`)

    // Step 2: Check email connections
    console.log('\n📋 Step 2: Checking email connections...')
    const emailConnection = await prisma.emailConnection.findFirst({
      where: {
        brokerId: broker.id,
        status: 'active'
      }
    })

    if (!emailConnection) {
      console.error('❌ No active email connection found')
      console.log('Please connect Gmail or Outlook in the settings page')
      return
    }

    console.log(`✅ Active ${emailConnection.provider} connection: ${emailConnection.email}`)

    // Step 3: Process the incomplete email
    console.log('\n📋 Step 3: Processing incomplete email...')
    const agent = new IntakeAgentLLMEnhanced()
    const result = await agent.processEmail(incompleteEmail)

    console.log(`\n📊 Processing Result:`)
    console.log(`Action: ${result.action}`)
    console.log(`Confidence: ${result.confidence}%`)
    console.log(`Freight Type: ${result.freight_type}`)
    
    if (result.extracted_data) {
      console.log('\n📦 Extracted Data:')
      console.log(JSON.stringify(result.extracted_data, null, 2))
    }

    if (result.missing_fields) {
      console.log('\n⚠️  Missing Fields:')
      result.missing_fields.forEach(field => console.log(`  - ${field}`))
    }

    // Step 4: Generate and preview clarification email
    console.log('\n📋 Step 4: Generating clarification email...')
    
    if (result.action === 'request_clarification') {
      const emailData = ClarificationGenerator.generateEmail({
        shipperEmail: incompleteEmail.from,
        brokerName: broker.companyName || broker.user?.name || 'Your Freight Broker',
        freightType: result.freight_type || 'UNKNOWN',
        extractedData: result.extracted_data || {},
        missingFields: result.missing_fields || [],
        validationWarnings: result.validation_warnings
      })

      console.log('\n📧 Email Preview:')
      console.log('-'.repeat(60))
      console.log(`To: ${incompleteEmail.from}`)
      console.log(`Subject: ${emailData.subject}`)
      console.log('-'.repeat(60))
      console.log('\nText Version:')
      console.log(emailData.textContent)
      console.log('-'.repeat(60))

      // Step 5: Send the email (optional - uncomment to actually send)
      const shouldSend = process.argv.includes('--send')
      if (shouldSend) {
        console.log('\n📋 Step 5: Sending clarification email...')
        const sender = new OAuthEmailSender()
        const sendResult = await sender.sendEmail(broker.id, {
          to: incompleteEmail.from,
          subject: emailData.subject,
          htmlContent: emailData.htmlContent,
          textContent: emailData.textContent
        })

        if (sendResult.success) {
          console.log(`✅ Email sent successfully via ${sendResult.provider}`)
          console.log(`Message ID: ${sendResult.messageId}`)
          
          // Create clarification request record
          const clarificationRequest = await prisma.clarificationRequest.create({
            data: {
              brokerId: broker.id,
              shipperEmail: incompleteEmail.from,
              freightType: result.freight_type || 'UNKNOWN',
              extractedData: result.extracted_data || {},
              missingFields: result.missing_fields || [],
              validationWarnings: result.validation_warnings || [],
              emailSent: true,
              emailId: sendResult.messageId,
              sentAt: new Date()
            }
          })
          
          console.log(`📝 Created clarification request: ${clarificationRequest.id}`)
        } else {
          console.error(`❌ Failed to send email: ${sendResult.error}`)
        }
      } else {
        console.log('\n💡 To actually send the email, run with --send flag:')
        console.log('   npx tsx scripts/test-clarification-emails.ts --send')
      }
    } else {
      console.log('\n✅ Email had sufficient information - no clarification needed')
    }

    // Step 6: Test clarification response handling
    console.log('\n📋 Step 6: Testing clarification response...')
    
    const clarificationResponse = {
      ...incompleteEmail,
      subject: 'Re: ' + emailData.subject,
      content: `
        The delivery location is Boston, MA 02101.
        Need it delivered by end of day Friday.
        
        Thanks!
      `,
      inReplyTo: '<original-message-id@example.com>'
    }

    console.log('\n🔄 Processing clarification response...')
    const responseResult = await agent.processEmail(clarificationResponse)
    
    console.log(`\nResponse Processing Result:`)
    console.log(`Action: ${responseResult.action}`)
    console.log(`All fields present: ${responseResult.action === 'proceed_to_quote'}`)
    
    if (responseResult.extracted_data) {
      console.log('\n📦 Complete Extracted Data:')
      console.log(JSON.stringify(responseResult.extracted_data, null, 2))
    }

  } catch (error) {
    console.error('\n❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testClarificationFlow().catch(console.error)