/**
 * Generate Comprehensive Validation Testing Report
 * 
 * Creates a detailed report on the freight validation system's
 * ability to correctly identify missing information.
 */

import { config } from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import { OpenAI } from 'openai'
import { FreightValidator, FreightType, LoadData } from '../lib/freight-types/freight-validator'
import { validationTestCases } from './test-freight-validation'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Updated extraction prompt with all improvements
const IMPROVED_SYSTEM_PROMPT = `You are an AI assistant for a freight broker. Analyze emails to determine if they are NEW load quote requests from shippers needing transportation services.

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
3. DO NOT extract temperature if it's just mentioned casually (e.g., "was in our 70°F warehouse")
4. DO NOT add temperature data just because commodity might need it
5. Extract from ALL parts of email including forwarded sections
6. IMPORTANT: Set fields to null/empty if not found. Do NOT make up values.
7. For commodity: Only extract if explicitly stated. Generic terms like "products", "items", "goods" without specifics should be null
8. For locations: Vague landmarks ("near airport", "by the mall") are NOT valid locations - set to null
9. For dates: Time without date ("10 AM appointment") is not sufficient - set pickup_date to null

For each email, extract:

BASIC INFORMATION (always try to extract):
- pickup_location: Full location string (null if only vague landmarks)
- pickup_city, pickup_state, pickup_zip: Parsed location components
- delivery_location: Full location string (null if only vague landmarks)
- delivery_city, delivery_state, delivery_zip: Parsed location components
- weight: Weight in pounds (convert: 1 ton = 2000 lbs, use higher value from ranges)
- commodity: SPECIFIC description of freight (null if only generic terms)
- pickup_date: When pickup is needed (null if only time without date)
- equipment_type: Extract EXACTLY as mentioned
- piece_count: Number of pieces/pallets (extract if mentioned)

DIMENSIONS (only if mentioned):
- dimensions.length: Length in inches
- dimensions.width: Width in inches  
- dimensions.height: Height in inches

TEMPERATURE (only if required for shipment):
- temperature.min: Minimum temp if stated
- temperature.max: Maximum temp if stated  
- temperature.unit: F or C

HAZMAT (if mentioned):
- hazmat_class: Class 1-9
- un_number: UN#### format
- proper_shipping_name: Official name
- packing_group: I, II, or III
- emergency_contact: 24/7 number
- placards_required: true/false

FLATBED SPECIFIC:
- tarping_required: true/false
- oversize_permits: true/false
- escort_required: true/false

LTL SPECIFIC:
- freight_class: NMFC class (50-500)
- packaging_type: Pallets, crates, etc.
- accessorials: Array of services

Return JSON with:
{
  "is_load_request": boolean,
  "confidence": 0-100,
  "extracted_data": { all fields found },
  "reasoning": "explanation of classification decision"
}`

async function extractWithPrompt(emailData: any): Promise<any> {
  const userPrompt = `Analyze this email:

Subject: ${emailData.subject}
From: ${emailData.from}

Body:
${emailData.content}`

  const completion = await openai.chat.completions.create({
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: IMPROVED_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 1500
  })

  return JSON.parse(completion.choices[0].message.content || '{}')
}

async function generateValidationReport() {
  console.log('📊 Freight Validation System - Comprehensive Report')
  console.log('==============================================\n')

  const results: any[] = []
  const startTime = Date.now()

  // Test with improved prompt
  console.log('Running validation tests with improved extraction prompt...\n')

  for (const testCase of validationTestCases) {
    process.stdout.write('.')
    
    try {
      const extraction = await extractWithPrompt(testCase.email)
      const freightType = extraction.extracted_data ? 
        FreightValidator.identifyFreightType(extraction.extracted_data) : 'UNKNOWN'
      const validation = extraction.extracted_data ?
        FreightValidator.validateRequiredFields(extraction.extracted_data, freightType) :
        { isValid: false, missingFields: [], warnings: [] }

      results.push({
        testCase,
        extraction,
        freightType,
        validation,
        correctFreightType: freightType === testCase.expectedFreightType,
        correctMissing: JSON.stringify(validation.missingFields.sort()) === 
                       JSON.stringify(testCase.expectedMissingFields.sort()),
        correctAction: (extraction.is_load_request ? 
          (validation.isValid ? 'proceed_to_quote' : 'request_clarification') : 
          'ignore') === testCase.expectedAction
      })
    } catch (error: any) {
      results.push({
        testCase,
        error: error.message,
        correctFreightType: false,
        correctMissing: false,
        correctAction: false
      })
    }

    await new Promise(resolve => setTimeout(resolve, 300))
  }

  console.log('\n\nGenerating report...\n')

  // Calculate metrics
  const total = results.length
  const correctFreightType = results.filter(r => r.correctFreightType).length
  const correctMissing = results.filter(r => r.correctMissing).length
  const correctAction = results.filter(r => r.correctAction).length

  // Category analysis
  const categories = [...new Set(validationTestCases.map(tc => tc.category))]
  const categoryStats = categories.map(cat => {
    const catResults = results.filter(r => r.testCase.category === cat)
    return {
      category: cat,
      total: catResults.length,
      freightTypeAccuracy: (catResults.filter(r => r.correctFreightType).length / catResults.length * 100).toFixed(1),
      missingFieldAccuracy: (catResults.filter(r => r.correctMissing).length / catResults.length * 100).toFixed(1),
      actionAccuracy: (catResults.filter(r => r.correctAction).length / catResults.length * 100).toFixed(1)
    }
  })

  // Generate HTML report
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Freight Validation System Report</title>
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
    .good { color: #4CAF50; }
    .poor { color: #f44336; }
    .improvements {
      background: #f0f9ff;
      padding: 20px;
      border-radius: 8px;
      margin-top: 30px;
    }
    .issue {
      background: #fff3cd;
      padding: 15px;
      border-radius: 5px;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Freight Validation System - Test Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    
    <div class="summary">
      <h2>Overall Performance</h2>
      <div class="metric">
        <div class="metric-value">${(correctFreightType/total*100).toFixed(1)}%</div>
        <div class="metric-label">Freight Type Accuracy</div>
      </div>
      <div class="metric">
        <div class="metric-value">${(correctMissing/total*100).toFixed(1)}%</div>
        <div class="metric-label">Missing Field Detection</div>
      </div>
      <div class="metric">
        <div class="metric-value">${(correctAction/total*100).toFixed(1)}%</div>
        <div class="metric-label">Action Decision Accuracy</div>
      </div>
    </div>

    <h2>📈 Performance by Category</h2>
    <table>
      <tr>
        <th>Category</th>
        <th>Tests</th>
        <th>Freight Type</th>
        <th>Missing Fields</th>
        <th>Action Decision</th>
      </tr>
      ${categoryStats.map(stat => `
        <tr>
          <td>${stat.category}</td>
          <td>${stat.total}</td>
          <td class="${parseFloat(stat.freightTypeAccuracy) >= 80 ? 'good' : 'poor'}">${stat.freightTypeAccuracy}%</td>
          <td class="${parseFloat(stat.missingFieldAccuracy) >= 80 ? 'good' : 'poor'}">${stat.missingFieldAccuracy}%</td>
          <td class="${parseFloat(stat.actionAccuracy) >= 80 ? 'good' : 'poor'}">${stat.actionAccuracy}%</td>
        </tr>
      `).join('')}
    </table>

    <div class="improvements">
      <h2>🔧 Key Improvements Made</h2>
      <ul>
        <li><strong>Temperature Handling:</strong> System now correctly distinguishes between required temperature control and casual temperature mentions</li>
        <li><strong>Freight Type Priority:</strong> Fixed logic to check equipment type in correct order (dry van → reefer → flatbed)</li>
        <li><strong>Missing Field Detection:</strong> Enhanced prompt to be more explicit about null values for missing information</li>
        <li><strong>Location Validation:</strong> System now properly identifies vague landmarks as insufficient location data</li>
        <li><strong>Commodity Extraction:</strong> Generic terms like "goods" or "items" are now correctly flagged as missing commodity</li>
        <li><strong>Weight Conversion:</strong> Automatic conversion from tons to pounds (1 ton = 2000 lbs)</li>
        <li><strong>LTL/Partial Logic:</strong> Improved weight-based determination with proper thresholds</li>
      </ul>
    </div>

    <h2>⚠️ Remaining Challenges</h2>
    ${results.filter(r => !r.correctMissing).slice(0, 5).map(r => `
      <div class="issue">
        <strong>${r.testCase.id}:</strong> ${r.testCase.description}<br>
        <em>Issue:</em> ${r.testCase.notes}<br>
        <em>Expected missing:</em> [${r.testCase.expectedMissingFields.join(', ')}]<br>
        <em>Detected missing:</em> [${r.validation?.missingFields?.join(', ') || 'none'}]
      </div>
    `).join('')}

    <h2>📝 Recommendations</h2>
    <ul>
      <li>Consider implementing a secondary validation pass for edge cases</li>
      <li>Add specific handling for international shipments requiring commodity for customs</li>
      <li>Enhance location validation to accept city/state combinations without zip codes</li>
      <li>Implement fuzzy matching for equipment type variations (e.g., "enclosed trailer" = "dry van")</li>
      <li>Add confidence scoring for extracted fields to guide clarification requests</li>
    </ul>

    <h2>🎯 Test Coverage</h2>
    <p>Total test cases: ${total}</p>
    <p>Categories tested: ${categories.length}</p>
    <p>Edge cases covered: Temperature ambiguity, location variations, weight units, equipment confusion, hazmat detection, date formats, LTL vs partial</p>
  </div>
</body>
</html>
  `

  // Save report
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
  const reportPath = path.join(process.cwd(), `freight-validation-report-${timestamp}.html`)
  fs.writeFileSync(reportPath, html)

  // Console summary
  console.log('📊 VALIDATION SYSTEM PERFORMANCE')
  console.log('================================')
  console.log(`Freight Type Accuracy: ${(correctFreightType/total*100).toFixed(1)}%`)
  console.log(`Missing Field Detection: ${(correctMissing/total*100).toFixed(1)}%`)
  console.log(`Action Decision Accuracy: ${(correctAction/total*100).toFixed(1)}%`)
  console.log(`\n✅ Report saved to: ${reportPath}`)

  return {
    summary: {
      totalTests: total,
      freightTypeAccuracy: (correctFreightType/total*100).toFixed(1),
      missingFieldAccuracy: (correctMissing/total*100).toFixed(1),
      actionAccuracy: (correctAction/total*100).toFixed(1),
      testDuration: Date.now() - startTime
    },
    categoryStats,
    results
  }
}

// Run if executed directly
if (require.main === module) {
  generateValidationReport().catch(console.error)
}

export { generateValidationReport }