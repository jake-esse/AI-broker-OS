/**
 * Test Prompt Optimization Across Models
 * 
 * Compare original vs optimized prompts for each model
 */

import { config } from 'dotenv'
import * as path from 'path'
import { OpenAI } from 'openai'
import { FreightValidator } from '../lib/freight-types/freight-validator'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Test case focusing on the key issue
const testCase = {
  email: {
    subject: 'Urgent shipment',
    from: 'warehouse@company.com',
    content: `Pick up at our warehouse near O'Hare Airport
Deliver to Amazon fulfillment center in Dallas

35,000 lbs of consumer goods
Dry van needed
Pickup tomorrow 8am`
  },
  expected: {
    shouldExtract: {
      pickup_location: 'warehouse near O\'Hare Airport', // Vague but present
      delivery_location: 'Amazon fulfillment center in Dallas', // Vague but present
      weight: 35000,
      commodity: 'consumer goods', // Generic but present
      equipment_type: 'dry van',
      pickup_date: 'tomorrow 8am'
    },
    missingForValidation: ['pickup_location', 'delivery_location'] // Too vague for actual use
  }
}

// Original prompt (current production)
const ORIGINAL_PROMPT = `You are an AI assistant for a freight broker. Analyze emails to determine if they are NEW load quote requests from shippers needing transportation services.

EXTRACTION RULES:
1. NEVER infer equipment type from commodity.
2. ONLY extract temperature if explicitly stated as requirement.
3. Extract from ALL parts of email.
4. Set fields to null/empty if not found.
5. For commodity: Only extract if explicitly stated.

Extract all mentioned fields.`

// Optimized prompts by model
const OPTIMIZED_PROMPTS = {
  'gpt-4o-mini': `You are a freight broker AI. Extract load information from emails.

RULES:
1. Extract what's written, even if vague
2. Only use null if information is completely missing
3. Let validation layer handle quality checks

Extract: locations, weight, commodity, equipment, dates as found in email.`,

  'gpt-4o': `You are analyzing freight broker emails for load information extraction.

APPROACH:
1. Extract all freight-related information as stated in the email
2. Preserve the original text even if it seems insufficient
3. Use null only when a field is not mentioned at all
4. Include vague references (e.g., "near airport") as-is

The validation system will determine if extracted data is sufficient.`,

  'o3': `Extract freight information from this email step by step.

Step 1: Identify all freight-related mentions
- Locations (even if vague)
- Weights and commodities (even if generic)
- Equipment and dates

Step 2: Extract exactly as written
- Do not judge quality
- Do not set to null unless completely absent
- Preserve original wording

Step 3: Return all found information`
}

async function testPrompt(prompt: string, model: string, label: string) {
  const userPrompt = `Subject: ${testCase.email.subject}
From: ${testCase.email.from}

${testCase.email.content}

Extract and return JSON with all freight information.`

  const modelParams: any = {
    model,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: model === 'o3' ? 1 : 0.1
  }
  
  if (model === 'o3') {
    modelParams.max_completion_tokens = 1500
  } else {
    modelParams.max_tokens = 1500
  }

  try {
    const completion = await openai.chat.completions.create(modelParams)
    const result = JSON.parse(completion.choices[0].message.content || '{}')
    
    console.log(`\n${label}:`)
    console.log('Extracted data:')
    console.log(`  pickup_location: "${result.extracted_data?.pickup_location || result.pickup_location}"`)
    console.log(`  delivery_location: "${result.extracted_data?.delivery_location || result.delivery_location}"`)
    console.log(`  commodity: "${result.extracted_data?.commodity || result.commodity}"`)
    
    // Check if it correctly extracted the vague data
    const extracted = result.extracted_data || result
    const gotPickup = extracted.pickup_location && extracted.pickup_location !== null
    const gotDelivery = extracted.delivery_location && extracted.delivery_location !== null
    const gotCommodity = extracted.commodity && extracted.commodity !== null
    
    console.log(`\nCorrectly preserved vague data: ${gotPickup && gotDelivery && gotCommodity ? '✅' : '❌'}`)
    
    return { extracted, gotPickup, gotDelivery, gotCommodity }
  } catch (error: any) {
    console.log(`\n${label}: Error - ${error.message}`)
    return null
  }
}

async function runPromptComparison() {
  console.log('🧪 Prompt Optimization Testing')
  console.log('==============================')
  console.log('\nTest Case: Email with vague but present information')
  console.log('Goal: Extract what\'s there, let validation handle quality\n')

  const models = ['gpt-4o-mini', 'gpt-4o', 'o3']
  
  for (const model of models) {
    console.log(`\n🤖 Testing ${model}`)
    console.log('=' .repeat(50))
    
    // Test original prompt
    await testPrompt(ORIGINAL_PROMPT, model, 'Original Prompt')
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Test optimized prompt
    if (OPTIMIZED_PROMPTS[model as keyof typeof OPTIMIZED_PROMPTS]) {
      await testPrompt(
        OPTIMIZED_PROMPTS[model as keyof typeof OPTIMIZED_PROMPTS], 
        model, 
        'Optimized Prompt'
      )
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  console.log('\n\n🔍 KEY INSIGHT:')
  console.log('The problem is the two-layer approach:')
  console.log('1. LLM should extract what\'s present (even if vague)')
  console.log('2. Validation should determine if it\'s sufficient')
  console.log('\nCurrently, LLMs are doing both jobs, causing misalignment!')
}

runPromptComparison().catch(console.error)