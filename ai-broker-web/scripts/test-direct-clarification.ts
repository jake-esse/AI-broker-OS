/**
 * Test IntakeAgentWithClarification directly
 * 
 * Tests the updated implementation with database schema changes
 */

import { config } from 'dotenv'
import * as path from 'path'
import { IntakeAgentWithClarification } from '../lib/agents/intake-with-clarification'

config({ path: path.join(__dirname, '../.env.local') })

async function testDirectImplementation() {
  console.log('🧪 TESTING INTAKE AGENT WITH CLARIFICATION (Direct)')
  console.log('================================================\n')
  
  try {
    const agent = new IntakeAgentWithClarification()
    
    // Test case 1: Email missing temperature for reefer
    const testEmail = {
      from: 'shipper@example.com',
      to: 'broker@company.com',
      subject: 'Need reefer truck for frozen goods',
      content: `Hi,
    
I need to ship 35,000 lbs of frozen food from Chicago, IL 60601 to Atlanta, GA 30301.
Need a 53' reefer trailer.
Pickup is Monday morning.

Please send quote.`,
      brokerId: '123e4567-e89b-12d3-a456-426614174000', // Use a valid UUID
      messageId: 'msg-test-' + Date.now()
    }
    
    console.log('📧 Test Email:')
    console.log(`From: ${testEmail.from}`)
    console.log(`Subject: ${testEmail.subject}`)
    console.log(`Content: ${testEmail.content}\n`)
    
    console.log('Processing email...\n')
    const result = await agent.processInitialEmail(testEmail)
    
    console.log('📊 Result:')
    console.log(JSON.stringify(result, null, 2))
    
    console.log('\n✅ Test completed successfully!')
    console.log(`Status: ${result.status}`)
    console.log(`Load ID: ${result.loadId}`)
    console.log(`Freight Type: ${result.freightType}`)
    if (result.missingFields) {
      console.log(`Missing Fields: ${result.missingFields.join(', ')}`)
    }
    console.log(`Clarification Email Sent: ${result.clarificationEmailSent || false}`)
    
    // Test case 2: Response to clarification
    if (result.status === 'clarification_sent' && result.loadId) {
      console.log('\n\n📧 Simulating Response Email:')
      const responseEmail = {
        from: 'shipper@example.com',
        to: 'broker@company.com',
        subject: 'Re: ' + testEmail.subject,
        content: `Keep it at 32 degrees Fahrenheit.

Thanks!`,
        brokerId: testEmail.brokerId,
        inReplyTo: testEmail.messageId,
        references: testEmail.messageId
      }
      
      console.log(`From: ${responseEmail.from}`)
      console.log(`Subject: ${responseEmail.subject}`)
      console.log(`Content: ${responseEmail.content}\n`)
      
      console.log('Processing response...\n')
      const responseResult = await agent.processInitialEmail(responseEmail)
      
      console.log('📊 Response Result:')
      console.log(JSON.stringify(responseResult, null, 2))
      
      console.log('\n✅ Response test completed!')
      console.log(`Status: ${responseResult.status}`)
      console.log(`Load ID: ${responseResult.loadId}`)
    }
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message)
    console.error('Stack:', error.stack)
  }
}

// Check environment
console.log('🔍 Environment Check:')
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`)
console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ Missing'}\n`)

// Run test
testDirectImplementation().catch(console.error)