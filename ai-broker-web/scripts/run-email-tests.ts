#!/usr/bin/env ts-node

/**
 * Run Email Classification Tests
 * 
 * This script executes the comprehensive email classification tests
 * and provides a detailed analysis of the results.
 */

import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from the web app
dotenv.config({ path: path.join(__dirname, '../.env.local') })

// Verify OpenAI API key is available
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY not found in environment variables')
  console.error('Please set it in ai-broker-web/.env.local')
  process.exit(1)
}

// Import and run the tests
import { runEmailClassificationTests } from './test-email-classification.js'

async function main() {
  console.log('🔧 Environment Check:')
  console.log(`   OpenAI API Key: ${process.env.OPENAI_API_KEY?.substring(0, 10)}...`)
  console.log(`   LLM Model: ${process.env.LLM_MODEL || 'gpt-4o-mini'}\n`)

  try {
    const results = await runEmailClassificationTests()
    
    // Exit with error code if accuracy is below threshold
    const accuracy = results.correctClassifications / results.totalTests
    if (accuracy < 0.9) { // 90% accuracy threshold
      console.error('\n⚠️  Warning: Accuracy below 90% threshold')
      process.exit(1)
    }
    
    console.log('\n✅ All tests completed successfully!')
  } catch (error) {
    console.error('\n❌ Test execution failed:', error)
    process.exit(1)
  }
}

main()