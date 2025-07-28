/**
 * Run Industry Edge Case Tests
 * 
 * Tests the optimized system against real freight industry scenarios
 */

import { config } from 'dotenv'
import * as path from 'path'
import { OpenAI } from 'openai'
import { FreightValidator, LoadData } from '../lib/freight-types/freight-validator'
import { EnhancedFreightValidator } from '../lib/freight-types/enhanced-validator'
import { industryEdgeCases } from './test-freight-industry-edge-cases'

config({ path: path.join(__dirname, '../.env.local') })

// Test version of optimized agent without database
class TestOptimizedAgent {
  private openai: OpenAI
  
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  }
  
  async processEmail(emailData: any) {
    // Step 1: Classification
    const step1 = await this.classifyEmail(emailData)
    if (!step1.isLoadRequest) {
      return { 
        finalAction: 'ignore', 
        isLoadRequest: false,
        reason: step1.reason 
      }
    }
    
    // Step 2: Extraction
    const step2 = await this.extractData(emailData)
    if (!step2.extractedData) {
      return { 
        finalAction: 'ignore',
        isLoadRequest: true,
        extractedData: null
      }
    }
    
    // Step 3: Freight Type
    const step3 = this.identifyFreightType(step2.extractedData)
    
    // Step 4: Validation
    const step4 = this.validateData(step2.extractedData, step3.freightType)
    
    const criticalIssues = step4.issues.filter(issue => 
      issue.issue === 'missing' || 
      (issue.issue === 'insufficient' && ['pickup_location', 'delivery_location', 'commodity'].includes(issue.field))
    )
    
    return {
      isLoadRequest: true,
      extractedData: step2.extractedData,
      freightType: step3.freightType,
      finalAction: criticalIssues.length === 0 ? 'proceed_to_quote' : 'request_clarification',
      issues: step4.issues,
      criticalIssues
    }
  }
  
  private async classifyEmail(emailData: any) {
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
- "Truck available in Chicago" → Carrier capacity
- "Annual contract RFP" → Long-term contracts

Examples:
✅ "Need to ship 40k lbs Chicago to Dallas tomorrow" → Specific, immediate
✅ "Quote needed: 2 pallets NYC to Boston, pickup Friday" → Clear request
❌ "We ship 10 loads/month from Chicago" → General info
❌ "Planning Q3 shipments" → Future planning
❌ "I have a truck available" → Carrier offering capacity

Return JSON: { "is_load_request": boolean, "reason": "brief explanation" }`

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
      reason: result.reason || 'No reason provided'
    }
  }
  
  private async extractData(emailData: any) {
    const systemPrompt = `Extract freight information from emails. Extract ONLY what is explicitly written.

IMPORTANT: Multi-stop loads are common. Extract ALL pickup and delivery locations mentioned.

Extract exactly what's written - include vague information as-is.
Set to null ONLY if completely absent.

For multi-stop loads:
- If multiple pickups: extract first as pickup_location, note others in special_requirements
- If multiple deliveries: extract first as delivery_location, note others in special_requirements

Fields to extract:
- pickup_location: First or primary pickup location
- delivery_location: First or primary delivery location  
- weight: Total weight in pounds (convert tons: 1 ton = 2000 lbs)
- commodity: What's being shipped
- pickup_date: When pickup is needed
- equipment_type: Trailer type (dry van, reefer, flatbed, etc.)
- temperature: Only if explicitly required
- dimensions: Length x Width x Height if mentioned
- special_requirements: Multi-stops, appointments, accessorials, etc.
- hazmat info if mentioned

Return JSON with "extracted_data".`

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
    
    // Parse weight
    if (result.extracted_data?.weight && typeof result.extracted_data.weight === 'string') {
      const match = result.extracted_data.weight.match(/[\d,]+/)
      if (match) {
        result.extracted_data.weight = parseInt(match[0].replace(/,/g, ''))
      }
    }
    
    return { extractedData: result.extracted_data || null }
  }
  
  private identifyFreightType(data: LoadData) {
    const equipment = data.equipment_type?.toLowerCase() || ''
    
    // Check for explicit equipment types
    if (equipment.includes('dry van') || equipment === 'van' || 
        equipment.includes('vented')) {
      return { freightType: 'FTL_DRY_VAN' as const }
    }
    
    if (equipment.includes('reefer') || equipment.includes('refrigerated') ||
        equipment.includes('multi-temp')) {
      return { freightType: 'FTL_REEFER' as const }
    }
    
    if (equipment.includes('flatbed') || equipment.includes('step deck') ||
        equipment.includes('conestoga') || equipment.includes('rgn')) {
      return { freightType: 'FTL_FLATBED' as const }
    }
    
    if (equipment.includes('sprinter') || equipment.includes('cargo van')) {
      return { freightType: 'LTL' as const } // Small expedited
    }
    
    // Check for hazmat
    if (data.hazmat_class || data.un_number) {
      return { freightType: 'FTL_HAZMAT' as const }
    }
    
    // Check weight
    if (data.weight) {
      if (data.freight_class || data.piece_count) {
        return { freightType: 'LTL' as const }
      }
      if (data.weight < 5000) {
        return { freightType: 'LTL' as const }
      }
      if (data.weight >= 5000 && data.weight <= 15000) {
        return { freightType: 'PARTIAL' as const }
      }
    }
    
    // Temperature without equipment
    if (!equipment && data.temperature) {
      return { freightType: 'FTL_REEFER' as const }
    }
    
    // Check for special requirements that might indicate freight type
    const special = data.special_requirements?.toLowerCase() || ''
    if (special.includes('blanket wrap')) {
      return { freightType: 'PARTIAL' as const }
    }
    
    return { freightType: 'FTL_DRY_VAN' as const }
  }
  
  private validateData(data: LoadData, freightType: any) {
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
    
    return { issues }
  }
}

// Run tests
async function runIndustryEdgeCaseTests() {
  console.log('🚛 FREIGHT INDUSTRY EDGE CASE TESTING')
  console.log('====================================\n')
  
  const agent = new TestOptimizedAgent()
  const results = {
    total: 0,
    correctAction: 0,
    correctFreightType: 0,
    correctNotLoad: 0,
    byCategory: {} as Record<string, { total: number, correct: number }>
  }
  
  for (const testCase of industryEdgeCases) {
    console.log(`\n📧 ${testCase.id}: ${testCase.description}`)
    console.log(`Category: ${testCase.category}`)
    console.log(`Context: ${testCase.businessContext}`)
    
    try {
      const result = await agent.processEmail(testCase.email)
      results.total++
      
      // Track by category
      if (!results.byCategory[testCase.category]) {
        results.byCategory[testCase.category] = { total: 0, correct: 0 }
      }
      results.byCategory[testCase.category].total++
      
      // Check results
      const actionCorrect = result.finalAction === testCase.expectedAction
      if (actionCorrect) {
        results.correctAction++
        results.byCategory[testCase.category].correct++
      }
      
      if (testCase.expectedFreightType && result.freightType === testCase.expectedFreightType) {
        results.correctFreightType++
      }
      
      if (!testCase.expectedFreightType && !result.isLoadRequest) {
        results.correctNotLoad++
      }
      
      console.log(`Result: ${result.finalAction} ${actionCorrect ? '✅' : '❌'}`)
      if (result.isLoadRequest) {
        console.log(`Freight Type: ${result.freightType} ${result.freightType === testCase.expectedFreightType ? '✅' : '❌'}`)
      }
      
      if (!actionCorrect) {
        console.log(`Expected: ${testCase.expectedAction}`)
        if (result.criticalIssues?.length) {
          console.log(`Critical Issues: ${result.criticalIssues.map(i => i.field).join(', ')}`)
        }
        console.log(`Industry Note: ${testCase.industryNotes}`)
      }
      
    } catch (error: any) {
      console.error(`Error: ${error.message}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  // Summary
  console.log('\n\n📊 INDUSTRY EDGE CASE TEST RESULTS')
  console.log('==================================')
  console.log(`Total Tests: ${results.total}`)
  console.log(`Action Accuracy: ${results.correctAction}/${results.total} (${(results.correctAction/results.total*100).toFixed(1)}%)`)
  
  console.log('\n📈 Performance by Category:')
  for (const [category, stats] of Object.entries(results.byCategory)) {
    const accuracy = (stats.correct/stats.total*100).toFixed(1)
    console.log(`${category}: ${stats.correct}/${stats.total} (${accuracy}%)`)
  }
  
  console.log('\n🔍 Problem Areas Identified:')
  const problemAreas = Object.entries(results.byCategory)
    .filter(([_, stats]) => stats.correct / stats.total < 0.8)
    .map(([category]) => category)
  
  if (problemAreas.length > 0) {
    console.log('Categories needing optimization:')
    problemAreas.forEach(cat => console.log(`- ${cat}`))
  } else {
    console.log('All categories performing well!')
  }
}

runIndustryEdgeCaseTests().catch(console.error)