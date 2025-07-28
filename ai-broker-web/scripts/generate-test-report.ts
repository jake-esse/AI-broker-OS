/**
 * Generate Comprehensive Test Report for Email Classification
 * 
 * This script runs all tests and generates a detailed report
 * showing the system's accuracy and areas for improvement
 */

import { config } from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

// Import test functions
import { testEmails } from './test-email-classification'
import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced'

interface TestResult {
  email: typeof testEmails[0]
  result: any
  correct: boolean
  duration: number
}

async function generateTestReport() {
  console.log('📊 Email Classification System - Comprehensive Test Report')
  console.log('========================================================\n')

  const agent = new IntakeAgentLLMEnhanced()
  const results: TestResult[] = []
  const startTime = Date.now()

  // Run all tests
  console.log('Running tests...\n')
  
  for (const testEmail of testEmails) {
    const testStart = Date.now()
    
    try {
      const result = await agent.processEmail({
        from: testEmail.from,
        to: 'broker@company.com',
        subject: testEmail.subject,
        content: testEmail.content,
        brokerId: 'test-broker-id'
      })

      const isLoadRequest = result.action !== 'ignore'
      const expectedIsLoad = testEmail.expectedClassification === 'load'
      const correct = isLoadRequest === expectedIsLoad

      results.push({
        email: testEmail,
        result,
        correct,
        duration: Date.now() - testStart
      })

      process.stdout.write(correct ? '✅' : '❌')
    } catch (error) {
      results.push({
        email: testEmail,
        result: { error: error.message },
        correct: false,
        duration: Date.now() - testStart
      })
      process.stdout.write('❌')
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  console.log('\n\nGenerating report...\n')

  // Calculate statistics
  const totalTests = results.length
  const correctTests = results.filter(r => r.correct).length
  const accuracy = (correctTests / totalTests * 100).toFixed(1)
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / totalTests

  // Category analysis
  const categories = [...new Set(testEmails.map(e => e.category))]
  const categoryStats = categories.map(category => {
    const categoryResults = results.filter(r => r.email.category === category)
    const correct = categoryResults.filter(r => r.correct).length
    const total = categoryResults.length
    return {
      category,
      correct,
      total,
      accuracy: (correct / total * 100).toFixed(1)
    }
  })

  // Confidence analysis
  const confidenceRanges = [
    { range: '90-100%', min: 90, max: 100 },
    { range: '70-89%', min: 70, max: 89 },
    { range: '50-69%', min: 50, max: 69 },
    { range: '0-49%', min: 0, max: 49 }
  ]

  const confidenceStats = confidenceRanges.map(range => {
    const inRange = results.filter(r => 
      r.result.confidence >= range.min && r.result.confidence <= range.max
    )
    return {
      range: range.range,
      count: inRange.length,
      accuracy: inRange.length > 0 ? 
        (inRange.filter(r => r.correct).length / inRange.length * 100).toFixed(1) : 
        'N/A'
    }
  })

  // Generate HTML report
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Email Classification Test Report</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      margin: 40px;
      background: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { color: #333; }
    h2 { color: #666; margin-top: 30px; }
    .summary {
      background: #e8f4f8;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .metric {
      display: inline-block;
      margin-right: 30px;
    }
    .metric-value {
      font-size: 32px;
      font-weight: bold;
      color: #2196F3;
    }
    .metric-label {
      font-size: 14px;
      color: #666;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background: #f0f0f0;
      font-weight: bold;
    }
    .correct { color: #4CAF50; }
    .incorrect { color: #f44336; }
    .email-content {
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .confidence-high { color: #4CAF50; }
    .confidence-medium { color: #FF9800; }
    .confidence-low { color: #f44336; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Email Classification Test Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    
    <div class="summary">
      <div class="metric">
        <div class="metric-value">${accuracy}%</div>
        <div class="metric-label">Overall Accuracy</div>
      </div>
      <div class="metric">
        <div class="metric-value">${correctTests}/${totalTests}</div>
        <div class="metric-label">Correct Classifications</div>
      </div>
      <div class="metric">
        <div class="metric-value">${avgDuration.toFixed(0)}ms</div>
        <div class="metric-label">Avg Response Time</div>
      </div>
    </div>

    <h2>📈 Performance by Category</h2>
    <table>
      <tr>
        <th>Category</th>
        <th>Correct</th>
        <th>Total</th>
        <th>Accuracy</th>
      </tr>
      ${categoryStats.map(stat => `
        <tr>
          <td>${stat.category}</td>
          <td>${stat.correct}</td>
          <td>${stat.total}</td>
          <td class="${parseFloat(stat.accuracy) >= 80 ? 'correct' : 'incorrect'}">${stat.accuracy}%</td>
        </tr>
      `).join('')}
    </table>

    <h2>🎯 Confidence Distribution</h2>
    <table>
      <tr>
        <th>Confidence Range</th>
        <th>Count</th>
        <th>Accuracy in Range</th>
      </tr>
      ${confidenceStats.map(stat => `
        <tr>
          <td>${stat.range}</td>
          <td>${stat.count}</td>
          <td>${stat.accuracy}%</td>
        </tr>
      `).join('')}
    </table>

    <h2>❌ Misclassifications</h2>
    <table>
      <tr>
        <th>Test ID</th>
        <th>Category</th>
        <th>Subject</th>
        <th>Expected</th>
        <th>Actual</th>
        <th>Confidence</th>
        <th>Reason</th>
      </tr>
      ${results.filter(r => !r.correct).map(r => `
        <tr>
          <td>${r.email.id}</td>
          <td>${r.email.category}</td>
          <td class="email-content">${r.email.subject}</td>
          <td>${r.email.expectedClassification}</td>
          <td>${r.result.action === 'ignore' ? 'not_load' : 'load'}</td>
          <td class="${r.result.confidence >= 90 ? 'confidence-high' : r.result.confidence >= 70 ? 'confidence-medium' : 'confidence-low'}">${r.result.confidence || 0}%</td>
          <td class="email-content">${r.result.reason || r.result.error || 'No reason provided'}</td>
        </tr>
      `).join('')}
    </table>

    <h2>📋 Detailed Test Results</h2>
    <table>
      <tr>
        <th>Test ID</th>
        <th>Category</th>
        <th>Result</th>
        <th>Confidence</th>
        <th>Response Time</th>
        <th>Action</th>
      </tr>
      ${results.map(r => `
        <tr>
          <td>${r.email.id}</td>
          <td>${r.email.category}</td>
          <td class="${r.correct ? 'correct' : 'incorrect'}">${r.correct ? '✅ Pass' : '❌ Fail'}</td>
          <td class="${r.result.confidence >= 90 ? 'confidence-high' : r.result.confidence >= 70 ? 'confidence-medium' : 'confidence-low'}">${r.result.confidence || 0}%</td>
          <td>${r.duration}ms</td>
          <td>${r.result.action || 'error'}</td>
        </tr>
      `).join('')}
    </table>

    <h2>🔍 Key Findings</h2>
    <ul>
      <li>The system achieves ${accuracy}% overall accuracy in email classification</li>
      <li>Best performance on: ${categoryStats.sort((a, b) => parseFloat(b.accuracy) - parseFloat(a.accuracy))[0].category} (${categoryStats[0].accuracy}%)</li>
      <li>Needs improvement on: ${categoryStats.sort((a, b) => parseFloat(a.accuracy) - parseFloat(b.accuracy))[0].category} (${categoryStats[categoryStats.length - 1].accuracy}%)</li>
      <li>High confidence predictions (90%+) are ${confidenceStats[0].accuracy}% accurate</li>
      <li>Average processing time of ${avgDuration.toFixed(0)}ms is well within acceptable limits</li>
    </ul>

    <h2>📝 Recommendations</h2>
    <ul>
      <li>Review and improve classification logic for emails with mixed content</li>
      <li>Enhance detection of rate negotiations vs new load requests</li>
      <li>Improve handling of forwarded email chains</li>
      <li>Consider adding more specific patterns for clarification responses</li>
    </ul>
  </div>
</body>
</html>
  `

  // Save report
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
  const reportPath = path.join(process.cwd(), `test-report-${timestamp}.html`)
  fs.writeFileSync(reportPath, html)

  // Also save JSON data
  const jsonPath = path.join(process.cwd(), `test-results-${timestamp}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify({
    summary: {
      totalTests,
      correctTests,
      accuracy,
      avgDuration,
      testDuration: Date.now() - startTime
    },
    categoryStats,
    confidenceStats,
    results: results.map(r => ({
      id: r.email.id,
      category: r.email.category,
      correct: r.correct,
      expected: r.email.expectedClassification,
      actual: r.result.action === 'ignore' ? 'not_load' : 'load',
      confidence: r.result.confidence,
      duration: r.duration,
      reason: r.result.reason
    }))
  }, null, 2))

  // Console summary
  console.log('📊 TEST SUMMARY')
  console.log('==============')
  console.log(`Overall Accuracy: ${accuracy}% (${correctTests}/${totalTests})`)
  console.log(`Average Response Time: ${avgDuration.toFixed(0)}ms`)
  console.log(`Total Test Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`)
  console.log(`\n✅ Report saved to: ${reportPath}`)
  console.log(`📄 Raw data saved to: ${jsonPath}`)
}

// Run if executed directly
if (require.main === module) {
  generateTestReport().catch(console.error)
}

export { generateTestReport }