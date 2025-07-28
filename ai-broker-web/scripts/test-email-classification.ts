/**
 * Comprehensive Email Classification Testing Framework
 * 
 * This script tests the LLM email classification system with edge cases
 * to ensure brokers can trust the system to correctly identify load RFQs.
 * 
 * Test categories:
 * 1. Clear load requests (should classify as load)
 * 2. Non-load emails (should classify as not load)
 * 3. Edge cases that could confuse the system
 * 4. Industry-specific patterns and terminology
 */

import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced.js'
import * as fs from 'fs'
import * as path from 'path'

// Test email categories with expected outcomes
interface TestEmail {
  id: string
  category: string
  subject: string
  from: string
  content: string
  expectedClassification: 'load' | 'not_load'
  expectedConfidence: 'high' | 'medium' | 'low'
  notes: string
}

const testEmails: TestEmail[] = [
  // === CLEAR LOAD REQUESTS (Should classify as load) ===
  {
    id: 'clear-load-1',
    category: 'Clear Load Request',
    subject: 'Load Available - Chicago to Dallas',
    from: 'shipper@acmelogistics.com',
    content: `Good morning,

We have a load that needs to move from Chicago, IL 60601 to Dallas, TX 75201.

Details:
- Pickup: Tomorrow at 8 AM
- Weight: 42,000 lbs
- Commodity: General merchandise on pallets
- Equipment: 53' dry van

Please quote ASAP.

Thanks,
John Smith
ACME Logistics`,
    expectedClassification: 'load',
    expectedConfidence: 'high',
    notes: 'Standard load request with all required fields'
  },
  
  {
    id: 'clear-load-2',
    category: 'Clear Load Request',
    subject: 'URGENT - Reefer Load',
    from: 'dispatch@freshfoods.com',
    content: `Need a reefer truck ASAP!

Pickup: Los Angeles, CA 90001
Deliver: Phoenix, AZ 85001
Date: Today
Temp: Keep at 34°F
Weight: 38,000 pounds
Product: Fresh produce

Call me at 555-1234 with your rate.`,
    expectedClassification: 'load',
    expectedConfidence: 'high',
    notes: 'Refrigerated load with temperature requirements'
  },

  {
    id: 'clear-load-3',
    category: 'Clear Load Request',
    subject: 'Flatbed needed next week',
    from: 'shipping@steelco.com',
    content: `Hello,

We need to ship steel beams next week.

From: Houston, TX 77001
To: New Orleans, LA 70112
Equipment: 48' flatbed
Weight: 45,000 lbs
Dimensions: 40' x 8' x 4'
Tarping required: Yes
Pickup date: Monday 1/15

Please provide your best rate.`,
    expectedClassification: 'load',
    expectedConfidence: 'high',
    notes: 'Flatbed load with special requirements'
  },

  // === NON-LOAD EMAILS (Should classify as not load) ===
  {
    id: 'not-load-1',
    category: 'Carrier Check-In',
    subject: 'Driver at pickup location',
    from: 'driver@abctrucking.com',
    content: `Hey,

Our driver just arrived at the pickup location in Chicago. He's checking in at the gate now. Will update you once loaded.

ETA to delivery is tomorrow morning.

Thanks,
Mike`,
    expectedClassification: 'not_load',
    expectedConfidence: 'high',
    notes: 'Status update from carrier, not a new load request'
  },

  {
    id: 'not-load-2',
    category: 'Invoice/Payment',
    subject: 'Invoice #12345 - Past Due',
    from: 'accounting@carrierco.com',
    content: `Dear Broker,

This is a reminder that invoice #12345 for $3,500 is now 30 days past due.

Load details:
- Pickup: Chicago, IL on 12/15
- Delivery: Dallas, TX on 12/16
- Weight: 40,000 lbs

Please remit payment immediately to avoid service interruption.

Accounting Department`,
    expectedClassification: 'not_load',
    expectedConfidence: 'high',
    notes: 'Invoice mentioning past load details, not new load'
  },

  {
    id: 'not-load-3',
    category: 'General Inquiry',
    subject: 'Question about your services',
    from: 'newcustomer@company.com',
    content: `Hi,

I found your company online and I'm interested in learning more about your freight brokerage services. 

Do you handle refrigerated loads? What areas do you serve? What are your typical rates from California to Texas?

Please send me some information about your company.

Best regards,
Sarah Johnson`,
    expectedClassification: 'not_load',
    expectedConfidence: 'high',
    notes: 'General inquiry about services, not specific load'
  },

  // === EDGE CASES (Could confuse the system) ===
  {
    id: 'edge-1',
    category: 'Quote Request Without Details',
    subject: 'Need quote',
    from: 'shipper@company.com',
    content: `Can you quote Chicago to Dallas dry van? Need it moved next week.`,
    expectedClassification: 'load',
    expectedConfidence: 'medium',
    notes: 'Minimal details but is requesting a quote for specific lane'
  },

  {
    id: 'edge-2',
    category: 'Historical Reference',
    subject: 'Similar to last week',
    from: 'regular@customer.com',
    content: `Hi,

We need another load moved just like the one last week. Same pickup and delivery, but this time it's 35,000 lbs instead of 40,000.

Can you handle it for Tuesday?

Thanks`,
    expectedClassification: 'load',
    expectedConfidence: 'low',
    notes: 'References previous load without providing actual locations'
  },

  {
    id: 'edge-3',
    category: 'Mixed Content',
    subject: 'RE: Load confirmation + New Request',
    from: 'shipper@multiload.com',
    content: `Thanks for handling yesterday's shipment to Atlanta. The driver was very professional.

By the way, we have another load coming up:
- Miami, FL 33101 to Orlando, FL 32801
- 25,000 lbs
- Dry van
- Friday pickup

Can you quote this one too?

Also, please send the POD from yesterday's delivery when you get it.`,
    expectedClassification: 'load',
    expectedConfidence: 'high',
    notes: 'Contains both new load request and reference to completed load'
  },

  {
    id: 'edge-4',
    category: 'Forward/Reply Chain',
    subject: 'FW: FW: RE: Urgent shipment needed',
    from: 'assistant@bigcompany.com',
    content: `

-------- Forwarded Message --------
From: Manager
Sent: Monday
Subject: Urgent shipment

Team, we need to ship 20 pallets from our Denver warehouse to Kansas City. Can someone arrange this?

-------- Original Message --------
From: Warehouse
We have 20 pallets ready, about 30,000 lbs total. Need reefer truck, product must stay below 40°F.

-------- Reply --------
Forwarding to our broker. Can you handle this for Wednesday pickup?`,
    expectedClassification: 'load',
    expectedConfidence: 'medium',
    notes: 'Load request buried in email forward chain'
  },

  {
    id: 'edge-5',
    category: 'Rate Negotiation',
    subject: 'Your quote for Dallas load',
    from: 'purchasing@shipper.com',
    content: `Got your quote for $2,800 on the Chicago to Dallas load. That seems high compared to last month. 

Can you do it for $2,500? If so, we'll book it for Thursday pickup.

The load is still 42,000 lbs, dry van as discussed.`,
    expectedClassification: 'not_load',
    expectedConfidence: 'medium',
    notes: 'Negotiating existing quote, not new load request'
  },

  {
    id: 'edge-6',
    category: 'Clarification Response',
    subject: 'RE: Need more info',
    from: 'shipper@company.com',
    content: `Sorry, here are the missing details:

Pickup zip: 30301
Delivery zip: 70119  
Weight: 28,000 lbs
It's a flatbed load, no tarping needed

Let me know if you need anything else.`,
    expectedClassification: 'not_load',
    expectedConfidence: 'high',
    notes: 'Response to clarification request, should be handled differently'
  },

  // === INDUSTRY-SPECIFIC PATTERNS ===
  {
    id: 'industry-1',
    category: 'LTL Request',
    subject: 'Small shipment - 8 pallets',
    from: 'warehouse@distributor.com',
    content: `We have a smaller shipment that doesn't need a full truck:

From: Seattle, WA 98101
To: Portland, OR 97201
Freight: 8 pallets, 4,000 lbs total
Class: 70
Liftgate needed at delivery
Residential delivery address

Can you arrange LTL service for this?`,
    expectedClassification: 'load',
    expectedConfidence: 'high',
    notes: 'LTL shipment with freight class and accessorials'
  },

  {
    id: 'industry-2',
    category: 'Hazmat Load',
    subject: 'Hazmat shipment - UN1993',
    from: 'hazmat@chemical.com',
    content: `HAZMAT LOAD TENDER

Origin: Newark, NJ 07102
Destination: Philadelphia, PA 19019
Product: Flammable Liquid, N.O.S. (Contains Acetone)
UN Number: UN1993
Class: 3
Packing Group: II
Weight: 40,000 lbs
Placards required: Yes
Emergency contact: 800-424-9300

Need hazmat certified carrier. Pickup tomorrow morning.`,
    expectedClassification: 'load',
    expectedConfidence: 'high',
    notes: 'Hazmat load with all required regulatory information'
  },

  {
    id: 'industry-3',
    category: 'Team Driver Request',
    subject: 'Expedited - Need team drivers',
    from: 'expedite@shipper.com',
    content: `URGENT - EXPEDITED LOAD

This needs to run straight through with team drivers:

Los Angeles, CA to New York, NY
45,000 lbs
Dry van
Must deliver within 48 hours
No stops except fuel

Paying premium rate for team service. Need confirmation ASAP.`,
    expectedClassification: 'load',
    expectedConfidence: 'high',
    notes: 'Expedited load requiring team drivers'
  },

  // === POTENTIAL FALSE POSITIVES ===
  {
    id: 'false-pos-1',
    category: 'Market Update',
    subject: 'Freight market update - Chicago to Dallas rates',
    from: 'newsletter@freightwave.com',
    content: `This week's market update:

Chicago to Dallas dry van rates are up 15% compared to last month. Current average:
- Spot rate: $2.45/mile
- Contract rate: $2.15/mile  
- Typical weight: 40,000 lbs

Fuel surcharge averaging $0.45/mile in this lane.

Expect rates to continue rising through peak season.`,
    expectedClassification: 'not_load',
    expectedConfidence: 'high',
    notes: 'Market report mentioning lanes and rates, not actual load'
  },

  {
    id: 'false-pos-2',
    category: 'Training Material',
    subject: 'Example load for training',
    from: 'trainer@brokeragecompany.com',
    content: `Team,

Here's an example of a typical load request for training purposes:

"Customer needs 35,000 lbs moved from Atlanta, GA 30301 to Miami, FL 33101. Dry van equipment, pickup on Monday."

When you receive requests like this, always verify the pickup time and any special requirements.

- Training Department`,
    expectedClassification: 'not_load',
    expectedConfidence: 'high',
    notes: 'Training example that looks like a load request'
  },

  {
    id: 'false-pos-3',
    category: 'Capacity Inquiry',
    subject: 'Do you have trucks in Texas?',
    from: 'planner@logistics.com',
    content: `Hi,

We're planning for next month and wondering if you typically have capacity for:
- Dallas to Houston runs
- 2-3 loads per week
- 40,000-45,000 lbs each
- Dry van equipment

Not booking anything yet, just checking availability for planning purposes.`,
    expectedClassification: 'not_load',
    expectedConfidence: 'high',
    notes: 'Capacity inquiry for future planning, not current load'
  }
]

// Test runner function
async function runEmailClassificationTests() {
  console.log('🚀 Starting Email Classification Testing')
  console.log('=====================================\n')

  const agent = new IntakeAgentLLMEnhanced()
  const results: any[] = []

  // Track statistics
  let correctClassifications = 0
  let totalTests = 0
  const categoryStats: Record<string, { correct: number; total: number }> = {}

  for (const testEmail of testEmails) {
    console.log(`\nTesting: ${testEmail.id} (${testEmail.category})`)
    console.log(`Subject: "${testEmail.subject}"`)
    
    try {
      // Process the email
      const result = await agent.processEmail({
        from: testEmail.from,
        to: 'broker@company.com',
        subject: testEmail.subject,
        content: testEmail.content,
        brokerId: 'test-broker-id'
      })

      // Determine if classification was correct
      const isLoadRequest = result.action !== 'ignore'
      const expectedIsLoad = testEmail.expectedClassification === 'load'
      const correct = isLoadRequest === expectedIsLoad

      // Update statistics
      totalTests++
      if (correct) correctClassifications++
      
      if (!categoryStats[testEmail.category]) {
        categoryStats[testEmail.category] = { correct: 0, total: 0 }
      }
      categoryStats[testEmail.category].total++
      if (correct) categoryStats[testEmail.category].correct++

      // Store result
      const testResult = {
        id: testEmail.id,
        category: testEmail.category,
        expected: testEmail.expectedClassification,
        actual: isLoadRequest ? 'load' : 'not_load',
        correct: correct,
        confidence: result.confidence,
        action: result.action,
        reason: result.reason,
        extractedData: result.extracted_data,
        missingFields: result.missing_fields,
        notes: testEmail.notes
      }
      results.push(testResult)

      // Log result
      console.log(`Result: ${correct ? '✅' : '❌'} ${testResult.actual} (confidence: ${result.confidence}%)`)
      if (!correct) {
        console.log(`⚠️  MISCLASSIFICATION: Expected ${testEmail.expectedClassification}`)
        console.log(`   Reason: ${result.reason || 'No reason provided'}`)
      }
      
      if (result.extracted_data) {
        console.log(`   Extracted: ${JSON.stringify(result.extracted_data, null, 2).substring(0, 100)}...`)
      }

    } catch (error) {
      console.error(`❌ Error processing ${testEmail.id}:`, error)
      results.push({
        id: testEmail.id,
        category: testEmail.category,
        error: error.message,
        correct: false
      })
    }

    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // Generate report
  console.log('\n\n📊 TEST RESULTS SUMMARY')
  console.log('======================')
  console.log(`Total Tests: ${totalTests}`)
  console.log(`Correct Classifications: ${correctClassifications} (${(correctClassifications/totalTests*100).toFixed(1)}%)`)
  console.log(`Misclassifications: ${totalTests - correctClassifications}`)

  console.log('\n📈 Results by Category:')
  for (const [category, stats] of Object.entries(categoryStats)) {
    const accuracy = (stats.correct / stats.total * 100).toFixed(1)
    console.log(`   ${category}: ${stats.correct}/${stats.total} (${accuracy}%)`)
  }

  console.log('\n❌ Misclassifications:')
  const misclassified = results.filter(r => !r.correct && !r.error)
  for (const result of misclassified) {
    console.log(`   ${result.id}: Expected ${result.expected}, got ${result.actual}`)
    console.log(`      Notes: ${result.notes}`)
  }

  // Save detailed results
  const timestamp = new Date().toISOString().replace(/:/g, '-')
  const reportPath = path.join(process.cwd(), `test-results-${timestamp}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2))
  console.log(`\n📄 Detailed results saved to: ${reportPath}`)

  return { results, correctClassifications, totalTests }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runEmailClassificationTests().catch(console.error)
}

export { runEmailClassificationTests, testEmails }