/**
 * Full Test Suite for Two-Layer Validation Approach
 * 
 * Tests the complete freight validation system with enhanced semantic validation
 */

import { config } from 'dotenv'
import * as path from 'path'
import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced'
import { validationTestCases } from './test-freight-validation'
import { randomUUID } from 'crypto'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

// Force GPT-4o for best extraction
process.env.EXTRACTION_LLM_MODEL = 'gpt-4o'

interface TestResult {
  testCase: typeof validationTestCases[0]
  result: any
  actionCorrect: boolean
  freightTypeCorrect: boolean
  validationCorrect: boolean
  duration: number
}

async function runTwoLayerValidationTests() {
  console.log('🧪 Two-Layer Validation System - Full Test Suite')
  console.log('==============================================')
  console.log('Using GPT-4o for extraction with simplified prompt')
  console.log('Enhanced semantic validation for missing field detection\n')

  const agent = new IntakeAgentLLMEnhanced()
  const results: TestResult[] = []
  const startTime = Date.now()

  // Statistics
  let correctActions = 0
  let correctFreightTypes = 0
  let correctValidations = 0

  for (const testCase of validationTestCases) {
    console.log(`\n📧 Test ${testCase.id}: ${testCase.description}`)
    console.log(`   Category: ${testCase.category}`)
    
    const testStart = Date.now()
    
    try {
      // Process the email
      const result = await agent.processEmail({
        from: testCase.email.from,
        to: 'broker@company.com',
        subject: testCase.email.subject,
        content: testCase.email.content,
        brokerId: randomUUID() // Generate proper UUID
      })

      // Check results
      const actionCorrect = result.action === testCase.expectedAction
      const freightTypeCorrect = result.freight_type === testCase.expectedFreightType
      
      // For validation, we need to check if the system correctly identified missing/insufficient fields
      let validationCorrect = false
      if (testCase.expectedAction === 'request_clarification') {
        // Should have identified issues
        validationCorrect = result.action === 'request_clarification' && 
                          (result.missing_fields?.length > 0 || result.clarification_needed?.length > 0)
      } else if (testCase.expectedAction === 'proceed_to_quote') {
        // Should not have critical issues
        validationCorrect = result.action === 'proceed_to_quote'
      } else {
        // Ignore case
        validationCorrect = result.action === 'ignore'
      }

      if (actionCorrect) correctActions++
      if (freightTypeCorrect) correctFreightTypes++
      if (validationCorrect) correctValidations++

      // Display results
      console.log(`   Action: ${actionCorrect ? '✅' : '❌'} ${result.action} (expected: ${testCase.expectedAction})`)
      if (result.freight_type) {
        console.log(`   Freight Type: ${freightTypeCorrect ? '✅' : '❌'} ${result.freight_type}`)
      }
      console.log(`   Validation: ${validationCorrect ? '✅' : '❌'}`)
      
      if (result.clarification_needed && result.clarification_needed.length > 0) {
        console.log(`   Issues found: ${result.clarification_needed.join(', ')}`)
      }
      
      console.log(`   Confidence: ${result.confidence}%`)

      // Store result
      results.push({
        testCase,
        result,
        actionCorrect,
        freightTypeCorrect,
        validationCorrect,
        duration: Date.now() - testStart
      })

    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`)
      results.push({
        testCase,
        result: { error: error.message },
        actionCorrect: false,
        freightTypeCorrect: false,
        validationCorrect: false,
        duration: Date.now() - testStart
      })
    }

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // Summary
  const total = validationTestCases.length
  console.log('\n\n📊 TEST SUMMARY - TWO-LAYER VALIDATION')
  console.log('=======================================')
  console.log(`Total Tests: ${total}`)
  console.log(`\nAccuracy Metrics:`)
  console.log(`  - Action Decision: ${correctActions}/${total} (${(correctActions/total*100).toFixed(1)}%)`)
  console.log(`  - Freight Type ID: ${correctFreightTypes}/${total} (${(correctFreightTypes/total*100).toFixed(1)}%)`)
  console.log(`  - Validation Logic: ${correctValidations}/${total} (${(correctValidations/total*100).toFixed(1)}%)`)
  console.log(`\nTest Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

  // Category breakdown
  console.log('\n📈 Performance by Category:')
  const categories = [...new Set(validationTestCases.map(tc => tc.category))]
  for (const category of categories) {
    const categoryResults = results.filter(r => r.testCase.category === category)
    const categoryCorrect = categoryResults.filter(r => r.validationCorrect).length
    console.log(`  ${category}: ${categoryCorrect}/${categoryResults.length} (${(categoryCorrect/categoryResults.length*100).toFixed(1)}%)`)
  }

  // Compare with previous results
  console.log('\n🔄 Comparison with Previous Approach:')
  console.log('  Previous (GPT-4o-mini): ~50% validation accuracy')
  console.log('  Previous (GPT-4o direct): 73.7% validation accuracy')
  console.log(`  Two-Layer (GPT-4o + semantic): ${(correctValidations/total*100).toFixed(1)}% validation accuracy`)

  return results
}

// Run the tests
runTwoLayerValidationTests().catch(console.error)