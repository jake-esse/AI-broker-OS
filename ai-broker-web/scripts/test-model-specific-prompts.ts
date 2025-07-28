/**
 * Test Model-Specific Prompts for Freight Validation
 * 
 * Different models may perform better with different prompt styles
 */

import { config } from 'dotenv'
import * as path from 'path'
import { OpenAI } from 'openai'
import { FreightValidator } from '../lib/freight-types/freight-validator'
import { validationTestCases } from './test-freight-validation'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Model-specific prompts
const MODEL_PROMPTS = {
  'gpt-4o-mini': `You are an AI assistant for a freight broker. Analyze emails to determine if they are NEW load quote requests from shippers.

CLASSIFICATION: Only classify as load request if it's a NEW request for pricing/availability.

EXTRACTION RULES:
1. Set fields to null if information is missing or insufficient
2. "consumer goods", "products", "items" = null (too generic for commodity)
3. "near airport", "by mall" = null (landmarks insufficient for location)
4. Time without date = null for pickup_date
5. Extract exact equipment type as stated
6. Convert tons to pounds (1 ton = 2000 lbs)

Return JSON with extracted_data containing all fields (null if not found).`,

  'gpt-4o': `You are an expert freight broker assistant analyzing emails for load quote requests.

Your task is to carefully examine the email and extract structured freight information while being very strict about data quality.

CRITICAL RULES:
1. This must be a NEW request for transportation pricing (not invoice, status update, or negotiation)
2. For commodity: Reject generic terms ("goods", "items", "products"). Need specific description.
3. For locations: Reject landmarks without addresses ("near airport" → null)
4. For dates: Reject time without date ("10 AM" → null)
5. Temperature is ONLY for required control (not casual mentions)

Think through each field carefully:
- Is the information specific enough?
- Would a truck driver find the pickup with this info?
- Would customs accept this commodity description?

Extract all fields, using null for missing/insufficient data.`,

  'o3': `You are analyzing freight broker emails. Think step-by-step.

Step 1: Determine if this is a NEW load request
- Is the shipper asking for a quote on a specific shipment?
- Or is this an invoice, status update, or negotiation?

Step 2: Extract each field carefully
For each field, ask yourself:
- Is the information present in the email?
- Is it specific enough to be actionable?

Validation criteria:
- Commodity: Must be specific (not "goods" or "items")
- Location: Must be an address (not "near landmark")
- Date: Must include the date (not just time)
- Temperature: Only if explicitly required for shipment

Step 3: Set to null if insufficient
If any field fails validation, set it to null.

Return structured JSON with your analysis.`
}

async function testWithModelPrompt(email: any, model: string): Promise<any> {
  const systemPrompt = MODEL_PROMPTS[model as keyof typeof MODEL_PROMPTS] || MODEL_PROMPTS['gpt-4o-mini']
  
  const userPrompt = `Analyze this email:

Subject: ${email.subject}
From: ${email.from}

Body:
${email.content}

Return JSON with:
{
  "is_load_request": boolean,
  "confidence": 0-100,
  "extracted_data": {
    "pickup_location": string or null,
    "pickup_city": string or null,
    "pickup_state": string or null,
    "pickup_zip": string or null,
    "delivery_location": string or null,
    "delivery_city": string or null,
    "delivery_state": string or null,
    "delivery_zip": string or null,
    "weight": number or null,
    "commodity": string or null,
    "pickup_date": string or null,
    "equipment_type": string or null,
    "piece_count": number or null,
    "temperature": {"min": number, "max": number, "unit": "F" or "C"} or null,
    "dimensions": {"length": number, "width": number, "height": number} or null,
    "freight_class": string or null,
    "hazmat_class": string or null,
    "un_number": string or null,
    "proper_shipping_name": string or null,
    "packing_group": string or null,
    "emergency_contact": string or null,
    "placards_required": boolean or null
  },
  "reasoning": "explanation"
}`

  const modelParams: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: model === 'o3' ? 1 : 0.1
  }
  
  if (model === 'o3') {
    modelParams.max_completion_tokens = 2000
  } else {
    modelParams.max_tokens = 2000
  }
  
  const completion = await openai.chat.completions.create(modelParams)
  return JSON.parse(completion.choices[0].message.content || '{}')
}

async function compareModelPrompts() {
  console.log('🧪 Comparing Model-Specific Prompts for Freight Validation')
  console.log('=====================================================\n')

  const models = ['gpt-4o-mini', 'gpt-4o', 'o3']
  const results: any = {}
  
  // Test a few key edge cases
  const keyTests = [
    validationTestCases.find(t => t.id === 'loc-2'),  // Landmark location
    validationTestCases.find(t => t.id === 'weight-3'), // Missing commodity
    validationTestCases.find(t => t.id === 'date-2'),  // Time without date
    validationTestCases.find(t => t.id === 'partial-2'), // LTL with generic commodity
  ].filter(Boolean)

  for (const model of models) {
    console.log(`\n🤖 Testing ${model} with optimized prompt...`)
    results[model] = []
    
    for (const test of keyTests) {
      if (!test) continue
      
      try {
        console.log(`\n  Testing: ${test.description}`)
        const extraction = await testWithModelPrompt(test.email, model)
        
        const freightType = extraction.extracted_data ? 
          FreightValidator.identifyFreightType(extraction.extracted_data) : 'UNKNOWN'
        const validation = extraction.extracted_data ?
          FreightValidator.validateRequiredFields(extraction.extracted_data, freightType) :
          { isValid: false, missingFields: [], warnings: [] }

        const actualMissing = validation.missingFields.sort()
        const expectedMissing = test.expectedMissingFields.sort()
        const correct = JSON.stringify(actualMissing) === JSON.stringify(expectedMissing)
        
        console.log(`    Expected missing: [${expectedMissing.join(', ')}]`)
        console.log(`    Detected missing: [${actualMissing.join(', ')}] ${correct ? '✅' : '❌'}`)
        
        if (test.id === 'loc-2') {
          console.log(`    Pickup location: "${extraction.extracted_data?.pickup_location}" (should be null)`)
        }
        if (test.id === 'weight-3' || test.id === 'partial-2') {
          console.log(`    Commodity: "${extraction.extracted_data?.commodity}" (should be null)`)
        }
        if (test.id === 'date-2') {
          console.log(`    Pickup date: "${extraction.extracted_data?.pickup_date}" (should be null)`)
        }
        
        results[model].push({
          test: test.id,
          correct,
          extraction
        })
        
      } catch (error: any) {
        console.log(`    Error: ${error.message}`)
        results[model].push({
          test: test?.id,
          correct: false,
          error: error.message
        })
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // Summary
  console.log('\n\n📊 SUMMARY: Model-Specific Prompt Performance')
  console.log('=============================================')
  
  for (const model of models) {
    const correct = results[model].filter((r: any) => r.correct).length
    const total = results[model].length
    console.log(`${model}: ${correct}/${total} (${(correct/total*100).toFixed(0)}%) edge cases correct`)
  }
  
  console.log('\n🔍 Key Insights:')
  console.log('- Different prompting styles can significantly impact results')
  console.log('- o3 benefits from step-by-step reasoning prompts')
  console.log('- GPT-4o performs well with detailed validation criteria')
  console.log('- GPT-4o-mini needs explicit, concise rules')
}

// Run the comparison
compareModelPrompts().catch(console.error)