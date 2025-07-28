/**
 * Focused Validation Testing - Extraction and Validation Only
 * 
 * Tests the extraction and validation logic without database operations
 */

import { config } from 'dotenv'
import * as path from 'path'
import { OpenAI } from 'openai'
import { FreightValidator, FreightType, LoadData } from '../lib/freight-types/freight-validator'
import { validationTestCases } from './test-freight-validation'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

async function extractLoadData(emailData: any): Promise<any> {
  const systemPrompt = `You are an AI assistant for a freight broker. Analyze emails to determine if they are NEW load quote requests from shippers needing transportation services.

CRITICAL CLASSIFICATION RULES:
1. ONLY classify as load request if it's a NEW request for pricing/availability
2. NOT a load request if:
   - Invoice or payment request for completed shipment
   - Carrier status update (pickup confirmation, in-transit, delivery)
   - Rate negotiation on existing quote
   - General capacity inquiry without specific load
   - Market update or newsletter
   - Training example or hypothetical scenario
   - Response to clarification request (these have special handling)
3. IS a load request if:
   - Shipper asking for quote on specific shipment
   - Contains origin/destination and asks for pricing
   - Forwarded email chain containing new load details
   - Mixed content but includes NEW load request

EXTRACTION RULES:
1. NEVER infer equipment type from commodity. If email says "dry van", it's dry van even if shipping frozen goods.
2. ONLY extract temperature requirements if explicitly stated as a REQUIREMENT (e.g., "keep at 32°F", "maintain below 40°F")
3. DO NOT extract temperature if it's just mentioned casually (e.g., "was in our 70°F warehouse", "normal room temperature")
4. DO NOT add temperature data just because commodity might need it
5. Extract from ALL parts of email including forwarded sections
6. For dimensions, only extract if actually provided. Do not set dimensions object if not mentioned.
7. For temperature, only create the temperature object if temperature control is REQUIRED. Do not extract casual mentions.

For each email, extract:

BASIC INFORMATION (always try to extract):
- pickup_location: Full location string
- pickup_city, pickup_state, pickup_zip: Parsed location components
- delivery_location: Full location string  
- delivery_city, delivery_state, delivery_zip: Parsed location components
- weight: Weight in pounds (convert from tons if needed: 1 ton = 2000 lbs)
- commodity: What is being shipped
- pickup_date: When pickup is needed
- equipment_type: Extract EXACTLY as mentioned (e.g., "dry van", "53' dry van", "reefer", "flatbed"). Do NOT infer or change.

DIMENSIONS (for flatbed, LTL, or when mentioned):
- dimensions.length: Length in inches
- dimensions.width: Width in inches  
- dimensions.height: Height in inches
- piece_count: Number of pieces/pallets

TEMPERATURE CONTROL (ONLY extract if temperature is explicitly mentioned):
- temperature.min: Minimum temperature (only if stated)
- temperature.max: Maximum temperature (only if stated)  
- temperature.unit: F or C (only if temperature is given)

HAZMAT INFORMATION (if dangerous goods mentioned):
- hazmat_class: Class 1-9
- un_number: UN#### format
- proper_shipping_name: Official hazmat name
- packing_group: I, II, or III
- emergency_contact: 24/7 emergency number
- placards_required: true/false

FLATBED SPECIFIC:
- tarping_required: true/false
- oversize_permits: true/false if dimensions exceed standard
- escort_required: true/false

LTL SPECIFIC:
- freight_class: NMFC class (50-500)
- packaging_type: Pallets, crates, etc.
- accessorials: Array of services like liftgate, inside delivery

Return JSON with:
{
  "is_load_request": boolean,
  "confidence": 0-100,
  "extracted_data": { all fields found },
  "reasoning": "explanation of classification decision"
}`

  const userPrompt = `Analyze this email:

Subject: ${emailData.subject}
From: ${emailData.from}

Body:
${emailData.content}`

  // Use enhanced model for testing if specified
  const extractionModel = process.env.EXTRACTION_LLM_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini'
  console.log(`Using model: ${extractionModel}`)
  
  // Handle different model requirements
  const modelParams: any = {
    model: extractionModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1
  }
  
  // o3 model has specific requirements
  if (extractionModel === 'o3') {
    modelParams.max_completion_tokens = 1500
    modelParams.temperature = 1  // o3 only supports temperature=1
  } else {
    modelParams.max_tokens = 1500
  }
  
  const completion = await openai.chat.completions.create(modelParams)

  const response = JSON.parse(completion.choices[0].message.content || '{}')
  return response
}

async function runValidationExtraction() {
  console.log('🧪 Testing Freight Validation - Extraction & Validation Only')
  console.log('========================================================\n')

  const results: any[] = []
  let correctFreightType = 0
  let correctMissingFields = 0
  let correctLoadClassification = 0

  for (const testCase of validationTestCases) {
    console.log(`\n📧 Test ${testCase.id}: ${testCase.description}`)
    console.log(`   Category: ${testCase.category}`)
    console.log(`   Expected: ${testCase.expectedFreightType}, Missing: [${testCase.expectedMissingFields.join(', ')}]`)

    try {
      // Extract data
      const extraction = await extractLoadData(testCase.email)
      console.log(`   Extracted: ${extraction.is_load_request ? 'IS LOAD' : 'NOT LOAD'} (${extraction.confidence}%)`)
      
      if (!extraction.is_load_request) {
        console.log(`   Reasoning: ${extraction.reasoning}`)
        if (testCase.expectedAction === 'ignore') {
          console.log('   ✅ Correctly identified as not a load')
          correctLoadClassification++
        } else {
          console.log('   ❌ Should have been identified as a load request')
        }
        continue
      }

      correctLoadClassification++

      // Identify freight type
      const freightType = FreightValidator.identifyFreightType(extraction.extracted_data)
      console.log(`   Freight Type: ${freightType} ${freightType === testCase.expectedFreightType ? '✅' : '❌'}`)
      if (freightType === testCase.expectedFreightType) correctFreightType++

      // Validate required fields
      const validation = FreightValidator.validateRequiredFields(
        extraction.extracted_data,
        freightType
      )

      // Compare missing fields
      const actualMissing = validation.missingFields.sort()
      const expectedMissing = testCase.expectedMissingFields.sort()
      const missingMatch = JSON.stringify(actualMissing) === JSON.stringify(expectedMissing)
      
      console.log(`   Missing Fields: [${actualMissing.join(', ')}] ${missingMatch ? '✅' : '❌'}`)
      if (missingMatch) correctMissingFields++
      
      if (!missingMatch) {
        const extra = actualMissing.filter(f => !expectedMissing.includes(f))
        const missed = expectedMissing.filter(f => !actualMissing.includes(f))
        if (extra.length > 0) console.log(`     - Incorrectly flagged: ${extra.join(', ')}`)
        if (missed.length > 0) console.log(`     - Failed to identify: ${missed.join(', ')}`)
      }

      if (validation.warnings.length > 0) {
        console.log(`   ⚠️  Warnings: ${validation.warnings.join('; ')}`)
      }

      // Log extracted data for debugging
      if (testCase.category === 'Temperature Ambiguity') {
        console.log('   Temperature data:', JSON.stringify(extraction.extracted_data.temperature))
        console.log('   Equipment type:', extraction.extracted_data.equipment_type)
      }

      results.push({
        testCase,
        extraction,
        freightType,
        validation,
        correctFreightType: freightType === testCase.expectedFreightType,
        correctMissing: missingMatch
      })

    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`)
    }

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  // Summary
  const total = validationTestCases.length
  console.log('\n\n📊 VALIDATION TEST SUMMARY')
  console.log('=========================')
  console.log(`Total Tests: ${total}`)
  console.log(`Load Classification: ${correctLoadClassification}/${total} (${(correctLoadClassification/total*100).toFixed(1)}%)`)
  console.log(`Freight Type Identification: ${correctFreightType}/${total} (${(correctFreightType/total*100).toFixed(1)}%)`)
  console.log(`Missing Field Detection: ${correctMissingFields}/${total} (${(correctMissingFields/total*100).toFixed(1)}%)`)

  // Problem areas
  console.log('\n🔍 Key Issues Found:')
  const tempIssues = results.filter(r => 
    r.testCase.category === 'Temperature Ambiguity' && 
    (!r.correctFreightType || !r.correctMissing)
  )
  if (tempIssues.length > 0) {
    console.log(`\n1. Temperature Handling (${tempIssues.length} issues):`)
    tempIssues.forEach(issue => {
      console.log(`   - ${issue.testCase.id}: ${issue.testCase.notes}`)
    })
  }

  const dimIssues = results.filter(r => 
    (r.testCase.expectedMissingFields.includes('dimensions') && 
     !r.validation.missingFields.includes('dimensions')) ||
    (!r.testCase.expectedMissingFields.includes('dimensions') && 
     r.validation.missingFields.includes('dimensions'))
  )
  if (dimIssues.length > 0) {
    console.log(`\n2. Dimension Requirements (${dimIssues.length} issues):`)
    dimIssues.forEach(issue => {
      console.log(`   - ${issue.testCase.id}: ${issue.testCase.notes}`)
    })
  }

  return results
}

// Run the test
runValidationExtraction().catch(console.error)