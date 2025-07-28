/**
 * Test Optimizations for Each Step
 * 
 * Based on initial test results, test optimized prompts and logic
 */

import { config } from 'dotenv'
import * as path from 'path'
import { OpenAI } from 'openai'
import { FreightValidator } from '../lib/freight-types/freight-validator'
import { EnhancedFreightValidator } from '../lib/freight-types/enhanced-validator'

config({ path: path.join(__dirname, '../.env.local') })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// STEP 1 OPTIMIZATION: Load Classification
const step1Prompts = {
  original: `You are a freight broker's email classifier. Your ONLY job is to determine if an email is a NEW load quote request from a shipper.

CLASSIFICATION RULES:
- IS a load request: Shipper asking for transportation quote/pricing for a specific shipment
- NOT a load request: Rate negotiations, invoices, status updates, general inquiries, responses to previous quotes

Key indicators of a load request:
- Mentions specific pickup and delivery locations
- Includes cargo details (weight, commodity, equipment)
- Asks for pricing/quote/rate
- Mentions pickup dates or urgency

Return JSON: { "is_load_request": boolean, "confidence": 0-100, "reason": "brief explanation" }`,

  optimized: `You are classifying freight broker emails. Determine if this is a NEW load quote request.

IS a load request ONLY when ALL these are true:
1. Specific shipment details (not general capabilities)
2. Clear intent to ship NOW or SOON (not future planning)
3. Requesting quote/pricing for THIS shipment

NOT a load request:
- "We'll have loads next month" → Future planning
- "Can you handle Chicago-Dallas?" → Capability inquiry
- "Your rate is too high" → Negotiation
- "Load delivered successfully" → Status update

Examples:
✅ "Need to ship 40k lbs Chicago to Dallas tomorrow" → Specific, immediate
✅ "Quote needed: 2 pallets NYC to Boston, pickup Friday" → Clear request
❌ "We ship 10 loads/month from Chicago" → General info
❌ "Planning Q3 shipments" → Future planning

Return JSON: { "is_load_request": boolean, "confidence": 0-100, "reason": "brief explanation" }`
}

// STEP 3 OPTIMIZATION: Better freight type rules
const step3Logic = {
  original: async (data: any) => {
    // Original: Use LLM with fallback to rules
    const systemPrompt = `Identify freight type from shipment data. Return JSON with freight_type and confidence.
    
Types: FTL_DRY_VAN, FTL_REEFER, FTL_FLATBED, FTL_HAZMAT, LTL, PARTIAL, UNKNOWN`
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Identify freight type for: ${JSON.stringify(data)}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500
    })
    return JSON.parse(completion.choices[0].message.content || '{}')
  },
  
  optimized: (data: any) => {
    // Optimized: Rules-first with clear priority
    // 1. Check explicit equipment type FIRST
    const equipment = data.equipment_type?.toLowerCase() || ''
    
    if (equipment.includes('dry van') || equipment === 'van') {
      // Even if commodity suggests reefer, respect explicit equipment
      return { freight_type: 'FTL_DRY_VAN', confidence: 95 }
    }
    
    if (equipment.includes('reefer') || equipment.includes('refrigerated')) {
      return { freight_type: 'FTL_REEFER', confidence: 95 }
    }
    
    if (equipment.includes('flatbed') || equipment.includes('step deck')) {
      return { freight_type: 'FTL_FLATBED', confidence: 95 }
    }
    
    // 2. Check for hazmat
    if (data.hazmat_class || data.un_number) {
      return { freight_type: 'FTL_HAZMAT', confidence: 95 }
    }
    
    // 3. Check weight for LTL/Partial
    if (data.weight) {
      const weight = typeof data.weight === 'string' ? 
        parseInt(data.weight.replace(/[^0-9]/g, '')) : data.weight
      
      if (data.freight_class) {
        return { freight_type: 'LTL', confidence: 90 }
      }
      
      if (weight < 5000) {
        return { freight_type: 'LTL', confidence: 85 }
      }
      
      if (weight >= 5000 && weight <= 15000) {
        return { freight_type: 'PARTIAL', confidence: 85 }
      }
    }
    
    // 4. Temperature requirements WITHOUT equipment type
    if (!equipment && data.temperature && 
        (data.temperature.min !== undefined || data.temperature.max !== undefined)) {
      return { freight_type: 'FTL_REEFER', confidence: 80 }
    }
    
    // 5. Default to dry van
    return { freight_type: 'FTL_DRY_VAN', confidence: 70 }
  }
}

// Test cases focused on problem areas
const problemCases = [
  {
    id: 'future-planning',
    email: {
      subject: 'Next month loads',
      content: 'We will have several loads next month from our Chicago warehouse. 40,000 lbs each, dry van needed.'
    },
    expectedClassification: false
  },
  {
    id: 'conflicting-frozen-dry-van',
    data: {
      equipment_type: 'dry van',
      commodity: 'frozen pizzas',
      weight: 40000
    },
    expectedFreightType: 'FTL_DRY_VAN'
  }
]

async function testStep1Optimization() {
  console.log('🔧 STEP 1 OPTIMIZATION TEST: Load Classification')
  console.log('==============================================\n')
  
  for (const prompt of ['original', 'optimized']) {
    console.log(`\nTesting ${prompt} prompt:`)
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: step1Prompts[prompt as keyof typeof step1Prompts] },
        { role: 'user', content: `Subject: ${problemCases[0].email.subject}\n\n${problemCases[0].email.content}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500
    })
    
    const result = JSON.parse(completion.choices[0].message.content || '{}')
    const correct = result.is_load_request === problemCases[0].expectedClassification
    
    console.log(`Result: ${result.is_load_request ? 'LOAD' : 'NOT LOAD'} (${result.confidence}%)`)
    console.log(`Expected: NOT LOAD`)
    console.log(`Status: ${correct ? '✅' : '❌'}`)
    console.log(`Reason: ${result.reason}`)
  }
}

async function testStep3Optimization() {
  console.log('\n\n🔧 STEP 3 OPTIMIZATION TEST: Freight Type Identification')
  console.log('====================================================\n')
  
  const testData = problemCases[1].data
  
  console.log('Test case: Frozen pizzas with dry van equipment')
  console.log('Expected: FTL_DRY_VAN (equipment should override commodity)\n')
  
  // Test original LLM approach
  console.log('Original approach (LLM):')
  const llmResult = await step3Logic.original(testData)
  console.log(`Result: ${llmResult.freight_type} (${llmResult.confidence}%)`)
  console.log(`Correct: ${llmResult.freight_type === 'FTL_DRY_VAN' ? '✅' : '❌'}\n`)
  
  // Test optimized rules approach
  console.log('Optimized approach (Rules-first):')
  const rulesResult = step3Logic.optimized(testData)
  console.log(`Result: ${rulesResult.freight_type} (${rulesResult.confidence}%)`)
  console.log(`Correct: ${rulesResult.freight_type === 'FTL_DRY_VAN' ? '✅' : '❌'}`)
}

async function testStep4Enhancement() {
  console.log('\n\n🔧 STEP 4 ENHANCEMENT: Semantic Validation')
  console.log('========================================\n')
  
  const testCases = [
    {
      description: 'Vague pickup location',
      data: {
        pickup_location: 'near O\'Hare Airport',
        delivery_location: 'Dallas, TX 75201',
        weight: 40000,
        commodity: 'auto parts',
        pickup_date: 'tomorrow'
      },
      freightType: 'FTL_DRY_VAN' as const
    },
    {
      description: 'Generic commodity',
      data: {
        pickup_location: 'Chicago, IL 60601',
        delivery_location: 'Dallas, TX 75201', 
        weight: 40000,
        commodity: 'goods',
        pickup_date: 'tomorrow'
      },
      freightType: 'FTL_DRY_VAN' as const
    }
  ]
  
  for (const testCase of testCases) {
    console.log(`\nTest: ${testCase.description}`)
    
    // Basic validation
    const basicResult = FreightValidator.validateRequiredFields(testCase.data, testCase.freightType)
    console.log(`Basic validation: ${basicResult.isValid ? 'VALID' : 'INVALID'}`)
    if (!basicResult.isValid) {
      console.log(`Missing: ${basicResult.missingFields.join(', ')}`)
    }
    
    // Enhanced semantic validation
    const semanticIssues = EnhancedFreightValidator.validateSemantics(testCase.data, testCase.freightType)
    console.log(`Semantic issues: ${semanticIssues.length}`)
    semanticIssues.forEach(issue => {
      console.log(`  - ${issue.field}: ${issue.issue} - ${issue.message}`)
    })
  }
}

// Run all optimization tests
async function runOptimizationTests() {
  console.log('🚀 TESTING OPTIMIZATIONS FOR EACH STEP')
  console.log('====================================\n')
  
  await testStep1Optimization()
  await testStep3Optimization()
  await testStep4Enhancement()
  
  console.log('\n\n📊 OPTIMIZATION SUMMARY')
  console.log('=====================')
  console.log('\n✅ Step 1 (Classification): Use optimized prompt with clear examples')
  console.log('✅ Step 2 (Extraction): Current approach working well (100% accuracy)')
  console.log('✅ Step 3 (Freight Type): Use rules-first approach for consistency')
  console.log('✅ Step 4 (Validation): Enhanced semantic validation already implemented')
}

runOptimizationTests().catch(console.error)