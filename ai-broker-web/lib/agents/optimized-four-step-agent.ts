/**
 * Optimized Four-Step Sequential Email Intake Agent
 * 
 * Incorporates all optimizations discovered through testing:
 * 1. Load Classification - Optimized prompt with clear examples
 * 2. Information Extraction - Keep current approach (100% accuracy)
 * 3. Freight Type Identification - Rules-first approach
 * 4. Validation - Enhanced semantic validation
 * 
 * Model choices:
 * - Step 1: gpt-4o-mini (fast, accurate for classification)
 * - Step 2: gpt-4o (best extraction accuracy)
 * - Step 3: Deterministic rules (no LLM needed)
 * - Step 4: Rule-based validation
 */

import { OpenAI } from 'openai'
import prisma from '@/lib/prisma'
import { FreightValidator, FreightType, LoadData } from '@/lib/freight-types/freight-validator'
import { EnhancedFreightValidator } from '@/lib/freight-types/enhanced-validator'

export interface OptimizedFourStepResult {
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
  
  // For database creation
  loadId?: string
}

export class OptimizedFourStepAgent {
  private openai: OpenAI
  
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    
    this.openai = new OpenAI({ apiKey })
  }
  
  async processEmail(emailData: {
    from: string
    to: string
    subject: string
    content: string
    brokerId: string
    inReplyTo?: string
    references?: string
    messageId?: string
  }, emailId?: string): Promise<OptimizedFourStepResult> {
    console.log('\n📧 Optimized Four-Step Email Processing')
    console.log('=====================================')
    
    // Check if this is a clarification response first
    const { ClarificationResponseHandler } = await import('./clarification-response-handler')
    const responseResult = await ClarificationResponseHandler.processResponse(emailData, emailId)
    
    if (responseResult.isResponse) {
      console.log('Email is a clarification response')
      
      if (responseResult.loadCreated) {
        return {
          isLoadRequest: true,
          classificationConfidence: 95,
          classificationReason: 'Response to clarification request',
          extractedData: responseResult.mergedData,
          extractionConfidence: 95,
          freightType: responseResult.mergedData ? 
            this.step3_identifyFreightType(responseResult.mergedData).freightType : 'UNKNOWN',
          freightTypeConfidence: 90,
          isValid: true,
          finalAction: 'proceed_to_quote',
          finalConfidence: 95,
          loadId: responseResult.loadId
        }
      } else {
        return {
          isLoadRequest: true,
          classificationConfidence: 80,
          classificationReason: 'Partial response to clarification',
          extractedData: responseResult.mergedData,
          extractionConfidence: 80,
          freightType: responseResult.mergedData ? 
            this.step3_identifyFreightType(responseResult.mergedData).freightType : 'UNKNOWN',
          freightTypeConfidence: 80,
          isValid: false,
          missingFields: responseResult.validationResult?.missingFields,
          validationIssues: responseResult.validationResult?.missingFields?.map(f => ({
            field: f,
            issue: 'missing' as const,
            message: `${FreightValidator.getFieldDisplayName(f)} is still required`
          })),
          finalAction: 'request_clarification',
          finalConfidence: 80,
          clarificationNeeded: responseResult.validationResult?.missingFields?.map(f => 
            FreightValidator.getFieldDisplayName(f)
          )
        }
      }
    }
    
    // STEP 1: Load Classification with optimized prompt
    const step1Result = await this.step1_classifyEmail(emailData)
    console.log(`✅ Step 1: ${step1Result.isLoadRequest ? 'IS' : 'NOT'} a load (${step1Result.confidence}%)`)
    
    if (!step1Result.isLoadRequest) {
      return {
        isLoadRequest: false,
        classificationConfidence: step1Result.confidence,
        classificationReason: step1Result.reason,
        finalAction: 'ignore',
        finalConfidence: step1Result.confidence
      }
    }
    
    // STEP 2: Information Extraction (keep current approach)
    const step2Result = await this.step2_extractInformation(emailData)
    console.log(`✅ Step 2: Extracted ${Object.keys(step2Result.extractedData || {}).length} fields`)
    
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
    
    // STEP 3: Freight Type Identification with rules-first approach
    const step3Result = this.step3_identifyFreightType(step2Result.extractedData)
    console.log(`✅ Step 3: Identified as ${step3Result.freightType} (${step3Result.confidence}%)`)
    
    // STEP 4: Validation with enhanced semantic rules
    const step4Result = this.step4_validateInformation(
      step2Result.extractedData,
      step3Result.freightType
    )
    console.log(`✅ Step 4: ${step4Result.isValid ? 'VALID' : 'INVALID'} - ${step4Result.issues.length} issues`)
    
    // Determine final action
    let finalAction: 'proceed_to_quote' | 'request_clarification' | 'ignore'
    let clarificationNeeded: string[] = []
    let loadId: string | undefined
    
    const criticalIssues = step4Result.issues.filter(issue => 
      issue.issue === 'missing' || 
      (issue.issue === 'insufficient' && ['pickup_location', 'delivery_location', 'commodity'].includes(issue.field))
    )
    
    if (criticalIssues.length === 0) {
      finalAction = 'proceed_to_quote'
      // Create load in database
      try {
        loadId = await this.createLoad(
          step2Result.extractedData,
          step3Result.freightType,
          emailData
        )
      } catch (error) {
        console.error('Error creating load:', error)
      }
    } else {
      finalAction = 'request_clarification'
      clarificationNeeded = criticalIssues.map(issue => {
        if (issue.issue === 'missing') {
          return FreightValidator.getFieldDisplayName(issue.field)
        } else {
          return `${FreightValidator.getFieldDisplayName(issue.field)} - ${issue.message}`
        }
      })
    }
    
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
      clarificationNeeded,
      loadId
    }
  }
  
  // STEP 1: Optimized Load Classification
  private async step1_classifyEmail(emailData: any): Promise<{
    isLoadRequest: boolean
    confidence: number
    reason: string
  }> {
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

    const userPrompt = `Classify this email:
Subject: ${emailData.subject}
From: ${emailData.from}
Body: ${emailData.content}`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
  
  // STEP 2: Information Extraction (keep current approach - 100% accuracy)
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
- freight_class: For LTL shipments

Return all found information as JSON with "extracted_data" and "confidence" fields.`

    const userPrompt = `Extract freight information from:
Subject: ${emailData.subject}
From: ${emailData.from}
Body: ${emailData.content}`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o', // Best accuracy for extraction
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500
    })
    
    const result = JSON.parse(completion.choices[0].message.content || '{}')
    
    // Parse weight if it's a string
    if (result.extracted_data && result.extracted_data.weight) {
      if (typeof result.extracted_data.weight === 'string') {
        const weightMatch = result.extracted_data.weight.match(/[\d,]+/)
        if (weightMatch) {
          result.extracted_data.weight = parseInt(weightMatch[0].replace(/,/g, ''))
        }
      }
    }
    
    return {
      extractedData: result.extracted_data || null,
      confidence: result.confidence || 50
    }
  }
  
  // STEP 3: Optimized Freight Type Identification (rules-first)
  private step3_identifyFreightType(data: LoadData): {
    freightType: FreightType
    confidence: number
  } {
    // 1. Check explicit equipment type FIRST
    const equipment = data.equipment_type?.toLowerCase() || ''
    
    if (equipment.includes('dry van') || equipment === 'van' || 
        (equipment.includes('dry') && !equipment.includes('deck'))) {
      return { freightType: 'FTL_DRY_VAN', confidence: 95 }
    }
    
    if (equipment.includes('reefer') || equipment.includes('refrigerated')) {
      return { freightType: 'FTL_REEFER', confidence: 95 }
    }
    
    if (equipment.includes('flatbed') || equipment.includes('step deck') ||
        equipment.includes('rgn')) {
      return { freightType: 'FTL_FLATBED', confidence: 95 }
    }
    
    // 2. Check for hazmat
    if (data.hazmat_class || data.un_number || data.proper_shipping_name) {
      return { freightType: 'FTL_HAZMAT', confidence: 95 }
    }
    
    // 3. Check weight for LTL/Partial
    if (data.weight) {
      const weight = typeof data.weight === 'number' ? data.weight : 0
      
      if (data.freight_class) {
        return { freightType: 'LTL', confidence: 90 }
      }
      
      if (weight > 0 && weight < 5000) {
        return { freightType: 'LTL', confidence: 85 }
      }
      
      if (weight >= 5000 && weight <= 15000) {
        return { freightType: 'PARTIAL', confidence: 85 }
      }
      
      if (weight > 15000 && weight <= 30000 && !equipment) {
        return { freightType: 'PARTIAL', confidence: 80 }
      }
    }
    
    // 4. Temperature requirements WITHOUT equipment type
    if (!equipment && data.temperature && 
        (data.temperature.min !== undefined || data.temperature.max !== undefined)) {
      return { freightType: 'FTL_REEFER', confidence: 80 }
    }
    
    // 5. Check dimensions for flatbed
    if (data.dimensions && !equipment) {
      return { freightType: 'FTL_FLATBED', confidence: 75 }
    }
    
    // 6. Default to dry van
    return { freightType: 'FTL_DRY_VAN', confidence: 70 }
  }
  
  // STEP 4: Validation with enhanced semantic rules
  private step4_validateInformation(
    extractedData: LoadData,
    freightType: FreightType
  ): {
    isValid: boolean
    missingFields: string[]
    issues: Array<{
      field: string
      issue: 'missing' | 'insufficient' | 'invalid'
      value?: any
      message: string
    }>
    confidence: number
  } {
    // Basic validation
    const basicValidation = FreightValidator.validateRequiredFields(extractedData, freightType)
    
    // Enhanced semantic validation
    const semanticIssues = EnhancedFreightValidator.validateSemantics(extractedData, freightType)
    
    // Combine all issues
    const allIssues: Array<{
      field: string
      issue: 'missing' | 'insufficient' | 'invalid'
      value?: any
      message: string
    }> = [
      // Missing fields
      ...basicValidation.missingFields.map(field => ({
        field,
        issue: 'missing' as const,
        message: `${FreightValidator.getFieldDisplayName(field)} is required`
      })),
      // Semantic issues
      ...semanticIssues
    ]
    
    // Check critical issues
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
  
  // Create load in database
  private async createLoad(
    extractedData: LoadData,
    freightType: FreightType,
    emailData: any
  ): Promise<string> {
    const originZip = extractedData.pickup_zip || 
                     this.extractZipCode(extractedData.pickup_location || '') || 
                     '00000'
    const destZip = extractedData.delivery_zip || 
                   this.extractZipCode(extractedData.delivery_location || '') || 
                   '00000'
    
    let pickupDate = new Date()
    if (extractedData.pickup_date) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      
      const dateStr = extractedData.pickup_date.toLowerCase()
      if (dateStr.includes('tomorrow')) {
        pickupDate = tomorrow
      } else if (dateStr.includes('today') || dateStr.includes('asap')) {
        pickupDate = new Date()
      } else {
        const parsed = new Date(extractedData.pickup_date)
        if (!isNaN(parsed.getTime())) {
          pickupDate = parsed
        }
      }
    }
    
    const freightTypeToEquipment: Record<FreightType, string> = {
      FTL_DRY_VAN: 'DRY_VAN',
      FTL_REEFER: 'REEFER',
      FTL_FLATBED: 'FLATBED',
      FTL_HAZMAT: extractedData.equipment_type?.toUpperCase() || 'DRY_VAN',
      LTL: 'LTL',
      PARTIAL: 'PARTIAL',
      UNKNOWN: 'DRY_VAN'
    }
    
    const load = await prisma.load.create({
      data: {
        brokerId: emailData.brokerId,
        shipperEmail: emailData.from,
        originZip: originZip,
        destZip: destZip,
        weightLb: extractedData.weight || 0,
        commodity: extractedData.commodity || 'General Freight',
        pickupDt: pickupDate,
        status: 'NEW_RFQ',
        sourceType: 'EMAIL',
        equipment: freightTypeToEquipment[freightType],
        rawEmailText: `Subject: ${emailData.subject}\n\n${emailData.content}`,
        extractionConfidence: 0.95,
        aiNotes: JSON.stringify({
          freight_type: freightType,
          extracted_by: 'OptimizedFourStepAgent',
          extraction_details: extractedData
        }),
        priorityLevel: freightType === 'FTL_HAZMAT' ? 8 : 5,
        createdBy: 'optimized_four_step_agent'
      }
    })
    
    // Trigger auto-pricing
    import('@/lib/services/load-processing/auto-pricing').then(({ AutoPricingService }) => {
      AutoPricingService.processNewLoad(load.id).catch(console.error)
    })
    
    // Create chat message
    await prisma.chatMessage.create({
      data: {
        loadId: load.id,
        brokerId: emailData.brokerId,
        role: 'assistant',
        content: `I've received your ${FreightValidator.getFreightTypeDescription(freightType)} quote request. Processing your shipment from ${extractedData.pickup_location} to ${extractedData.delivery_location}.`,
        metadata: {
          action: 'load_created',
          freight_type: freightType
        }
      }
    })
    
    return load.id
  }
  
  private extractZipCode(location: string): string | null {
    if (!location) return null
    const zipMatch = location.match(/\b\d{5}\b/)
    return zipMatch ? zipMatch[0] : null
  }
}