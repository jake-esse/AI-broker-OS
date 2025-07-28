/**
 * Performance Test for Optimized Four-Step System
 * 
 * Tests without database operations for clean metrics
 */

import { config } from 'dotenv'
import * as path from 'path'
import { OpenAI } from 'openai'
import { FreightValidator, FreightType, LoadData } from '../lib/freight-types/freight-validator'
import { EnhancedFreightValidator } from '../lib/freight-types/enhanced-validator'
import { validationTestCases } from './test-freight-validation'

config({ path: path.join(__dirname, '../.env.local') })

// Create a test-only version of the agent that doesn't use database
class TestOnlyOptimizedAgent {
  private openai: OpenAI
  
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  }
  
  async processEmail(emailData: {
    from: string
    to: string
    subject: string
    content: string
  }) {
    // STEP 1: Classification
    const step1 = await this.step1_classify(emailData)
    if (!step1.isLoadRequest) {
      return { finalAction: 'ignore', ...step1 }
    }
    
    // STEP 2: Extraction
    const step2 = await this.step2_extract(emailData)
    if (!step2.extractedData) {
      return { finalAction: 'ignore', ...step1, ...step2 }
    }
    
    // STEP 3: Freight Type (rules-based)
    const step3 = this.step3_freightType(step2.extractedData)
    
    // STEP 4: Validation
    const step4 = this.step4_validate(step2.extractedData, step3.freightType)
    
    // Final action
    const criticalIssues = step4.issues.filter(issue => 
      issue.issue === 'missing' || 
      (issue.issue === 'insufficient' && ['pickup_location', 'delivery_location', 'commodity'].includes(issue.field))
    )
    
    const finalAction = criticalIssues.length === 0 ? 'proceed_to_quote' : 'request_clarification'
    
    return {
      ...step1,
      ...step2,
      ...step3,
      ...step4,
      finalAction,
      clarificationNeeded: criticalIssues.map(i => i.field)
    }
  }
  
  private async step1_classify(emailData: any) {
    const systemPrompt = `You are classifying freight broker emails. Determine if this is a NEW load quote request.

IS a load request ONLY when ALL these are true:
1. Specific shipment details (not general capabilities)
2. Clear intent to ship NOW or SOON (not future planning)
3. Requesting quote/pricing for THIS shipment

NOT a load request:
- "We'll have loads next month" → Future planning
- "Can you handle Chicago-Dallas?" → Capability inquiry
- "Your rate is too high" → Negotiation
- "Load delivered successfully" → Status update

Examples:
✅ "Need to ship 40k lbs Chicago to Dallas tomorrow" → Specific, immediate
✅ "Quote needed: 2 pallets NYC to Boston, pickup Friday" → Clear request
❌ "We ship 10 loads/month from Chicago" → General info
❌ "Planning Q3 shipments" → Future planning

Return JSON: { "is_load_request": boolean, "confidence": 0-100, "reason": "brief explanation" }`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Subject: ${emailData.subject}\nFrom: ${emailData.from}\nBody: ${emailData.content}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500
    })
    
    const result = JSON.parse(completion.choices[0].message.content || '{}')
    return {
      isLoadRequest: result.is_load_request || false,
      classificationConfidence: result.confidence || 0
    }
  }
  
  private async step2_extract(emailData: any) {
    const systemPrompt = `Extract freight information from emails. Extract ONLY what is explicitly written.

Extract exactly what's written - include vague information as-is.
Set to null ONLY if completely absent.

Fields: pickup_location, delivery_location, weight (in pounds), commodity, pickup_date, equipment_type, temperature, dimensions, etc.

Return JSON with "extracted_data" and "confidence".`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract from:\nSubject: ${emailData.subject}\nBody: ${emailData.content}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500
    })
    
    const result = JSON.parse(completion.choices[0].message.content || '{}')
    
    // Parse weight if string
    if (result.extracted_data?.weight && typeof result.extracted_data.weight === 'string') {
      const match = result.extracted_data.weight.match(/[\d,]+/)
      if (match) {
        result.extracted_data.weight = parseInt(match[0].replace(/,/g, ''))
      }
    }
    
    return {
      extractedData: result.extracted_data || null,
      extractionConfidence: result.confidence || 50
    }
  }
  
  private step3_freightType(data: LoadData) {
    const equipment = data.equipment_type?.toLowerCase() || ''
    
    if (equipment.includes('dry van') || equipment === 'van') {
      return { freightType: 'FTL_DRY_VAN' as FreightType, freightTypeConfidence: 95 }
    }
    
    if (equipment.includes('reefer') || equipment.includes('refrigerated')) {
      return { freightType: 'FTL_REEFER' as FreightType, freightTypeConfidence: 95 }
    }
    
    if (equipment.includes('flatbed')) {
      return { freightType: 'FTL_FLATBED' as FreightType, freightTypeConfidence: 95 }
    }
    
    if (data.hazmat_class || data.un_number) {
      return { freightType: 'FTL_HAZMAT' as FreightType, freightTypeConfidence: 95 }
    }
    
    if (data.weight && data.weight < 5000) {
      return { freightType: 'LTL' as FreightType, freightTypeConfidence: 85 }
    }
    
    if (data.weight && data.weight >= 5000 && data.weight <= 15000) {
      return { freightType: 'PARTIAL' as FreightType, freightTypeConfidence: 85 }
    }
    
    if (!equipment && data.temperature) {
      return { freightType: 'FTL_REEFER' as FreightType, freightTypeConfidence: 80 }
    }
    
    return { freightType: 'FTL_DRY_VAN' as FreightType, freightTypeConfidence: 70 }
  }
  
  private step4_validate(data: LoadData, freightType: FreightType) {
    const basic = FreightValidator.validateRequiredFields(data, freightType)
    const semantic = EnhancedFreightValidator.validateSemantics(data, freightType)
    
    const issues = [
      ...basic.missingFields.map(field => ({
        field,
        issue: 'missing' as const,
        message: `${field} is required`
      })),
      ...semantic
    ]
    
    const critical = issues.filter(i => 
      i.issue === 'missing' || 
      (i.issue === 'insufficient' && ['pickup_location', 'delivery_location', 'commodity'].includes(i.field))
    )
    
    return {
      isValid: critical.length === 0,
      issues,
      validationConfidence: issues.length === 0 ? 100 : Math.max(50, 100 - issues.length * 10)
    }
  }
}

// Run performance test
async function runPerformanceTest() {
  console.log('🚀 OPTIMIZED SYSTEM PERFORMANCE TEST')
  console.log('==================================\n')
  
  const agent = new TestOnlyOptimizedAgent()
  const startTime = Date.now()
  
  const metrics = {
    totalTests: 0,
    correctActions: 0,
    correctFreightTypes: 0,
    correctValidations: 0,
    avgProcessingTime: 0
  }
  
  // Test subset for performance
  const testSubset = validationTestCases.slice(0, 10)
  
  for (const testCase of testSubset) {
    const testStart = Date.now()
    console.log(`Testing ${testCase.id}: ${testCase.description}`)
    
    try {
      const result = await agent.processEmail({
        from: testCase.email.from,
        to: 'broker@company.com',
        subject: testCase.email.subject,
        content: testCase.email.content
      })
      
      metrics.totalTests++
      
      // Check action
      if (result.finalAction === testCase.expectedAction) {
        metrics.correctActions++
      }
      
      // Check freight type
      if (result.freightType === testCase.expectedFreightType) {
        metrics.correctFreightTypes++
      }
      
      // Check validation
      const expectedValid = testCase.expectedMissingFields.length === 0
      if ((result.isValid || false) === expectedValid) {
        metrics.correctValidations++
      }
      
      const processingTime = Date.now() - testStart
      console.log(`  ✓ Completed in ${processingTime}ms`)
      console.log(`  Action: ${result.finalAction} ${result.finalAction === testCase.expectedAction ? '✅' : '❌'}`)
      console.log(`  Freight: ${result.freightType} ${result.freightType === testCase.expectedFreightType ? '✅' : '❌'}`)
      console.log(`  Valid: ${result.isValid ? 'YES' : 'NO'} ${(result.isValid || false) === expectedValid ? '✅' : '❌'}\n`)
      
    } catch (error: any) {
      console.error(`  ❌ Error: ${error.message}\n`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  const totalTime = Date.now() - startTime
  metrics.avgProcessingTime = totalTime / metrics.totalTests
  
  console.log('\n📊 PERFORMANCE METRICS')
  console.log('====================')
  console.log(`Total Tests: ${metrics.totalTests}`)
  console.log(`Total Time: ${(totalTime / 1000).toFixed(1)}s`)
  console.log(`Avg Time per Test: ${metrics.avgProcessingTime.toFixed(0)}ms\n`)
  
  console.log('📈 ACCURACY METRICS')
  console.log('==================')
  console.log(`Action Decision: ${metrics.correctActions}/${metrics.totalTests} (${(metrics.correctActions/metrics.totalTests*100).toFixed(1)}%)`)
  console.log(`Freight Type ID: ${metrics.correctFreightTypes}/${metrics.totalTests} (${(metrics.correctFreightTypes/metrics.totalTests*100).toFixed(1)}%)`)
  console.log(`Validation Logic: ${metrics.correctValidations}/${metrics.totalTests} (${(metrics.correctValidations/metrics.totalTests*100).toFixed(1)}%)`)
  
  const overallAccuracy = ((metrics.correctActions + metrics.correctFreightTypes + metrics.correctValidations) / (metrics.totalTests * 3) * 100).toFixed(1)
  console.log(`\n🎯 Overall System Accuracy: ${overallAccuracy}%`)
  
  console.log('\n🔄 MODEL USAGE')
  console.log('=============')
  console.log('Step 1 (Classification): gpt-4o-mini - Fast & accurate')
  console.log('Step 2 (Extraction): gpt-4o - Best extraction quality')
  console.log('Step 3 (Freight Type): Deterministic rules - No LLM needed')
  console.log('Step 4 (Validation): Rule-based with semantic checks')
}

runPerformanceTest().catch(console.error)