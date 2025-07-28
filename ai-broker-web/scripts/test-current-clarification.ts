/**
 * Test Current Clarification Implementation
 * 
 * Tests the current state of the clarification system
 */

import { config } from 'dotenv'
import * as path from 'path'

config({ path: path.join(__dirname, '../.env.local') })

// Test the API endpoint directly
async function testCurrentImplementation() {
  console.log('🧪 TESTING CURRENT CLARIFICATION IMPLEMENTATION')
  console.log('============================================\n')
  
  // Test case 1: Email missing temperature for reefer
  const testEmail = {
    email_id: null, // Don't provide email_id for testing
    broker_id: '123e4567-e89b-12d3-a456-426614174000', // Use a valid UUID
    from: 'shipper@example.com',
    to: 'broker@company.com',
    subject: 'Need reefer truck for frozen goods',
    content: `Hi,
    
I need to ship 35,000 lbs of frozen food from Chicago, IL 60601 to Atlanta, GA 30301.
Need a 53' reefer trailer.
Pickup is Monday morning.

Please send quote.`,
    raw_data: {
      from: 'shipper@example.com',
      to: 'broker@company.com',
      subject: 'Need reefer truck for frozen goods',
      messageId: 'msg-test-123'
    }
  }
  
  console.log('📧 Test Email:')
  console.log(`From: ${testEmail.from}`)
  console.log(`Subject: ${testEmail.subject}`)
  console.log(`Content: ${testEmail.content}\n`)
  
  try {
    // Call the API endpoint
    const response = await fetch('http://localhost:3000/api/intake/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testEmail)
    })
    
    const result = await response.json()
    
    console.log('📊 API Response:')
    console.log(JSON.stringify(result, null, 2))
    
    if (result.error) {
      console.error('\n❌ Error:', result.error)
    } else {
      console.log('\n✅ Test completed')
      console.log(`Action: ${result.action}`)
      console.log(`Freight Type: ${result.freight_type}`)
      if (result.missing_fields) {
        console.log(`Missing Fields: ${result.missing_fields.join(', ')}`)
      }
      console.log(`Clarification Sent: ${result.clarification_sent}`)
    }
    
  } catch (error: any) {
    console.error('\n❌ Request failed:', error.message)
  }
}

// Check environment
console.log('🔍 Environment Check:')
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`)
console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ Missing'}\n`)

// Run test
testCurrentImplementation().catch(console.error)