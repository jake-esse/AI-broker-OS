/**
 * Run Freight Validation Tests
 * 
 * Executes comprehensive tests on the freight validation system
 * to ensure correct identification of missing fields.
 */

import { config } from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced'
import { FreightValidator } from '../lib/freight-types/freight-validator'
import { validationTestCases } from './test-freight-validation'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

interface TestResult {
  testCase: typeof validationTestCases[0]
  actualResult: any
  passed: boolean
  issues: string[]
  duration: number
}

async function runValidationTests() {
  console.log('🧪 Freight Validation System Testing')
  console.log('=====================================\n')
  console.log('Testing the system\'s ability to correctly identify missing information...\n')

  const agent = new IntakeAgentLLMEnhanced()
  const results: TestResult[] = []
  const startTime = Date.now()

  // Statistics
  let totalTests = 0
  let passedTests = 0
  let correctFreightType = 0
  let correctMissingFields = 0
  let correctAction = 0

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
        brokerId: 'test-broker-id'
      })

      // Analyze results
      const issues: string[] = []
      let passed = true

      // Check freight type identification
      if (result.freight_type !== testCase.expectedFreightType) {
        issues.push(`Freight type: expected ${testCase.expectedFreightType}, got ${result.freight_type}`)
        passed = false
      } else {
        correctFreightType++
      }

      // Check action
      if (result.action !== testCase.expectedAction) {
        issues.push(`Action: expected ${testCase.expectedAction}, got ${result.action}`)
        passed = false
      } else {
        correctAction++
      }

      // Check missing fields identification
      const actualMissing = result.missing_fields || []
      const expectedMissing = testCase.expectedMissingFields
      
      // Sort for comparison
      const actualSorted = [...actualMissing].sort()
      const expectedSorted = [...expectedMissing].sort()
      
      if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
        issues.push(`Missing fields mismatch:`)
        
        // Find differences
        const extraFields = actualMissing.filter(f => !expectedMissing.includes(f))
        const missedFields = expectedMissing.filter(f => !actualMissing.includes(f))
        
        if (extraFields.length > 0) {
          issues.push(`  - Incorrectly flagged as missing: ${extraFields.join(', ')}`)
        }
        if (missedFields.length > 0) {
          issues.push(`  - Failed to identify as missing: ${missedFields.join(', ')}`)
        }
        passed = false
      } else {
        correctMissingFields++
      }

      // Additional validation checks
      if (result.validation_warnings && result.validation_warnings.length > 0) {
        console.log(`   ⚠️  Warnings: ${result.validation_warnings.join('; ')}`)
      }

      totalTests++
      if (passed) passedTests++

      // Display result
      console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'}`)
      if (!passed) {
        issues.forEach(issue => console.log(`     - ${issue}`))
      }
      console.log(`   Confidence: ${result.confidence}%`)
      if (result.reason) {
        console.log(`   Reason: ${result.reason}`)
      }

      // Store result
      results.push({
        testCase,
        actualResult: result,
        passed,
        issues,
        duration: Date.now() - testStart
      })

    } catch (error: any) {
      console.error(`   ❌ ERROR: ${error.message}`)
      results.push({
        testCase,
        actualResult: { error: error.message },
        passed: false,
        issues: [`Error: ${error.message}`],
        duration: Date.now() - testStart
      })
      totalTests++
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // Generate summary report
  console.log('\n\n📊 TEST SUMMARY')
  console.log('===============')
  console.log(`Total Tests: ${totalTests}`)
  console.log(`Passed: ${passedTests}/${totalTests} (${(passedTests/totalTests*100).toFixed(1)}%)`)
  console.log('\nDetailed Accuracy:')
  console.log(`  - Freight Type: ${correctFreightType}/${totalTests} (${(correctFreightType/totalTests*100).toFixed(1)}%)`)
  console.log(`  - Missing Fields: ${correctMissingFields}/${totalTests} (${(correctMissingFields/totalTests*100).toFixed(1)}%)`)
  console.log(`  - Action Decision: ${correctAction}/${totalTests} (${(correctAction/totalTests*100).toFixed(1)}%)`)

  // Category analysis
  console.log('\n📈 Performance by Category:')
  const categories = [...new Set(validationTestCases.map(tc => tc.category))]
  for (const category of categories) {
    const categoryResults = results.filter(r => r.testCase.category === category)
    const categoryPassed = categoryResults.filter(r => r.passed).length
    const categoryTotal = categoryResults.length
    console.log(`  ${category}: ${categoryPassed}/${categoryTotal} (${(categoryPassed/categoryTotal*100).toFixed(1)}%)`)
  }

  // Common issues analysis
  console.log('\n🔍 Common Issues:')
  const allIssues = results.flatMap(r => r.issues)
  const issueTypes = {
    freightType: allIssues.filter(i => i.includes('Freight type')).length,
    action: allIssues.filter(i => i.includes('Action:')).length,
    missingFields: allIssues.filter(i => i.includes('Missing fields')).length,
    extraFields: allIssues.filter(i => i.includes('Incorrectly flagged')).length,
    missedFields: allIssues.filter(i => i.includes('Failed to identify')).length
  }
  
  Object.entries(issueTypes).forEach(([type, count]) => {
    if (count > 0) {
      console.log(`  - ${type}: ${count} occurrences`)
    }
  })

  // Failed tests details
  const failedTests = results.filter(r => !r.passed)
  if (failedTests.length > 0) {
    console.log('\n❌ Failed Tests Details:')
    for (const failed of failedTests) {
      console.log(`\n  ${failed.testCase.id}: ${failed.testCase.description}`)
      console.log(`  Notes: ${failed.testCase.notes}`)
      failed.issues.forEach(issue => console.log(`  - ${issue}`))
    }
  }

  // Generate detailed report
  const reportData = {
    summary: {
      totalTests,
      passedTests,
      accuracy: (passedTests/totalTests*100).toFixed(1),
      testDuration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    },
    accuracyBreakdown: {
      freightType: {
        correct: correctFreightType,
        total: totalTests,
        accuracy: (correctFreightType/totalTests*100).toFixed(1)
      },
      missingFields: {
        correct: correctMissingFields,
        total: totalTests,
        accuracy: (correctMissingFields/totalTests*100).toFixed(1)
      },
      actionDecision: {
        correct: correctAction,
        total: totalTests,
        accuracy: (correctAction/totalTests*100).toFixed(1)
      }
    },
    categoryResults: categories.map(cat => {
      const catResults = results.filter(r => r.testCase.category === cat)
      return {
        category: cat,
        total: catResults.length,
        passed: catResults.filter(r => r.passed).length,
        accuracy: (catResults.filter(r => r.passed).length / catResults.length * 100).toFixed(1)
      }
    }),
    detailedResults: results.map(r => ({
      id: r.testCase.id,
      category: r.testCase.category,
      description: r.testCase.description,
      passed: r.passed,
      issues: r.issues,
      expected: {
        freightType: r.testCase.expectedFreightType,
        missingFields: r.testCase.expectedMissingFields,
        action: r.testCase.expectedAction
      },
      actual: {
        freightType: r.actualResult.freight_type,
        missingFields: r.actualResult.missing_fields || [],
        action: r.actualResult.action,
        confidence: r.actualResult.confidence
      },
      duration: r.duration
    }))
  }

  // Save report
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
  const reportPath = path.join(process.cwd(), `validation-test-report-${timestamp}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2))
  console.log(`\n📄 Detailed report saved to: ${reportPath}`)

  return reportData
}

// Run if executed directly
if (require.main === module) {
  runValidationTests().catch(console.error)
}

export { runValidationTests }