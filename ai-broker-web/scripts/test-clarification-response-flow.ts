/**
 * Test script for complete clarification response flow
 * 
 * Run with: npx tsx scripts/test-clarification-response-flow.ts
 * 
 * This script simulates:
 * 1. Initial incomplete email
 * 2. Clarification request sent
 * 3. Shipper response with missing info
 * 4. Load creation from merged data
 */

import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced'
import { ClarificationResponseHandler } from '../lib/agents/clarification-response-handler'
import { FreightValidator } from '../lib/freight-types/freight-validator'
import prisma from '../lib/prisma'
import { v4 as uuidv4 } from 'uuid'

// Test data
const testBrokerId = process.env.TEST_BROKER_ID || ''
const testShipperEmail = 'test-shipper@example.com'

// Step 1: Initial incomplete email
const initialEmail = {
  from: testShipperEmail,
  to: 'broker@example.com',
  subject: 'Need reefer quote',
  content: `
    Hi,
    
    I need to ship 40,000 lbs of frozen chicken.
    It needs to stay at -10°F.
    Pickup from Atlanta, GA 30301.
    
    Can you quote this?
  `,
  brokerId: testBrokerId,
  messageId: `<initial-${uuidv4()}@example.com>`
}

// Step 2: Clarification request will be sent (simulated)
const clarificationMessageId = `<clarification-${uuidv4()}@example.com>`

// Step 3: Shipper response
const responseEmail = {
  from: testShipperEmail,
  to: 'broker@example.com',
  subject: 'Re: Additional Information Needed for Your Quote Request',
  content: `
    The delivery is to Boston, MA 02101.
    Need it delivered by December 22nd.
    
    Thanks!
  `,
  brokerId: testBrokerId,
  inReplyTo: clarificationMessageId,
  references: clarificationMessageId,
  messageId: `<response-${uuidv4()}@example.com>`
}

async function testClarificationResponseFlow() {
  console.log('🚛 Testing Complete Clarification Response Flow\n')
  console.log('=' .repeat(80))
  
  if (!testBrokerId) {
    console.error('❌ Please set TEST_BROKER_ID environment variable')
    return
  }

  try {
    const agent = new IntakeAgentLLMEnhanced()
    
    // Step 1: Process initial incomplete email
    console.log('\n📧 Step 1: Processing initial incomplete email...')
    console.log('From:', initialEmail.from)
    console.log('Subject:', initialEmail.subject)
    console.log('Content:', initialEmail.content.trim())
    
    const initialResult = await agent.processEmail(initialEmail)
    
    console.log('\n📊 Initial Processing Result:')
    console.log('Action:', initialResult.action)
    console.log('Freight Type:', initialResult.freight_type)
    console.log('Confidence:', initialResult.confidence + '%')
    
    if (initialResult.extracted_data) {
      console.log('\n📦 Extracted Data:')
      console.log(JSON.stringify(initialResult.extracted_data, null, 2))
    }
    
    if (initialResult.missing_fields) {
      console.log('\n⚠️  Missing Fields:')
      initialResult.missing_fields.forEach(field => {
        console.log(`  - ${field}`)
      })
    }

    // Simulate creating a clarification request
    if (initialResult.action === 'request_clarification') {
      console.log('\n📋 Step 2: Creating clarification request...')
      
      const clarificationRequest = await prisma.clarificationRequest.create({
        data: {
          brokerId: testBrokerId,
          shipperEmail: testShipperEmail,
          freightType: initialResult.freight_type || 'UNKNOWN',
          extractedData: initialResult.extracted_data || {},
          missingFields: initialResult.missing_fields || [],
          validationWarnings: initialResult.validation_warnings || [],
          emailSent: true,
          emailId: 'test-email-id',
          emailMessageId: clarificationMessageId,
          sentAt: new Date()
        }
      })
      
      console.log('✅ Created clarification request:', clarificationRequest.id)
      console.log('Missing fields:', clarificationRequest.missingFields.join(', '))
      
      // Step 3: Process shipper response
      console.log('\n📧 Step 3: Processing shipper response...')
      console.log('Subject:', responseEmail.subject)
      console.log('Content:', responseEmail.content.trim())
      console.log('In-Reply-To:', responseEmail.inReplyTo)
      
      const responseResult = await agent.processEmail(responseEmail, 'test-response-email-id')
      
      console.log('\n📊 Response Processing Result:')
      console.log('Action:', responseResult.action)
      console.log('Load Created:', responseResult.action === 'proceed_to_quote')
      
      if (responseResult.extracted_data) {
        console.log('\n📦 Complete Merged Data:')
        console.log(JSON.stringify(responseResult.extracted_data, null, 2))
      }
      
      if (responseResult.load_id) {
        console.log('\n✅ Load Successfully Created!')
        console.log('Load ID:', responseResult.load_id)
        
        // Fetch and display the created load
        const load = await prisma.load.findUnique({
          where: { id: responseResult.load_id }
        })
        
        if (load) {
          console.log('\n📋 Load Details:')
          console.log('  Origin:', `${load.originZip}`)
          console.log('  Destination:', `${load.destZip}`)
          console.log('  Weight:', `${load.weightLb} lbs`)
          console.log('  Commodity:', load.commodity)
          console.log('  Equipment:', load.equipment)
          console.log('  Pickup Date:', load.pickupDt)
          
          const aiNotes = JSON.parse(load.aiNotes as string)
          if (aiNotes.temperature_requirements) {
            console.log('  Temperature:', `${aiNotes.temperature_requirements.min}°${aiNotes.temperature_requirements.unit}`)
          }
        }
      }
      
      // Step 4: Check clarification request status
      console.log('\n📋 Step 4: Checking clarification request status...')
      
      const updatedRequest = await prisma.clarificationRequest.findUnique({
        where: { id: clarificationRequest.id }
      })
      
      if (updatedRequest) {
        console.log('Response Received:', updatedRequest.responseReceived)
        console.log('Load Created:', updatedRequest.loadCreated)
        console.log('Response Time:', updatedRequest.responseReceivedAt ? 
          `${(updatedRequest.responseReceivedAt.getTime() - updatedRequest.sentAt!.getTime()) / 1000}s` : 
          'N/A'
        )
      }
      
      // Get statistics
      console.log('\n📊 Clarification Statistics for Broker:')
      const stats = await ClarificationResponseHandler.getStatistics(testBrokerId)
      console.log('Total Requests:', stats.total)
      console.log('Pending:', stats.pending)
      console.log('Responded:', stats.responded)
      console.log('Converted to Loads:', stats.converted)
      console.log('Average Response Time:', stats.averageResponseTime ? 
        `${(stats.averageResponseTime / 1000 / 60).toFixed(1)} minutes` : 
        'N/A'
      )
      
      // Cleanup test data
      console.log('\n🧹 Cleaning up test data...')
      if (responseResult.load_id) {
        await prisma.load.delete({ where: { id: responseResult.load_id } })
      }
      await prisma.clarificationRequest.delete({ where: { id: clarificationRequest.id } })
      console.log('✅ Test data cleaned up')
      
    } else {
      console.log('\n⚠️  Initial email had all required information - no clarification needed')
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testClarificationResponseFlow().catch(console.error)