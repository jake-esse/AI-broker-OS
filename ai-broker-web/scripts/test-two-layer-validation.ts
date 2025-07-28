/**
 * Test Two-Layer Validation Approach
 * 
 * Layer 1: LLM extracts what's present (even if vague)
 * Layer 2: Semantic validator checks if it's sufficient
 */

import { config } from 'dotenv'
import * as path from 'path'
import { OpenAI } from 'openai'
import { FreightValidator } from '../lib/freight-types/freight-validator'
import { EnhancedFreightValidator } from '../lib/freight-types/enhanced-validator'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Simplified extraction prompt - just extract, don't judge
const EXTRACTION_PROMPT = `You are extracting freight information from emails.

RULE: Extract exactly what is written. Do not judge quality or sufficiency.

Set to null ONLY if the information is completely absent from the email.
If information is present but vague (e.g., "near airport"), extract it as-is.

Extract all freight-related fields.`

const testCases = [
  {
    name: 'Vague locations',
    email: {
      subject: 'Load available',
      from: 'shipper@company.com',
      content: `Pick up at warehouse near O'Hare Airport
Deliver to Amazon facility in Dallas area
35,000 lbs consumer goods
Dry van
Tomorrow morning`
    }
  },
  {
    name: 'Time without date',
    email: {
      subject: 'Flatbed needed',
      from: 'steel@company.com',
      content: `Chicago, IL to Houston, TX
44,000 lbs steel beams
Flatbed required
10:00 AM appointment
Dimensions: 40' x 8' x 6'`
    }
  },
  {
    name: 'Generic commodity',
    email: {
      subject: 'LTL shipment',
      from: 'warehouse@dist.com',
      content: `Denver, CO 80202 to Phoenix, AZ 85001
2,500 lbs on 4 pallets
General merchandise
Class 70
Liftgate needed at delivery`
    }
  }
]

async function testTwoLayerApproach() {
  console.log('🧪 Two-Layer Validation Approach Test')
  console.log('====================================')
  console.log('\nLayer 1: Simple extraction (what\'s there)')
  console.log('Layer 2: Semantic validation (is it sufficient?)\n')

  for (const test of testCases) {
    console.log(`\n📧 Test: ${test.name}`)
    console.log('-'.repeat(40))
    
    // Layer 1: Extract with any model
    const userPrompt = `Subject: ${test.email.subject}\nFrom: ${test.email.from}\n\n${test.email.content}`
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: userPrompt + '\n\nReturn JSON with extracted freight data.' }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500
    })
    
    const extracted = JSON.parse(completion.choices[0].message.content || '{}')
    console.log('\n🤖 Layer 1 - Extracted Data:')
    console.log(JSON.stringify(extracted, null, 2).split('\n').map(l => '  ' + l).join('\n'))
    
    // Identify freight type
    const freightType = FreightValidator.identifyFreightType(extracted)
    console.log(`\nFreight Type: ${freightType}`)
    
    // Layer 2: Semantic validation
    const semanticIssues = EnhancedFreightValidator.validateSemantics(extracted, freightType)
    
    console.log('\n🔍 Layer 2 - Semantic Validation:')
    if (semanticIssues.length === 0) {
      console.log('  ✅ All information is sufficient')
    } else {
      semanticIssues.forEach(issue => {
        const icon = issue.issue === 'missing' ? '❌' : '⚠️ '
        console.log(`  ${icon} ${issue.field}: ${issue.reason}`)
        if (issue.value) {
          console.log(`     Current value: "${issue.value}"`)
        }
      })
    }
    
    // Show clarification message
    const clarification = EnhancedFreightValidator.getClarificationSummary(semanticIssues)
    if (clarification) {
      console.log('\n📨 Clarification Email Would Include:')
      console.log(clarification.split('\n').map(l => '  ' + l).join('\n'))
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  console.log('\n\n🎯 Summary')
  console.log('==========')
  console.log('This two-layer approach solves the alignment problem:')
  console.log('1. LLM extracts everything present (no quality judgments)')
  console.log('2. Validator applies business rules consistently')
  console.log('3. Clear separation of concerns')
  console.log('4. Works well with ANY model (no per-model prompt tuning needed)')
}

testTwoLayerApproach().catch(console.error)