/**
 * Test Industry-Optimized Agent
 * 
 * Re-run edge case tests with the optimized implementation
 */

import { config } from 'dotenv'
import * as path from 'path'
import { OpenAI } from 'openai'
import { FreightValidator, LoadData } from '../lib/freight-types/freight-validator'
import { EnhancedFreightValidator } from '../lib/freight-types/enhanced-validator'

// Test-only version without database dependencies
class TestIndustryOptimizedAgent {
  private openai: OpenAI
  
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  }
  
  async processEmail(emailData: any) {
    const step1Result = await this.step1_enhancedClassify(emailData)
    
    if (!step1Result.isLoadRequest) {
      return {
        isLoadRequest: false,
        finalAction: 'ignore',
        reason: step1Result.reason
      }
    }
    
    const step2Result = await this.step2_industryExtract(emailData)
    
    if (!step2Result.extractedData || Object.keys(step2Result.extractedData).length === 0) {
      return {
        isLoadRequest: true,
        finalAction: 'ignore',
        clarificationNeeded: ['Unable to extract freight information']
      }
    }
    
    const step3Result = this.step3_enhancedFreightType(step2Result.extractedData, step2Result.industryFlags)
    const step4Result = this.step4_industryValidation(
      step2Result.extractedData,
      step3Result.freightType,
      step2Result.industryFlags
    )
    
    let finalAction: 'proceed_to_quote' | 'request_clarification' | 'ignore'
    let clarificationNeeded: string[] = []
    
    if (step2Result.industryFlags?.multiStop) {
      finalAction = 'request_clarification'
      clarificationNeeded.push('Multi-stop routing requires special handling')
    } else if (step2Result.industryFlags?.crossBorder) {
      finalAction = 'request_clarification'
      clarificationNeeded.push('Cross-border shipment requires detailed commodity information')
    } else if (step4Result.criticalIssues.length === 0) {
      finalAction = 'proceed_to_quote'
    } else {
      finalAction = 'request_clarification'
      clarificationNeeded = step4Result.criticalIssues.map(issue => {
        if (issue.issue === 'missing') {
          return FreightValidator.getFieldDisplayName(issue.field)
        } else {
          return `${FreightValidator.getFieldDisplayName(issue.field)} - ${issue.message}`
        }
      })
    }
    
    return {
      isLoadRequest: true,
      extractedData: step2Result.extractedData,
      freightType: step3Result.freightType,
      finalAction,
      clarificationNeeded,
      industryFlags: step2Result.industryFlags
    }
  }
  
  private async step1_enhancedClassify(emailData: any): Promise<{
    isLoadRequest: boolean
    confidence: number
    reason: string
  }> {
    const systemPrompt = `You are a freight broker email classifier with deep industry knowledge.

IS a load request when:
- Shipper needs transportation for specific cargo
- Clear pickup/delivery locations (even if multiple stops)
- Timeframe is immediate or near-term (not annual contracts)
- Requesting quote or availability for actual shipment

NOT a load request:
- Carrier offering truck availability
- Detention/payment disputes  
- Annual contract RFPs or long-term planning
- Status updates on existing loads
- General capability inquiries
- Rate negotiations on past shipments

Industry patterns to recognize:
- "Consolidation load" with multiple pickups → IS a load
- "Multi-drop shipment" → IS a load
- "Truck available in..." → NOT a load (carrier capacity)
- "RFP for annual contract" → NOT a load
- "Detention invoice" → NOT a load
- "Need team drivers ASAP" → IS a load (expedited)

Return JSON: { "is_load_request": boolean, "confidence": 0-100, "reason": "explanation" }`

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
      confidence: result.confidence || 0,
      reason: result.reason || 'No reason provided'
    }
  }
  
  private async step2_industryExtract(emailData: any): Promise<{
    extractedData: LoadData | null
    confidence: number
    industryFlags: any
  }> {
    const systemPrompt = `Extract freight information with freight industry expertise.

HANDLE THESE INDUSTRY PATTERNS:
1. Multi-stop loads: Extract all stops in special_requirements
2. Appointment requirements: Note time windows and penalties
3. Equipment variations: Recognize vented van, conestoga, multi-temp reefer
4. Cross-border: Note customs requirements
5. Expedited/Team: Note urgency and team driver needs
6. Blanket wrap: High-value special handling
7. Dimensional pricing: Note if load "cubes out" despite low weight

Fields to extract:
- pickup_location: First/primary pickup (note others in special_requirements)
- delivery_location: First/primary delivery (note others in special_requirements)
- weight: Total weight in pounds
- commodity: Specific description (critical for customs/hazmat)
- pickup_date: When ready (note if ASAP/expedited)
- equipment_type: Include variations (vented van, conestoga, etc.)
- temperature: Include multi-temp zones if mentioned
- dimensions: Critical for flatbed/oversize
- All hazmat details: class, UN#, proper name, etc.
- special_requirements: Everything else important

Also return industry_flags JSON indicating special handling needs.`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract from:\nSubject: ${emailData.subject}\nBody: ${emailData.content}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2000
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
      confidence: result.confidence || 50,
      industryFlags: result.industry_flags || {}
    }
  }
  
  private step3_enhancedFreightType(data: LoadData, industryFlags: any): {
    freightType: any
    confidence: number
  } {
    const equipment = data.equipment_type?.toLowerCase() || ''
    const commodity = data.commodity?.toLowerCase() || ''
    const special = data.special_requirements?.toLowerCase() || ''
    
    // Priority 1: Hazmat detection (including limited quantity)
    if (data.hazmat_class || data.un_number || 
        commodity.includes('hazmat') || commodity.includes('dangerous') ||
        special.includes('hazmat') || industryFlags?.limitedQuantityHazmat) {
      return { freightType: 'FTL_HAZMAT', confidence: 95 }
    }
    
    // Priority 2: Equipment type mapping
    if (equipment.includes('dry van') || equipment === 'van' || 
        equipment.includes('vented') || equipment.includes('enclosed')) {
      return { freightType: 'FTL_DRY_VAN', confidence: 95 }
    }
    
    if (equipment.includes('reefer') || equipment.includes('refrigerated') ||
        equipment.includes('multi-temp') || equipment.includes('protect from freeze')) {
      return { freightType: 'FTL_REEFER', confidence: 95 }
    }
    
    if (equipment.includes('flatbed') || equipment.includes('step deck') ||
        equipment.includes('conestoga') || equipment.includes('rgn') ||
        equipment.includes('lowboy') || equipment.includes('double drop')) {
      return { freightType: 'FTL_FLATBED', confidence: 95 }
    }
    
    // Priority 3: Small expedited (Sprinter/cargo van)
    if (equipment.includes('sprinter') || equipment.includes('cargo van') ||
        equipment.includes('hot shot')) {
      return { freightType: 'LTL', confidence: 90 }
    }
    
    // Priority 4: Weight-based determination
    if (data.weight) {
      // Blanket wrap typically partial
      if (special.includes('blanket wrap')) {
        return { freightType: 'PARTIAL', confidence: 85 }
      }
      
      // LTL indicators
      if (data.freight_class || data.piece_count || 
          special.includes('liftgate') || special.includes('residential')) {
        return { freightType: 'LTL', confidence: 90 }
      }
      
      // Weight thresholds
      if (data.weight < 5000) {
        return { freightType: 'LTL', confidence: 85 }
      }
      
      if (data.weight >= 5000 && data.weight <= 15000) {
        return { freightType: 'PARTIAL', confidence: 85 }
      }
      
      // Check for cube-out loads (light but full trailer)
      if (data.weight < 10000 && special.includes('full trailer')) {
        return { freightType: 'FTL_DRY_VAN', confidence: 80 }
      }
    }
    
    // Priority 5: Temperature without equipment
    if (!equipment && data.temperature) {
      return { freightType: 'FTL_REEFER', confidence: 80 }
    }
    
    // Priority 6: Oversize/permit loads default to flatbed
    if (industryFlags?.oversizePermit || special.includes('permit') ||
        special.includes('oversize') || special.includes('escort')) {
      return { freightType: 'FTL_FLATBED', confidence: 75 }
    }
    
    // Default
    return { freightType: 'FTL_DRY_VAN', confidence: 70 }
  }
  
  private step4_industryValidation(
    data: LoadData,
    freightType: any,
    industryFlags: any
  ): {
    isValid: boolean
    criticalIssues: Array<{
      field: string
      issue: 'missing' | 'insufficient' | 'invalid'
      message: string
    }>
    confidence: number
  } {
    // Basic validation
    const basic = FreightValidator.validateRequiredFields(data, freightType)
    const semantic = EnhancedFreightValidator.validateSemantics(data, freightType)
    
    const issues = [
      ...basic.missingFields.map(field => ({
        field,
        issue: 'missing' as const,
        message: `${FreightValidator.getFieldDisplayName(field)} is required`
      })),
      ...semantic
    ]
    
    // Add industry-specific validations
    if (industryFlags?.crossBorder && (!data.commodity || data.commodity.length < 10)) {
      issues.push({
        field: 'commodity',
        issue: 'insufficient',
        message: 'Cross-border shipments require detailed commodity description for customs'
      })
    }
    
    if (industryFlags?.appointmentCritical && !data.pickup_date?.includes('AM') && 
        !data.pickup_date?.includes('PM') && !data.pickup_date?.includes(':')) {
      issues.push({
        field: 'pickup_date',
        issue: 'insufficient',
        message: 'Appointment loads require specific time, not just date'
      })
    }
    
    // Filter for critical issues
    const criticalIssues = issues.filter(issue => 
      issue.issue === 'missing' || 
      (issue.issue === 'insufficient' && 
       ['pickup_location', 'delivery_location', 'commodity', 'pickup_date'].includes(issue.field))
    )
    
    return {
      isValid: criticalIssues.length === 0,
      criticalIssues,
      confidence: issues.length === 0 ? 100 : Math.max(50, 100 - (issues.length * 10))
    }
  }
}
import { industryEdgeCases } from './test-freight-industry-edge-cases'
import { randomUUID } from 'crypto'

config({ path: path.join(__dirname, '../.env.local') })

async function testIndustryOptimized() {
  console.log('🚀 INDUSTRY-OPTIMIZED AGENT TESTING')
  console.log('==================================\n')
  console.log('Testing enhanced agent with industry-specific improvements\n')
  
  const agent = new TestIndustryOptimizedAgent()
  const results = {
    total: 0,
    correctAction: 0,
    correctFreightType: 0,
    correctNotLoad: 0,
    byCategory: {} as Record<string, { total: number, correct: number, details: string[] }>
  }
  
  for (const testCase of industryEdgeCases) {
    console.log(`\n📧 ${testCase.id}: ${testCase.description}`)
    console.log(`Category: ${testCase.category}`)
    
    try {
      const result = await agent.processEmail({
        ...testCase.email,
        to: 'broker@company.com'
      })
      
      results.total++
      
      // Track by category
      if (!results.byCategory[testCase.category]) {
        results.byCategory[testCase.category] = { total: 0, correct: 0, details: [] }
      }
      results.byCategory[testCase.category].total++
      
      // Check results
      const actionCorrect = result.finalAction === testCase.expectedAction
      if (actionCorrect) {
        results.correctAction++
        results.byCategory[testCase.category].correct++
      } else {
        results.byCategory[testCase.category].details.push(
          `${testCase.id}: Expected ${testCase.expectedAction}, got ${result.finalAction}`
        )
      }
      
      if (testCase.expectedFreightType && result.freightType === testCase.expectedFreightType) {
        results.correctFreightType++
      }
      
      if (!testCase.expectedFreightType && !result.isLoadRequest) {
        results.correctNotLoad++
      }
      
      console.log(`Action: ${result.finalAction} ${actionCorrect ? '✅' : '❌'}`)
      if (result.isLoadRequest && result.freightType) {
        console.log(`Freight Type: ${result.freightType} ${result.freightType === testCase.expectedFreightType ? '✅' : '❌'}`)
      }
      
      // Show industry flags if present
      if (result.industryFlags && Object.keys(result.industryFlags).length > 0) {
        console.log(`Industry Flags: ${JSON.stringify(result.industryFlags)}`)
      }
      
      if (!actionCorrect) {
        console.log(`❌ Expected: ${testCase.expectedAction}`)
        if (result.clarificationNeeded?.length) {
          console.log(`Clarification: ${result.clarificationNeeded.join(', ')}`)
        }
      }
      
    } catch (error: any) {
      console.error(`Error: ${error.message}`)
      results.byCategory[testCase.category].details.push(
        `${testCase.id}: Error - ${error.message}`
      )
    }
    
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  // Summary
  console.log('\n\n📊 OPTIMIZED SYSTEM RESULTS')
  console.log('==========================')
  console.log(`Total Tests: ${results.total}`)
  console.log(`Action Accuracy: ${results.correctAction}/${results.total} (${(results.correctAction/results.total*100).toFixed(1)}%)`)
  
  console.log('\n📈 Performance by Category:')
  for (const [category, stats] of Object.entries(results.byCategory)) {
    const accuracy = (stats.correct/stats.total*100).toFixed(1)
    console.log(`${category}: ${stats.correct}/${stats.total} (${accuracy}%)`)
    if (stats.details.length > 0 && stats.correct < stats.total) {
      stats.details.forEach(detail => console.log(`  - ${detail}`))
    }
  }
  
  console.log('\n🔄 Comparison:')
  console.log('Original System: 60.9% accuracy')
  console.log(`Optimized System: ${(results.correctAction/results.total*100).toFixed(1)}% accuracy`)
  
  const improvement = ((results.correctAction/results.total) - 0.609) * 100
  if (improvement > 0) {
    console.log(`✅ Improvement: +${improvement.toFixed(1)}% accuracy`)
  } else {
    console.log(`❌ Needs more optimization: ${improvement.toFixed(1)}% change`)
  }
  
  // Identify remaining problem areas
  const stillProblematic = Object.entries(results.byCategory)
    .filter(([_, stats]) => stats.correct / stats.total < 0.8)
    .map(([category]) => category)
  
  if (stillProblematic.length > 0) {
    console.log('\n🔧 Areas still needing work:')
    stillProblematic.forEach(cat => console.log(`- ${cat}`))
  }
}

// Run the test
testIndustryOptimized().catch(console.error)