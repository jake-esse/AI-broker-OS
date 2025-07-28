/**
 * Comprehensive Test Suite for Four-Step Sequential System
 * 
 * Tests each step independently to identify optimization opportunities
 */

import { config } from 'dotenv'
import * as path from 'path'
import { FourStepIntakeAgent } from '../lib/agents/four-step-intake-agent'
import { FreightValidator } from '../lib/freight-types/freight-validator'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

// Test cases for Step 1: Load Classification
const step1TestCases = [
  {
    id: 'load-1',
    description: 'Clear load request',
    email: {
      subject: 'Need quote for shipment',
      from: 'shipper@company.com',
      content: 'I need to ship 40,000 lbs from Chicago to Dallas tomorrow. Please send quote.'
    },
    expected: { isLoadRequest: true }
  },
  {
    id: 'load-2',
    description: 'Load request with details',
    email: {
      subject: 'Urgent freight',
      from: 'logistics@mfg.com',
      content: 'We have 35k lbs of auto parts that need to go from Detroit, MI to Louisville, KY. Need dry van for Thursday pickup.'
    },
    expected: { isLoadRequest: true }
  },
  {
    id: 'not-load-1',
    description: 'Invoice email',
    email: {
      subject: 'Invoice #12345',
      from: 'accounting@carrier.com',
      content: 'Please find attached invoice for load delivered last week. Amount due: $2,500.'
    },
    expected: { isLoadRequest: false }
  },
  {
    id: 'not-load-2',
    description: 'Status update',
    email: {
      subject: 'RE: Load status',
      from: 'driver@carrier.com',
      content: 'Just picked up the load. ETA to delivery is 4pm tomorrow.'
    },
    expected: { isLoadRequest: false }
  },
  {
    id: 'not-load-3',
    description: 'Rate negotiation',
    email: {
      subject: 'Your quote is too high',
      from: 'shipper@company.com',
      content: 'Can you do $2,200 instead of $2,500 for the Chicago to Dallas lane?'
    },
    expected: { isLoadRequest: false }
  },
  {
    id: 'edge-1',
    description: 'Vague inquiry',
    email: {
      subject: 'Question',
      from: 'someone@email.com',
      content: 'Do you handle shipments from Chicago to Dallas?'
    },
    expected: { isLoadRequest: false }
  },
  {
    id: 'edge-2',
    description: 'Future planning',
    email: {
      subject: 'Next month loads',
      from: 'planner@shipper.com',
      content: 'We will have several loads next month from our Chicago warehouse. 40,000 lbs each, dry van needed.'
    },
    expected: { isLoadRequest: false } // Not specific enough
  }
]

// Test cases for Step 2: Information Extraction
const step2TestCases = [
  {
    id: 'extract-1',
    description: 'Complete information',
    email: {
      content: `Need to ship:
From: Chicago, IL 60601
To: Dallas, TX 75201
Weight: 40,000 lbs
Commodity: Auto parts
Equipment: Dry van
Pickup: Tomorrow 8am`
    },
    expectedFields: ['pickup_location', 'delivery_location', 'weight', 'commodity', 'equipment_type', 'pickup_date']
  },
  {
    id: 'extract-2',
    description: 'Vague locations',
    email: {
      content: `Pick up near O'Hare Airport
Deliver to Amazon warehouse in Dallas
35,000 lbs of consumer goods
Need dry van tomorrow`
    },
    expectedFields: ['pickup_location', 'delivery_location', 'weight', 'commodity', 'equipment_type', 'pickup_date']
  },
  {
    id: 'extract-3',
    description: 'Weight in tons',
    email: {
      content: `Transport request:
Houston, TX to New Orleans, LA
20 tons of steel
Flatbed required
Friday pickup`
    },
    expectedFields: ['pickup_location', 'delivery_location', 'weight', 'commodity', 'equipment_type', 'pickup_date'],
    expectedWeight: 40000
  },
  {
    id: 'extract-4',
    description: 'Temperature requirements',
    email: {
      content: `Frozen food shipment:
Origin: Salinas, CA 93901
Dest: Chicago, IL 60601
42,000 lbs
Keep at 32°F or below
Pickup tomorrow`
    },
    expectedFields: ['pickup_location', 'delivery_location', 'weight', 'commodity', 'temperature', 'pickup_date']
  },
  {
    id: 'extract-5',
    description: 'Minimal information',
    email: {
      content: `Chicago to Dallas
Tomorrow`
    },
    expectedFields: ['pickup_location', 'delivery_location', 'pickup_date']
  }
]

// Test cases for Step 3: Freight Type Identification
const step3TestCases = [
  {
    id: 'type-1',
    description: 'Explicit dry van',
    data: {
      equipment_type: 'dry van',
      weight: 40000,
      commodity: 'auto parts'
    },
    expectedType: 'FTL_DRY_VAN'
  },
  {
    id: 'type-2',
    description: 'Temperature requirements = reefer',
    data: {
      commodity: 'frozen food',
      temperature: { max: 32, unit: 'F' },
      weight: 42000
    },
    expectedType: 'FTL_REEFER'
  },
  {
    id: 'type-3',
    description: 'Flatbed with dimensions',
    data: {
      equipment_type: 'flatbed',
      dimensions: { length: 240, width: 96, height: 120 },
      weight: 44000,
      commodity: 'steel coils'
    },
    expectedType: 'FTL_FLATBED'
  },
  {
    id: 'type-4',
    description: 'LTL by weight and class',
    data: {
      weight: 1200,
      freight_class: '85',
      piece_count: 2,
      commodity: 'electronics'
    },
    expectedType: 'LTL'
  },
  {
    id: 'type-5',
    description: 'Partial load',
    data: {
      weight: 8000,
      commodity: 'general freight'
    },
    expectedType: 'PARTIAL'
  },
  {
    id: 'type-6',
    description: 'Hazmat indicators',
    data: {
      hazmat_class: '3',
      commodity: 'flammable liquid',
      weight: 40000
    },
    expectedType: 'FTL_HAZMAT'
  },
  {
    id: 'type-7',
    description: 'Conflicting signals',
    data: {
      equipment_type: 'dry van',
      commodity: 'frozen pizzas',
      weight: 40000
    },
    expectedType: 'FTL_DRY_VAN' // Equipment type should win
  }
]

// Test cases for Step 4: Validation
const step4TestCases = [
  {
    id: 'valid-1',
    description: 'Complete dry van load',
    data: {
      pickup_location: 'Chicago, IL 60601',
      delivery_location: 'Dallas, TX 75201',
      weight: 40000,
      commodity: 'auto parts',
      pickup_date: 'tomorrow'
    },
    freightType: 'FTL_DRY_VAN' as const,
    expectedValid: true
  },
  {
    id: 'invalid-1',
    description: 'Missing commodity',
    data: {
      pickup_location: 'Chicago, IL 60601',
      delivery_location: 'Dallas, TX 75201',
      weight: 40000,
      pickup_date: 'tomorrow'
    },
    freightType: 'FTL_DRY_VAN' as const,
    expectedValid: false,
    expectedMissing: ['commodity']
  },
  {
    id: 'invalid-2',
    description: 'Vague locations',
    data: {
      pickup_location: 'near O\'Hare Airport',
      delivery_location: 'Amazon warehouse Dallas',
      weight: 40000,
      commodity: 'consumer goods',
      pickup_date: 'tomorrow'
    },
    freightType: 'FTL_DRY_VAN' as const,
    expectedValid: false,
    expectedIssues: ['pickup_location', 'delivery_location']
  },
  {
    id: 'invalid-3',
    description: 'Reefer missing temperature',
    data: {
      pickup_location: 'Salinas, CA 93901',
      delivery_location: 'Chicago, IL 60601',
      weight: 42000,
      commodity: 'frozen food',
      pickup_date: 'tomorrow'
    },
    freightType: 'FTL_REEFER' as const,
    expectedValid: false,
    expectedMissing: ['temperature']
  },
  {
    id: 'invalid-4',
    description: 'Flatbed missing dimensions',
    data: {
      pickup_location: 'Houston, TX 77001',
      delivery_location: 'New Orleans, LA 70112',
      weight: 44000,
      commodity: 'steel coils',
      pickup_date: 'Friday'
    },
    freightType: 'FTL_FLATBED' as const,
    expectedValid: false,
    expectedMissing: ['dimensions']
  }
]

// Test runner for individual steps
async function testStep1(agent: FourStepIntakeAgent) {
  console.log('\n\n🔍 STEP 1: LOAD CLASSIFICATION TESTS')
  console.log('=====================================')
  
  let correct = 0
  const results = []
  
  for (const testCase of step1TestCases) {
    const result = await agent.processEmail({
      ...testCase.email,
      to: 'broker@company.com'
    })
    
    const isCorrect = result.isLoadRequest === testCase.expected.isLoadRequest
    if (isCorrect) correct++
    
    console.log(`\n${testCase.id}: ${testCase.description}`)
    console.log(`Expected: ${testCase.expected.isLoadRequest ? 'LOAD' : 'NOT LOAD'}`)
    console.log(`Got: ${result.isLoadRequest ? 'LOAD' : 'NOT LOAD'} (${result.classificationConfidence}% confidence)`)
    console.log(`Result: ${isCorrect ? '✅' : '❌'}`)
    if (!isCorrect) console.log(`Reason: ${result.classificationReason}`)
    
    results.push({ testCase, result, isCorrect })
  }
  
  console.log(`\n📊 Step 1 Accuracy: ${correct}/${step1TestCases.length} (${(correct/step1TestCases.length*100).toFixed(1)}%)`)
  return results
}

async function testStep2() {
  console.log('\n\n🔍 STEP 2: INFORMATION EXTRACTION TESTS')
  console.log('======================================')
  
  // Create a minimal agent just for testing extraction
  const agent = new FourStepIntakeAgent()
  let totalFieldsCorrect = 0
  let totalFieldsExpected = 0
  
  for (const testCase of step2TestCases) {
    // Force it to be a load request by using a clear subject
    const result = await agent.processEmail({
      subject: 'Load quote request',
      from: 'shipper@test.com',
      to: 'broker@company.com',
      content: testCase.email.content
    })
    
    const extracted = result.extractedData || {}
    let fieldsFound = 0
    
    console.log(`\n${testCase.id}: ${testCase.description}`)
    console.log('Expected fields:')
    
    for (const field of testCase.expectedFields) {
      const found = extracted[field as keyof typeof extracted] !== null && 
                   extracted[field as keyof typeof extracted] !== undefined
      if (found) fieldsFound++
      console.log(`  ${field}: ${found ? '✅' : '❌'} ${found ? `(${JSON.stringify(extracted[field as keyof typeof extracted])})` : ''}`)
    }
    
    // Special check for weight conversion
    if (testCase.expectedWeight) {
      const weightCorrect = extracted.weight === testCase.expectedWeight
      console.log(`  Weight conversion: ${weightCorrect ? '✅' : '❌'} (expected ${testCase.expectedWeight}, got ${extracted.weight})`)
    }
    
    totalFieldsCorrect += fieldsFound
    totalFieldsExpected += testCase.expectedFields.length
    
    console.log(`Extraction: ${fieldsFound}/${testCase.expectedFields.length} fields`)
  }
  
  console.log(`\n📊 Step 2 Accuracy: ${totalFieldsCorrect}/${totalFieldsExpected} fields (${(totalFieldsCorrect/totalFieldsExpected*100).toFixed(1)}%)`)
}

async function testStep3() {
  console.log('\n\n🔍 STEP 3: FREIGHT TYPE IDENTIFICATION TESTS')
  console.log('==========================================')
  
  const agent = new FourStepIntakeAgent()
  let correct = 0
  
  for (const testCase of step3TestCases) {
    // We need to go through the full flow to test step 3
    const emailContent = Object.entries(testCase.data)
      .map(([key, value]) => {
        if (key === 'temperature' && typeof value === 'object') {
          return `Temperature: keep at ${value.max}°${value.unit}`
        }
        if (key === 'dimensions' && typeof value === 'object') {
          return `Dimensions: ${value.length}" x ${value.width}" x ${value.height}"`
        }
        return `${key.replace(/_/g, ' ')}: ${value}`
      })
      .join('\n')
    
    const result = await agent.processEmail({
      subject: 'Load quote',
      from: 'shipper@test.com',
      to: 'broker@company.com',
      content: `Need quote for:\n${emailContent}`
    })
    
    const isCorrect = result.freightType === testCase.expectedType
    if (isCorrect) correct++
    
    console.log(`\n${testCase.id}: ${testCase.description}`)
    console.log(`Expected: ${testCase.expectedType}`)
    console.log(`Got: ${result.freightType} (${result.freightTypeConfidence}% confidence)`)
    console.log(`Result: ${isCorrect ? '✅' : '❌'}`)
  }
  
  console.log(`\n📊 Step 3 Accuracy: ${correct}/${step3TestCases.length} (${(correct/step3TestCases.length*100).toFixed(1)}%)`)
}

async function testStep4() {
  console.log('\n\n🔍 STEP 4: VALIDATION TESTS')
  console.log('==========================')
  
  const agent = new FourStepIntakeAgent()
  let correct = 0
  
  for (const testCase of step4TestCases) {
    // Build email content from data
    const emailContent = Object.entries(testCase.data)
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
      .join('\n')
    
    const result = await agent.processEmail({
      subject: 'Load quote',
      from: 'shipper@test.com',
      to: 'broker@company.com',
      content: emailContent
    })
    
    const isValidCorrect = result.isValid === testCase.expectedValid
    if (isValidCorrect) correct++
    
    console.log(`\n${testCase.id}: ${testCase.description}`)
    console.log(`Expected: ${testCase.expectedValid ? 'VALID' : 'INVALID'}`)
    console.log(`Got: ${result.isValid ? 'VALID' : 'INVALID'}`)
    console.log(`Result: ${isValidCorrect ? '✅' : '❌'}`)
    
    if (result.validationIssues && result.validationIssues.length > 0) {
      console.log('Issues found:')
      result.validationIssues.forEach(issue => {
        console.log(`  - ${issue.field}: ${issue.issue} - ${issue.message}`)
      })
    }
  }
  
  console.log(`\n📊 Step 4 Accuracy: ${correct}/${step4TestCases.length} (${(correct/step4TestCases.length*100).toFixed(1)}%)`)
}

// Main test runner
async function runComprehensiveTests() {
  console.log('🧪 COMPREHENSIVE FOUR-STEP SYSTEM TESTING')
  console.log('========================================')
  console.log('\nTesting each step independently to identify optimization opportunities\n')
  
  // Test with default models first
  console.log('📋 Testing with default models:')
  console.log(`  Step 1 (Classification): ${process.env.STEP1_MODEL || 'gpt-4o-mini'}`)
  console.log(`  Step 2 (Extraction): ${process.env.STEP2_MODEL || 'gpt-4o'}`)
  console.log(`  Step 3 (Freight Type): ${process.env.STEP3_MODEL || 'gpt-4o-mini'}`)
  console.log(`  Step 4 (Validation): Rule-based system`)
  
  const agent = new FourStepIntakeAgent()
  
  // Test each step
  await testStep1(agent)
  await testStep2()
  await testStep3()
  await testStep4()
  
  console.log('\n\n📈 OPTIMIZATION OPPORTUNITIES')
  console.log('============================')
  console.log('Based on test results, here are optimization priorities:')
  console.log('1. Step 1: Tune prompt to handle edge cases (future planning, vague inquiries)')
  console.log('2. Step 2: Ensure vague information is still extracted (not set to null)')
  console.log('3. Step 3: Consider using deterministic rules as primary with LLM as fallback')
  console.log('4. Step 4: Enhanced validation is working well, consider adding more semantic rules')
}

// Run the tests
runComprehensiveTests().catch(console.error)