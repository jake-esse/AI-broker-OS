/**
 * Final Optimized System Test
 * 
 * Fixes extraction issues and properly handles industry edge cases
 */

import { config } from 'dotenv'
import * as path from 'path'
import { OpenAI } from 'openai'
import { FreightValidator, LoadData } from '../lib/freight-types/freight-validator'
import { EnhancedFreightValidator } from '../lib/freight-types/enhanced-validator'
import { industryEdgeCases } from './test-freight-industry-edge-cases'

config({ path: path.join(__dirname, '../.env.local') })

class FinalOptimizedAgent {
  private openai: OpenAI
  
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  }
  
  async processEmail(emailData: any) {
    // Step 1: Classification
    const step1 = await this.classifyEmail(emailData)
    if (!step1.isLoadRequest) {
      return { finalAction: 'ignore', isLoadRequest: false, reason: step1.reason }
    }
    
    // Step 2: Extraction with proper field mapping
    const step2 = await this.extractData(emailData)
    if (!step2.extractedData || Object.keys(step2.extractedData).length === 0) {
      return { finalAction: 'ignore', isLoadRequest: true, extractedData: null }
    }
    
    // Step 3: Freight Type
    const step3 = this.identifyFreightType(step2.extractedData, step2.industryFlags)
    
    // Step 4: Validation
    const step4 = this.validateData(step2.extractedData, step3.freightType, step2.industryFlags)
    
    // Determine action with industry awareness
    let finalAction: 'proceed_to_quote' | 'request_clarification' | 'ignore'
    let clarificationNeeded: string[] = []
    
    // Industry-specific handling
    if (step2.industryFlags?.multiStop) {
      finalAction = 'request_clarification'
      clarificationNeeded.push('Multi-stop routing details needed')
    } else if (step2.industryFlags?.crossBorder && (!step2.extractedData.commodity || step2.extractedData.commodity.length < 10)) {
      finalAction = 'request_clarification'
      clarificationNeeded.push('Detailed commodity description for customs')
    } else if (step2.industryFlags?.blanketWrap && !step2.extractedData.commodity) {
      finalAction = 'request_clarification'
      clarificationNeeded.push('Commodity Description', 'Value declaration for blanket wrap service')
    } else if (step2.industryFlags?.cubeOut && !step2.extractedData.dimensions) {
      finalAction = 'request_clarification'
      clarificationNeeded.push('Dimensions (L x W x H)')
    } else if (step4.criticalIssues.length === 0) {
      finalAction = 'proceed_to_quote'
    } else {
      finalAction = 'request_clarification'
      clarificationNeeded = step4.criticalIssues.map(i => FreightValidator.getFieldDisplayName(i.field))
    }
    
    return {
      isLoadRequest: true,
      extractedData: step2.extractedData,
      freightType: step3.freightType,
      finalAction,
      clarificationNeeded,
      industryFlags: step2.industryFlags
    }
  }
  
  private async classifyEmail(emailData: any) {
    const systemPrompt = `Classify if this is a NEW freight load request.

IS a load when:
- Specific cargo needs transportation now/soon
- Has pickup/delivery details (even multiple stops)
- Requesting quote for actual shipment

NOT a load:
- Carrier offering capacity ("truck available")
- Payment disputes or detention invoices
- Annual contract RFPs
- General inquiries

Multi-stop loads ARE valid load requests.
Cross-border shipments ARE valid load requests.
Expedited/team runs ARE valid load requests.

Return JSON: { "is_load_request": boolean, "reason": "explanation" }`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Subject: ${emailData.subject}\nFrom: ${emailData.from}\n\n${emailData.content}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 300
    })
    
    const result = JSON.parse(completion.choices[0].message.content || '{}')
    return { isLoadRequest: result.is_load_request || false, reason: result.reason }
  }
  
  private async extractData(emailData: any) {
    const systemPrompt = `Extract freight information from this email. Be comprehensive and handle industry variations.

MUST extract these EXACT field names in extracted_data object:
- pickup_location: string (first pickup if multiple)
- delivery_location: string (first delivery if multiple)
- weight: number in pounds (convert tons to lbs)
- commodity: string (what's being shipped)
- pickup_date: string (when pickup needed)
- equipment_type: string (trailer type as stated)
- pickup_city, pickup_state, pickup_zip: parse from location
- delivery_city, delivery_state, delivery_zip: parse from location
- temperature: { min?: number, max?: number, unit: 'F'|'C' } if mentioned
- dimensions: { length: number, width: number, height: number } if mentioned
- piece_count: number if mentioned
- freight_class: string if mentioned (for LTL)
- hazmat_class: string if hazmat
- un_number: string if hazmat
- special_requirements: string (multi-stops, appointments, accessorials, etc.)

ALSO return industry_flags object with boolean fields:
- multiStop: true if multiple pickups or deliveries
- crossBorder: true if US/Canada/Mexico crossing
- expedited: true if urgent/team/hot shot
- appointmentCritical: true if strict appointment time
- blanketWrap: true if mentioned
- oversizePermit: true if oversize/overweight
- limitedQuantityHazmat: true if limited qty hazmat
- cubeOut: true if light weight but full trailer

Return JSON with extracted_data and industry_flags objects.`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract from:\nSubject: ${emailData.subject}\n\n${emailData.content}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2000
    })
    
    const result = JSON.parse(completion.choices[0].message.content || '{}')
    
    // Fix weight parsing
    if (result.extracted_data?.weight && typeof result.extracted_data.weight === 'string') {
      const match = result.extracted_data.weight.match(/[\d,]+/)
      if (match) {
        result.extracted_data.weight = parseInt(match[0].replace(/,/g, ''))
      }
    }
    
    return {
      extractedData: result.extracted_data || null,
      industryFlags: result.industry_flags || {}
    }
  }
  
  private identifyFreightType(data: LoadData, flags: any) {
    const equipment = data.equipment_type?.toLowerCase() || ''
    const commodity = data.commodity?.toLowerCase() || ''
    const special = data.special_requirements?.toLowerCase() || ''
    
    // Hazmat takes priority
    if (data.hazmat_class || data.un_number || flags?.limitedQuantityHazmat) {
      return { freightType: 'FTL_HAZMAT' as const }
    }
    
    // Equipment-based determination
    if (equipment.includes('dry van') || equipment === 'van' || equipment.includes('vented')) {
      return { freightType: 'FTL_DRY_VAN' as const }
    }
    
    if (equipment.includes('reefer') || equipment.includes('refrigerated') ||
        equipment.includes('multi-temp') || equipment.includes('protect from freeze')) {
      return { freightType: 'FTL_REEFER' as const }
    }
    
    if (equipment.includes('flatbed') || equipment.includes('step deck') ||
        equipment.includes('conestoga') || equipment.includes('rgn')) {
      return { freightType: 'FTL_FLATBED' as const }
    }
    
    if (equipment.includes('sprinter') || equipment.includes('cargo van')) {
      return { freightType: 'LTL' as const }
    }
    
    // Weight-based
    if (data.weight) {
      if (flags?.blanketWrap || special.includes('blanket wrap')) {
        return { freightType: 'PARTIAL' as const }
      }
      
      if (data.freight_class || (data.piece_count && data.weight < 15000)) {
        return { freightType: 'LTL' as const }
      }
      
      if (data.weight < 5000) {
        return { freightType: 'LTL' as const }
      }
      
      if (data.weight >= 5000 && data.weight <= 15000) {
        return { freightType: 'PARTIAL' as const }
      }
      
      // Light but full trailer
      if (data.weight < 10000 && flags?.cubeOut) {
        return { freightType: 'FTL_DRY_VAN' as const }
      }
    }
    
    // Temperature without equipment
    if (data.temperature && !equipment) {
      return { freightType: 'FTL_REEFER' as const }
    }
    
    // Oversize defaults to flatbed
    if (flags?.oversizePermit) {
      return { freightType: 'FTL_FLATBED' as const }
    }
    
    return { freightType: 'FTL_DRY_VAN' as const }
  }
  
  private validateData(data: LoadData, freightType: any, flags: any) {
    const basic = FreightValidator.validateRequiredFields(data, freightType)
    const semantic = EnhancedFreightValidator.validateSemantics(data, freightType)
    
    const issues = [
      ...basic.missingFields.map(field => ({
        field,
        issue: 'missing' as const
      })),
      ...semantic
    ]
    
    // Special validations
    if (flags?.appointmentCritical && data.pickup_date && 
        !data.pickup_date.match(/\d+:\d+|AM|PM/i)) {
      issues.push({
        field: 'pickup_date',
        issue: 'insufficient'
      })
    }
    
    const criticalIssues = issues.filter(i => 
      i.issue === 'missing' || 
      (i.issue === 'insufficient' && ['pickup_location', 'delivery_location', 'commodity'].includes(i.field))
    )
    
    return { criticalIssues }
  }
}

// Run final tests
async function runFinalOptimizedTests() {
  console.log('🎯 FINAL OPTIMIZED SYSTEM TEST')
  console.log('==============================\n')
  
  const agent = new FinalOptimizedAgent()
  const results = {
    total: 0,
    correct: 0,
    byCategory: {} as Record<string, { total: number, correct: number }>
  }
  
  // Test all cases
  const testSubset = industryEdgeCases
  
  for (const testCase of testSubset) {
    console.log(`\n${testCase.id}: ${testCase.description}`)
    
    try {
      const result = await agent.processEmail(testCase.email)
      results.total++
      
      if (!results.byCategory[testCase.category]) {
        results.byCategory[testCase.category] = { total: 0, correct: 0 }
      }
      results.byCategory[testCase.category].total++
      
      const correct = result.finalAction === testCase.expectedAction
      if (correct) {
        results.correct++
        results.byCategory[testCase.category].correct++
      }
      
      console.log(`Action: ${result.finalAction} ${correct ? '✅' : '❌'}`)
      if (result.freightType && testCase.expectedFreightType) {
        console.log(`Freight: ${result.freightType} ${result.freightType === testCase.expectedFreightType ? '✅' : '❌'}`)
      }
      
      if (!correct) {
        console.log(`Expected: ${testCase.expectedAction}`)
        if (result.clarificationNeeded?.length) {
          console.log(`Clarification: ${result.clarificationNeeded.join(', ')}`)
        }
      }
      
    } catch (error: any) {
      console.error(`Error: ${error.message}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  console.log(`\n\n📊 FINAL RESULTS`)
  console.log(`================`)
  console.log(`Overall: ${results.correct}/${results.total} (${(results.correct/results.total*100).toFixed(1)}%)`)
  
  console.log('\nBy Category:')
  for (const [cat, stats] of Object.entries(results.byCategory)) {
    console.log(`${cat}: ${stats.correct}/${stats.total} (${(stats.correct/stats.total*100).toFixed(1)}%)`)
  }
  
  console.log('\n🔄 Progress:')
  console.log('Basic System: 100% on simple tests')
  console.log('Industry Tests v1: 60.9%')
  console.log(`Final Optimized: ${(results.correct/results.total*100).toFixed(1)}%`)
}

runFinalOptimizedTests().catch(console.error)