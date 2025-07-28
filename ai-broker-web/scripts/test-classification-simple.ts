/**
 * Simplified Email Classification Test
 * Direct test of the LLM classification logic
 */

import { config } from 'dotenv'
import { OpenAI } from 'openai'
import * as path from 'path'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY not found')
  process.exit(1)
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Test emails
const testCases = [
  {
    id: 'load-1',
    name: 'Clear Load Request',
    email: {
      subject: 'Load Available - Chicago to Dallas',
      from: 'shipper@company.com',
      content: 'We have 42,000 lbs going from Chicago, IL 60601 to Dallas, TX 75201. Need dry van for tomorrow 8am pickup.'
    },
    expected: 'load'
  },
  {
    id: 'not-load-1',
    name: 'Carrier Status Update',
    email: {
      subject: 'Driver at pickup',
      from: 'driver@carrier.com',
      content: 'Our driver just arrived at the Chicago location. Will update once loaded.'
    },
    expected: 'not_load'
  },
  {
    id: 'edge-1',
    name: 'Invoice Mentioning Load Details',
    email: {
      subject: 'Invoice #12345',
      from: 'accounting@carrier.com',
      content: 'Please pay invoice for the load from Chicago to Dallas, 40,000 lbs delivered last week. Amount due: $2,500'
    },
    expected: 'not_load'
  },
  {
    id: 'edge-2',
    name: 'Quote Negotiation',
    email: {
      subject: 'RE: Dallas load quote',
      from: 'shipper@company.com',
      content: 'Your quote of $2,800 for the Chicago to Dallas load seems high. Can you do $2,500?'
    },
    expected: 'not_load'
  },
  {
    id: 'edge-3',
    name: 'Clarification Response',
    email: {
      subject: 'RE: Need more info',
      from: 'shipper@company.com',
      content: 'The pickup zip is 60601 and delivery is 75201. Weight is 35,000 lbs.'
    },
    expected: 'not_load'  // Should be handled as clarification, not new load
  }
]

async function testEmailClassification() {
  console.log('🚀 Testing Email Classification System\n')

  let correct = 0
  let total = 0

  for (const test of testCases) {
    console.log(`\nTesting: ${test.name}`)
    console.log(`Subject: "${test.email.subject}"`)
    
    try {
      const systemPrompt = `You are an AI assistant for a freight broker. Analyze emails to determine if they are NEW load quote requests. 

IMPORTANT: Only classify as a load request if it's asking for a NEW quote, not discussing an existing one.

Return JSON with:
{
  "is_load_request": boolean,
  "confidence": 0-100,
  "reasoning": "explanation"
}`

      const userPrompt = `Subject: ${test.email.subject}
From: ${test.email.from}

${test.email.content}`

      const completion = await openai.chat.completions.create({
        model: process.env.LLM_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      })

      const result = JSON.parse(completion.choices[0].message.content || '{}')
      const actual = result.is_load_request ? 'load' : 'not_load'
      const isCorrect = actual === test.expected
      
      total++
      if (isCorrect) correct++

      console.log(`Result: ${isCorrect ? '✅' : '❌'} ${actual} (confidence: ${result.confidence}%)`)
      if (!isCorrect) {
        console.log(`⚠️  Expected: ${test.expected}`)
        console.log(`   Reasoning: ${result.reasoning}`)
      }

    } catch (error) {
      console.error(`❌ Error: ${error.message}`)
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  console.log('\n📊 Summary:')
  console.log(`Correct: ${correct}/${total} (${(correct/total*100).toFixed(1)}%)`)
}

// Run the test
testEmailClassification().catch(console.error)