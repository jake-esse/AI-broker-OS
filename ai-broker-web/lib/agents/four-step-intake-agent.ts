/**
 * Four-Step Sequential Email Intake Agent
 * 
 * Implements the exact 4-step process:
 * 1. Load Classification - Is this a load RFQ from a shipper?
 * 2. Information Extraction - Extract all information present
 * 3. Freight Type Identification - What kind of load is it?
 * 4. Validation - Is all required information present for this freight type?
 */

import { OpenAI } from 'openai'
import { FreightValidator, FreightType, LoadData } from '@/lib/freight-types/freight-validator'
import { EnhancedFreightValidator } from '@/lib/freight-types/enhanced-validator'

export interface FourStepResult {
  // Step 1: Classification
  isLoadRequest: boolean
  classificationConfidence: number
  classificationReason: string
  
  // Step 2: Extraction (only if isLoadRequest)
  extractedData?: LoadData
  extractionConfidence?: number
  
  // Step 3: Freight Type (only if data extracted)
  freightType?: FreightType
  freightTypeConfidence?: number
  
  // Step 4: Validation (only if freight type identified)
  isValid?: boolean
  missingFields?: string[]
  validationIssues?: Array<{
    field: string
    issue: 'missing' | 'insufficient' | 'invalid'
    value?: any
    message: string
  }>
  
  // Final decision
  finalAction: 'proceed_to_quote' | 'request_clarification' | 'ignore'
  finalConfidence: number
  clarificationNeeded?: string[]
}

export class FourStepIntakeAgent {
  private openai: OpenAI
  private step1Model: string
  private step2Model: string
  private step3Model: string
  
  constructor(options?: {
    step1Model?: string
    step2Model?: string
    step3Model?: string
  }) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    
    this.openai = new OpenAI({ apiKey })
    
    // Allow model configuration per step
    this.step1Model = options?.step1Model || process.env.STEP1_MODEL || 'gpt-4o-mini'
    this.step2Model = options?.step2Model || process.env.STEP2_MODEL || 'gpt-4o'
    this.step3Model = options?.step3Model || process.env.STEP3_MODEL || 'gpt-4o-mini'
  }
  
  async processEmail(emailData: {
    from: string
    to: string
    subject: string
    content: string
  }): Promise<FourStepResult> {
    console.log('\n📧 Four-Step Email Processing Started')
    console.log('=====================================')
    
    // STEP 1: Load Classification
    const step1Result = await this.step1_classifyEmail(emailData)
    console.log(`\n✅ Step 1 Complete: ${step1Result.isLoadRequest ? 'IS' : 'NOT'} a load request (${step1Result.confidence}% confidence)`)
    
    if (!step1Result.isLoadRequest) {
      return {
        isLoadRequest: false,
        classificationConfidence: step1Result.confidence,
        classificationReason: step1Result.reason,
        finalAction: 'ignore',
        finalConfidence: step1Result.confidence
      }
    }
    
    // STEP 2: Information Extraction
    const step2Result = await this.step2_extractInformation(emailData)
    console.log(`\n✅ Step 2 Complete: Extracted ${Object.keys(step2Result.extractedData || {}).length} fields`)
    
    if (!step2Result.extractedData || Object.keys(step2Result.extractedData).length === 0) {
      return {
        isLoadRequest: true,
        classificationConfidence: step1Result.confidence,
        classificationReason: step1Result.reason,
        extractedData: step2Result.extractedData,
        extractionConfidence: step2Result.confidence,
        finalAction: 'ignore',
        finalConfidence: Math.min(step1Result.confidence, step2Result.confidence || 0),
        clarificationNeeded: ['Unable to extract any freight information']
      }
    }
    
    // STEP 3: Freight Type Identification
    const step3Result = await this.step3_identifyFreightType(step2Result.extractedData)
    console.log(`\n✅ Step 3 Complete: Identified as ${step3Result.freightType} (${step3Result.confidence}% confidence)`)
    
    // STEP 4: Validation
    const step4Result = await this.step4_validateInformation(
      step2Result.extractedData,
      step3Result.freightType
    )
    console.log(`\n✅ Step 4 Complete: ${step4Result.isValid ? 'VALID' : 'INVALID'} - ${step4Result.issues.length} issues found`)
    
    // Determine final action based on validation
    let finalAction: 'proceed_to_quote' | 'request_clarification' | 'ignore'
    let clarificationNeeded: string[] = []
    
    if (step4Result.isValid) {
      finalAction = 'proceed_to_quote'
    } else {
      // Check if we have critical issues
      const criticalIssues = step4Result.issues.filter(issue => 
        issue.issue === 'missing' || 
        (issue.issue === 'insufficient' && ['pickup_location', 'delivery_location', 'commodity'].includes(issue.field))
      )
      
      if (criticalIssues.length > 0) {
        finalAction = 'request_clarification'
        clarificationNeeded = criticalIssues.map(issue => {
          if (issue.issue === 'missing') {
            return FreightValidator.getFieldDisplayName(issue.field)
          } else {
            return `${FreightValidator.getFieldDisplayName(issue.field)} - ${issue.message}`
          }
        })
      } else {
        // Only warnings, proceed anyway
        finalAction = 'proceed_to_quote'
      }
    }
    
    // Calculate final confidence as minimum of all steps
    const finalConfidence = Math.min(
      step1Result.confidence,
      step2Result.confidence || 100,
      step3Result.confidence,
      step4Result.confidence
    )
    
    return {
      isLoadRequest: true,
      classificationConfidence: step1Result.confidence,
      classificationReason: step1Result.reason,
      extractedData: step2Result.extractedData,
      extractionConfidence: step2Result.confidence,
      freightType: step3Result.freightType,
      freightTypeConfidence: step3Result.confidence,
      isValid: step4Result.isValid,
      missingFields: step4Result.missingFields,
      validationIssues: step4Result.issues,
      finalAction,
      finalConfidence,
      clarificationNeeded
    }
  }
  
  // STEP 1: Load Classification
  private async step1_classifyEmail(emailData: any): Promise<{
    isLoadRequest: boolean
    confidence: number
    reason: string
  }> {
    const systemPrompt = `You are a freight broker's email classifier. Your ONLY job is to determine if an email is a NEW load quote request from a shipper.

CLASSIFICATION RULES:
- IS a load request: Shipper asking for transportation quote/pricing for a specific shipment
- NOT a load request: Rate negotiations, invoices, status updates, general inquiries, responses to previous quotes

Key indicators of a load request:
- Mentions specific pickup and delivery locations
- Includes cargo details (weight, commodity, equipment)
- Asks for pricing/quote/rate
- Mentions pickup dates or urgency

Return JSON: { "is_load_request": boolean, "confidence": 0-100, "reason": "brief explanation" }`

    const userPrompt = `Classify this email:
Subject: ${emailData.subject}
From: ${emailData.from}
Body: ${emailData.content}`

    const completion = await this.openai.chat.completions.create({
      model: this.step1Model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
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
  
  // STEP 2: Information Extraction
  private async step2_extractInformation(emailData: any): Promise<{
    extractedData: LoadData | null
    confidence: number
  }> {
    const systemPrompt = `You are extracting freight information from emails. Extract ONLY what is explicitly written.

EXTRACTION RULES:
1. Extract exactly what's written - do not interpret or validate
2. Include vague information as-is (e.g., "near airport", "Dallas area")
3. Set to null ONLY if information is completely absent
4. Do not judge if information is sufficient

Fields to extract:
- pickup_location: Full pickup address/description as written
- pickup_city, pickup_state, pickup_zip: Parse from pickup location if possible
- delivery_location: Full delivery address/description as written  
- delivery_city, delivery_state, delivery_zip: Parse from delivery location if possible
- weight: In pounds (convert tons: 1 ton = 2000 lbs)
- commodity: What's being shipped (even if generic like "goods")
- pickup_date: When pickup is needed
- equipment_type: Trailer type mentioned (dry van, reefer, flatbed, etc.)
- temperature: Only if explicitly required (min/max in F or C)
- dimensions: Length x Width x Height if mentioned
- piece_count: Number of pieces/pallets
- hazmat_class, un_number, etc.: Only if hazmat is mentioned

Return all found information as JSON with "extracted_data" and "confidence" fields.`

    const userPrompt = `Extract freight information from:
Subject: ${emailData.subject}
From: ${emailData.from}
Body: ${emailData.content}`

    const completion = await this.openai.chat.completions.create({
      model: this.step2Model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500
    })
    
    const result = JSON.parse(completion.choices[0].message.content || '{}')
    return {
      extractedData: result.extracted_data || null,
      confidence: result.confidence || 50
    }
  }
  
  // STEP 3: Freight Type Identification
  private async step3_identifyFreightType(extractedData: LoadData): Promise<{
    freightType: FreightType
    confidence: number
  }> {
    const systemPrompt = `You are identifying freight types based on extracted shipment data.

FREIGHT TYPES:
1. FTL_DRY_VAN - Standard full truckload, dry goods, enclosed trailer
2. FTL_REEFER - Temperature-controlled, refrigerated trailer
3. FTL_FLATBED - Open trailer for oversized/heavy items
4. FTL_HAZMAT - Hazardous materials requiring special handling
5. LTL - Less than truckload (150-15,000 lbs, multiple shipments)
6. PARTIAL - Between LTL and full truck (5,000-30,000 lbs)
7. UNKNOWN - Cannot determine type

IDENTIFICATION RULES:
1. Prioritize explicit equipment type mentions
2. Consider temperature requirements for reefer
3. Check weight ranges for LTL vs Partial vs FTL
4. Look for hazmat indicators
5. Default to FTL_DRY_VAN for standard shipments

Return JSON: { "freight_type": "TYPE", "confidence": 0-100, "reasoning": "explanation" }`

    const userPrompt = `Identify freight type for this shipment:
${JSON.stringify(extractedData, null, 2)}`

    const completion = await this.openai.chat.completions.create({
      model: this.step3Model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500
    })
    
    const result = JSON.parse(completion.choices[0].message.content || '{}')
    
    // Also use our deterministic freight validator as a fallback
    const validatorType = FreightValidator.identifyFreightType(extractedData)
    
    // If LLM is very confident, use its result, otherwise use validator
    if (result.confidence >= 80) {
      return {
        freightType: result.freight_type || validatorType,
        confidence: result.confidence || 50
      }
    } else {
      return {
        freightType: validatorType,
        confidence: 90 // High confidence in our rule-based system
      }
    }
  }
  
  // STEP 4: Validation
  private async step4_validateInformation(
    extractedData: LoadData,
    freightType: FreightType
  ): Promise<{
    isValid: boolean
    missingFields: string[]
    issues: Array<{
      field: string
      issue: 'missing' | 'insufficient' | 'invalid'
      value?: any
      message: string
    }>
    confidence: number
  }> {
    // Use both basic and enhanced validation
    const basicValidation = FreightValidator.validateRequiredFields(extractedData, freightType)
    const semanticIssues = EnhancedFreightValidator.validateSemantics(extractedData, freightType)
    
    // Combine all issues
    const allIssues: Array<{
      field: string
      issue: 'missing' | 'insufficient' | 'invalid'
      value?: any
      message: string
    }> = [
      // Missing fields from basic validation
      ...basicValidation.missingFields.map(field => ({
        field,
        issue: 'missing' as const,
        message: `${FreightValidator.getFieldDisplayName(field)} is required`
      })),
      // Semantic issues
      ...semanticIssues
    ]
    
    // Check if critical issues exist
    const criticalIssues = allIssues.filter(issue => 
      issue.issue === 'missing' || 
      (issue.issue === 'insufficient' && ['pickup_location', 'delivery_location', 'commodity'].includes(issue.field))
    )
    
    return {
      isValid: criticalIssues.length === 0,
      missingFields: basicValidation.missingFields,
      issues: allIssues,
      confidence: allIssues.length === 0 ? 100 : Math.max(50, 100 - (allIssues.length * 10))
    }
  }
}