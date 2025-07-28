/**
 * Test specific dry van classification issue
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced'
import prisma from '../lib/prisma'

const testEmail = {
  from: 'michelle@packright.com',
  to: 'broker@example.com',
  subject: 'Load Quote Request',
  content: `Good afternoon,

Please quote the following dry van load:

Pickup: Los Angeles, CA 90058
Dropoff: 
Date: 
Commodity: Plastic packaging supplies
Weight: 42,500 lbs
Pallets: 30
Trailer: Standard 53' Dry Van
Hours: Pickup 7am–2pm, Delivery 6am–5pm

Please advise rate and transit time.

Thanks,
Michelle Carter
Sourcing Manager
PackRight Solutions`,
  brokerId: 'b5a660c8-0bd7-4070-ae28-ad9bb815529e'
}

async function testDryVanClassification() {
  console.log('🚛 Testing Dry Van Classification\n')
  
  const agent = new IntakeAgentLLMEnhanced()
  
  console.log('Email Content:')
  console.log(testEmail.content)
  console.log('\n' + '='.repeat(60) + '\n')
  
  try {
    // Process the email
    const result = await agent.processEmail(testEmail)
    
    console.log('Processing Result:')
    console.log('Action:', result.action)
    console.log('Freight Type:', result.freight_type)
    console.log('Confidence:', result.confidence + '%')
    console.log('Missing Fields:', result.missing_fields)
    
    if (result.extracted_data) {
      console.log('\nExtracted Data:')
      console.log('Equipment Type:', result.extracted_data.equipment_type)
      console.log('Commodity:', result.extracted_data.commodity)
      console.log('Weight:', result.extracted_data.weight)
      console.log('Temperature:', result.extracted_data.temperature || 'None')
    }
    
    // Check if it was correctly classified
    if (result.freight_type === 'FTL_DRY_VAN') {
      console.log('\n✅ SUCCESS: Correctly classified as FTL_DRY_VAN')
    } else {
      console.log(`\n❌ ERROR: Incorrectly classified as ${result.freight_type}`)
      console.log('Should have been: FTL_DRY_VAN')
    }
    
    // Check clarification email would have correct subject
    if (result.action === 'request_clarification') {
      console.log('\n📧 Clarification Email Subject:')
      const cleanSubject = testEmail.subject.replace(/^(RE:|Re:|re:|FW:|Fw:|fw:)\s*/i, '').trim()
      console.log(`Re: ${cleanSubject}`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
  
  await prisma.$disconnect()
}

testDryVanClassification().catch(console.error)