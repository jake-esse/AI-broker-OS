/**
 * Comprehensive Intake Agent Testing
 * Tests the full IntakeAgentLLMEnhanced with edge cases
 */

import { config } from 'dotenv'
import * as path from 'path'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

// Import the agent
import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced'

// Comprehensive test cases based on freight industry patterns
const testCases = [
  // === CLEAR LOAD REQUESTS ===
  {
    id: 'clear-ftl-1',
    category: 'Clear FTL Request',
    email: {
      subject: 'Load - Chicago to Dallas',
      from: 'shipper@acme.com',
      content: `Need a truck for tomorrow.
      
Pickup: Chicago, IL 60601
Delivery: Dallas, TX 75201  
Weight: 42,000 lbs
Commodity: Palletized general merchandise
Equipment: 53' dry van

Please quote ASAP.`
    },
    expected: { action: 'proceed_to_quote', freight_type: 'FTL_DRY_VAN' }
  },

  // === EDGE CASES - Could be confusing ===
  {
    id: 'edge-forward-chain',
    category: 'Forwarded Email Chain',
    email: {
      subject: 'FW: FW: RE: Urgent load',
      from: 'assistant@company.com',
      content: `
-------- Forwarded Message --------
From: Manager
Subject: Urgent load

Can someone arrange shipping for 20 pallets?

-------- Original Message --------
From: Warehouse

We have 20 pallets ready (30,000 lbs). Denver to Kansas City. Need reefer, keep below 40°F.

-------- Reply --------
Forwarding to broker. Can you handle Wednesday pickup?`
    },
    expected: { action: 'proceed_to_quote', freight_type: 'FTL_REEFER' }
  },

  {
    id: 'edge-minimal-info',
    category: 'Minimal Information',
    email: {
      subject: 'Quote needed',
      from: 'shipper@quick.com',
      content: 'Chicago to Dallas, dry van, next week'
    },
    expected: { action: 'request_clarification', reason: 'Missing weight and specific dates' }
  },

  {
    id: 'edge-mixed-content',
    category: 'Mixed Content (Past + New)',
    email: {
      subject: 'RE: Yesterday\'s delivery + New load',
      from: 'shipper@mixed.com',
      content: `Thanks for handling yesterday's Miami shipment.

BTW, we have another one:
- Atlanta, GA 30301 to Nashville, TN 37201
- 35,000 lbs
- Flatbed needed
- Ready Monday

Can you quote?`
    },
    expected: { action: 'proceed_to_quote', freight_type: 'FTL_FLATBED' }
  },

  // === FALSE POSITIVES - Should NOT be loads ===
  {
    id: 'false-invoice',
    category: 'Invoice with Load Details',
    email: {
      subject: 'Invoice #12345 - Chicago to Dallas',
      from: 'billing@carrier.com',
      content: `Invoice for completed shipment:

Pickup: Chicago, IL
Delivery: Dallas, TX
Weight: 40,000 lbs
Rate: $2,500

Please remit payment within 30 days.`
    },
    expected: { action: 'ignore', reason: 'Invoice for completed load' }
  },

  {
    id: 'false-update',
    category: 'Delivery Update',
    email: {
      subject: 'Load delivered - Chicago to Dallas',
      from: 'driver@carrier.com',
      content: `Just delivered the 42,000 lb load in Dallas. 
      
POD signed by John at warehouse.
Customer was happy with on-time delivery.`
    },
    expected: { action: 'ignore', reason: 'Delivery confirmation' }
  },

  {
    id: 'false-capacity',
    category: 'Capacity Inquiry',
    email: {
      subject: 'Do you cover Texas lanes?',
      from: 'planner@shipper.com',
      content: `We're looking for brokers who can handle regular runs from Dallas to Houston.
      
Typical loads are 40,000 lbs dry van.
Not booking anything now, just checking for future reference.`
    },
    expected: { action: 'ignore', reason: 'General capacity inquiry' }
  },

  // === CLARIFICATION RESPONSES ===
  {
    id: 'clarification-response',
    category: 'Response to Info Request',
    email: {
      subject: 'RE: Need more information',
      from: 'shipper@company.com',
      content: `Sorry, here are the details:

Pickup zip: 60601
Delivery zip: 75201
Weight: 38,000 lbs

Let me know if you need anything else.`,
      inReplyTo: '<clarification-123@broker.com>'
    },
    expected: { action: 'request_clarification', reason: 'Still missing equipment type and dates' }
  },

  // === SPECIAL FREIGHT TYPES ===
  {
    id: 'hazmat-load',
    category: 'Hazmat Load',
    email: {
      subject: 'HAZMAT - Class 3 Flammable',
      from: 'hazmat@chemical.com',
      content: `Hazmat shipment:

From: Houston, TX 77001
To: New Orleans, LA 70112
Product: Acetone (UN1090)
Class: 3, PG II
Weight: 42,000 lbs
Equipment: Dry van
Pickup: Tomorrow AM

Need hazmat endorsed carrier.`
    },
    expected: { action: 'proceed_to_quote', freight_type: 'FTL_HAZMAT' }
  },

  {
    id: 'ltl-shipment',
    category: 'LTL Shipment',
    email: {
      subject: 'Small shipment - 6 pallets',
      from: 'warehouse@company.com',
      content: `Need LTL service:

From: Denver, CO 80202
To: Salt Lake City, UT 84101
6 pallets, 3,500 lbs
Class 70
Liftgate needed at delivery
Ready for pickup tomorrow`
    },
    expected: { action: 'proceed_to_quote', freight_type: 'LTL' }
  },

  // === TRICKY PATTERNS ===
  {
    id: 'rate-negotiation',
    category: 'Rate Negotiation (Not New Load)',
    email: {
      subject: 'Your quote on the Dallas load',
      from: 'buyer@shipper.com',
      content: `Got your quote for $2,800 on the Chicago to Dallas, 42,000 lbs.

Can you do $2,500? If so, book it for Thursday.`
    },
    expected: { action: 'ignore', reason: 'Negotiating existing quote' }
  },

  {
    id: 'similar-to-previous',
    category: 'Reference to Previous Load',
    email: {
      subject: 'Same as last week',
      from: 'regular@customer.com',
      content: 'Need another load just like last Tuesday. Same everything but make it 35,000 lbs this time.'
    },
    expected: { action: 'request_clarification', reason: 'No specific location or equipment details' }
  }
]

// Test runner
async function runComprehensiveTests() {
  console.log('🚀 Running Comprehensive Intake Agent Tests')
  console.log('==========================================\n')

  const agent = new IntakeAgentLLMEnhanced()
  const results: any[] = []
  
  let correctActions = 0
  let correctFreightTypes = 0
  let total = 0

  for (const test of testCases) {
    console.log(`\n📧 Testing: ${test.category}`)
    console.log(`   ID: ${test.id}`)
    console.log(`   Subject: "${test.email.subject}"`)
    
    try {
      const result = await agent.processEmail({
        from: test.email.from,
        to: 'broker@company.com',
        subject: test.email.subject,
        content: test.email.content,
        brokerId: 'test-broker-id',
        inReplyTo: test.email.inReplyTo,
      })

      // Check if action matches
      const actionCorrect = result.action === test.expected.action
      if (actionCorrect) correctActions++

      // Check freight type if applicable
      let freightTypeCorrect = true
      if (test.expected.freight_type && result.action === 'proceed_to_quote') {
        freightTypeCorrect = result.freight_type === test.expected.freight_type
        if (freightTypeCorrect) correctFreightTypes++
      }

      total++

      // Display results
      console.log(`   Result: ${actionCorrect ? '✅' : '❌'} Action: ${result.action} (expected: ${test.expected.action})`)
      if (result.freight_type) {
        console.log(`   Freight Type: ${freightTypeCorrect ? '✅' : '❌'} ${result.freight_type} (expected: ${test.expected.freight_type || 'N/A'})`)
      }
      console.log(`   Confidence: ${result.confidence}%`)
      if (result.reason) {
        console.log(`   Reason: ${result.reason}`)
      }
      if (result.missing_fields?.length) {
        console.log(`   Missing: ${result.missing_fields.join(', ')}`)
      }

      // Store detailed result
      results.push({
        ...test,
        result,
        actionCorrect,
        freightTypeCorrect
      })

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`)
      total++
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // Summary
  console.log('\n\n📊 TEST SUMMARY')
  console.log('===============')
  console.log(`Total Tests: ${total}`)
  console.log(`Action Accuracy: ${correctActions}/${total} (${(correctActions/total*100).toFixed(1)}%)`)
  console.log(`Freight Type Accuracy: ${correctFreightTypes}/${testCases.filter(t => t.expected.freight_type).length} loads with freight type`)

  // Detailed analysis
  console.log('\n📈 Category Analysis:')
  const categories = [...new Set(testCases.map(t => t.category))]
  for (const category of categories) {
    const categoryTests = results.filter(r => r.category === category)
    const correct = categoryTests.filter(r => r.actionCorrect).length
    console.log(`   ${category}: ${correct}/${categoryTests.length}`)
  }

  // Misclassifications
  const misclassified = results.filter(r => !r.actionCorrect)
  if (misclassified.length > 0) {
    console.log('\n❌ Misclassifications:')
    for (const miss of misclassified) {
      console.log(`   ${miss.id}: Expected ${miss.expected.action}, got ${miss.result.action}`)
      console.log(`      Subject: "${miss.email.subject}"`)
    }
  }

  return { results, correctActions, total }
}

// Run tests
runComprehensiveTests().catch(console.error)