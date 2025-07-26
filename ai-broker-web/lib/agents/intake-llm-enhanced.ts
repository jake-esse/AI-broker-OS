/**
 * Enhanced LLM-based Email Intake Agent
 * 
 * This enhanced version adds freight type classification and validation
 * to ensure all required information is captured based on freight type.
 * 
 * Replaces the basic intake-llm.ts with more comprehensive validation.
 */

import { OpenAI } from 'openai'
import prisma from '@/lib/prisma'
import { FreightValidator, FreightType, LoadData } from '@/lib/freight-types/freight-validator'

export interface EnhancedIntakeProcessResult {
  action: 'proceed_to_quote' | 'request_clarification' | 'ignore'
  confidence: number
  freight_type?: FreightType
  extracted_data?: LoadData
  clarification_needed?: string[]
  missing_fields?: string[]
  validation_warnings?: string[]
  reason?: string
  load_id?: string
}

export class IntakeAgentLLMEnhanced {
  private openai: OpenAI

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  async processEmail(emailData: {
    from: string
    to: string
    subject: string
    content: string
    brokerId: string
    inReplyTo?: string // For threading detection
    references?: string // For threading detection
    messageId?: string // Current email's message ID
  }, emailId?: string): Promise<EnhancedIntakeProcessResult> {
    try {
      console.log('IntakeAgentLLMEnhanced processing email:', {
        from: emailData.from,
        subject: emailData.subject,
        brokerId: emailData.brokerId,
        isReply: !!emailData.inReplyTo
      })

      // First, check if this is a response to a clarification request
      const { ClarificationResponseHandler } = await import('./clarification-response-handler')
      const responseResult = await ClarificationResponseHandler.processResponse(emailData, emailId)
      
      if (responseResult.isResponse) {
        console.log('Email is a clarification response')
        
        if (responseResult.loadCreated) {
          // Load was successfully created from the response
          return {
            action: 'proceed_to_quote',
            confidence: 95,
            freight_type: responseResult.mergedData ? 
              FreightValidator.identifyFreightType(responseResult.mergedData) : 'UNKNOWN',
            extracted_data: responseResult.mergedData,
            load_id: responseResult.loadId
          }
        } else {
          // Still missing some information
          return {
            action: 'request_clarification',
            confidence: 80,
            freight_type: responseResult.mergedData ? 
              FreightValidator.identifyFreightType(responseResult.mergedData) : 'UNKNOWN',
            extracted_data: responseResult.mergedData,
            missing_fields: responseResult.validationResult?.missingFields,
            clarification_needed: responseResult.validationResult?.missingFields?.map(f => 
              FreightValidator.getFieldDisplayName(f)
            ),
            validation_warnings: responseResult.validationResult?.warnings,
            reason: 'Additional information still needed after response'
          }
        }
      }

      // Not a clarification response - process as new email
      const extractionResult = await this.extractLoadData(emailData)
      
      if (!extractionResult.is_load_request) {
        return {
          action: 'ignore',
          confidence: extractionResult.confidence || 90,
          reason: extractionResult.reasoning || 'Not a load quote request'
        }
      }

      // Second pass: Identify freight type based on extracted data
      const freightType = FreightValidator.identifyFreightType(extractionResult.extracted_data)
      console.log('Identified freight type:', freightType)

      // Third pass: Validate required fields for the freight type
      const validation = FreightValidator.validateRequiredFields(
        extractionResult.extracted_data,
        freightType
      )

      console.log('Validation result:', validation)

      // Determine action based on validation
      if (validation.isValid && extractionResult.extracted_data?.pickup_location && extractionResult.extracted_data?.delivery_location) {
        // All required fields present - create load
        const loadId = await this.createEnhancedLoad(
          extractionResult.extracted_data,
          freightType,
          emailData
        )
        
        return {
          action: 'proceed_to_quote',
          confidence: extractionResult.confidence || 95,
          freight_type: freightType,
          extracted_data: extractionResult.extracted_data,
          validation_warnings: validation.warnings,
          load_id: loadId
        }
      } else if (extractionResult.extracted_data && Object.keys(extractionResult.extracted_data).length > 0) {
        // Missing some required fields - request clarification
        const missingFieldNames = validation.missingFields.map(field => 
          FreightValidator.getFieldDisplayName(field)
        )
        
        return {
          action: 'request_clarification',
          confidence: extractionResult.confidence || 70,
          freight_type: freightType,
          extracted_data: extractionResult.extracted_data,
          clarification_needed: missingFieldNames,
          missing_fields: validation.missingFields,
          validation_warnings: validation.warnings,
          reason: `Missing required information for ${FreightValidator.getFreightTypeDescription(freightType)}`
        }
      } else {
        // Not enough information to process
        return {
          action: 'ignore',
          confidence: extractionResult.confidence || 50,
          reason: 'Insufficient information for load quote'
        }
      }
    } catch (error: any) {
      console.error('IntakeAgentLLMEnhanced error:', error)
      return {
        action: 'ignore',
        confidence: 0,
        reason: `Error processing email: ${error.message}`
      }
    }
  }

  async extractLoadData(emailData: any): Promise<any> {
    const systemPrompt = `You are an AI assistant for a freight broker. Analyze emails to determine if they are load quote requests and extract ALL relevant information.

For each email, extract:

BASIC INFORMATION (always try to extract):
- pickup_location: Full location string
- pickup_city, pickup_state, pickup_zip: Parsed location components
- delivery_location: Full location string  
- delivery_city, delivery_state, delivery_zip: Parsed location components
- weight: Weight in pounds (convert from tons if needed)
- commodity: What is being shipped
- pickup_date: When pickup is needed
- equipment_type: Van, reefer, flatbed, etc.

DIMENSIONS (for flatbed, LTL, or when mentioned):
- dimensions.length: Length in inches
- dimensions.width: Width in inches  
- dimensions.height: Height in inches
- piece_count: Number of pieces/pallets

TEMPERATURE CONTROL (for refrigerated/frozen goods):
- temperature.min: Minimum temperature
- temperature.max: Maximum temperature
- temperature.unit: F or C

HAZMAT INFORMATION (if dangerous goods mentioned):
- hazmat_class: Class 1-9
- un_number: UN#### format
- proper_shipping_name: Official hazmat name
- packing_group: I, II, or III
- emergency_contact: 24/7 emergency number
- placards_required: true/false

FLATBED SPECIFIC:
- tarping_required: true/false
- oversize_permits: true/false if dimensions exceed standard
- escort_required: true/false

LTL SPECIFIC:
- freight_class: NMFC class (50-500)
- packaging_type: Pallets, crates, etc.
- accessorials: Array of services like liftgate, inside delivery

Return JSON with:
{
  "is_load_request": boolean,
  "confidence": 0-100,
  "extracted_data": { all fields found },
  "reasoning": "explanation"
}`

    const userPrompt = `Analyze this email:

Subject: ${emailData.subject}
From: ${emailData.from}

Body:
${emailData.content}`

    const completion = await this.openai.chat.completions.create({
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500
    })

    const response = JSON.parse(completion.choices[0].message.content || '{}')
    console.log('LLM Extraction Response:', response)
    return response
  }

  private async createEnhancedLoad(
    extractedData: LoadData,
    freightType: FreightType,
    emailData: any
  ): Promise<string> {
    console.log('Creating enhanced load with data:', { extractedData, freightType })
    
    try {
      // Use extracted zip codes or try to extract from full location
      const originZip = extractedData.pickup_zip || 
                       this.extractZipCode(extractedData.pickup_location || '') || 
                       '00000'
      const destZip = extractedData.delivery_zip || 
                     this.extractZipCode(extractedData.delivery_location || '') || 
                     '00000'
      
      // Parse pickup date
      let pickupDate = new Date()
      if (extractedData.pickup_date) {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        
        const dateStr = extractedData.pickup_date.toLowerCase()
        if (dateStr.includes('tomorrow')) {
          pickupDate = tomorrow
        } else if (dateStr.includes('today')) {
          pickupDate = new Date()
        } else if (dateStr.includes('asap')) {
          pickupDate = new Date()
        } else {
          // Try to parse the date
          const parsed = new Date(extractedData.pickup_date)
          if (!isNaN(parsed.getTime())) {
            pickupDate = parsed
          }
        }
      }
      
      // Map freight type to equipment
      const freightTypeToEquipment: Record<FreightType, string> = {
        FTL_DRY_VAN: 'DRY_VAN',
        FTL_REEFER: 'REEFER',
        FTL_FLATBED: 'FLATBED',
        FTL_HAZMAT: extractedData.equipment_type?.toUpperCase() || 'DRY_VAN',
        LTL: 'LTL',
        PARTIAL: 'PARTIAL',
        UNKNOWN: 'DRY_VAN'
      }
      
      const equipment = freightTypeToEquipment[freightType]
      
      // Build comprehensive AI notes with all extracted data
      const aiNotes = {
        freight_type: freightType,
        extracted_by: 'LLM_Enhanced',
        pickup_full: extractedData.pickup_location,
        pickup_components: {
          city: extractedData.pickup_city,
          state: extractedData.pickup_state,
          zip: extractedData.pickup_zip
        },
        delivery_full: extractedData.delivery_location,
        delivery_components: {
          city: extractedData.delivery_city,
          state: extractedData.delivery_state,
          zip: extractedData.delivery_zip
        },
        dimensions: extractedData.dimensions,
        temperature_requirements: extractedData.temperature,
        hazmat_details: extractedData.hazmat_class ? {
          class: extractedData.hazmat_class,
          un_number: extractedData.un_number,
          proper_shipping_name: extractedData.proper_shipping_name,
          packing_group: extractedData.packing_group,
          emergency_contact: extractedData.emergency_contact,
          placards_required: extractedData.placards_required
        } : undefined,
        special_requirements: extractedData.special_requirements,
        ltl_details: freightType === 'LTL' ? {
          freight_class: extractedData.freight_class,
          packaging_type: extractedData.packaging_type,
          accessorials: extractedData.accessorials
        } : undefined,
        flatbed_details: freightType === 'FTL_FLATBED' ? {
          tarping_required: extractedData.tarping_required,
          oversize_permits: extractedData.oversize_permits,
          escort_required: extractedData.escort_required
        } : undefined
      }
      
      // Create the load record
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
          equipment: equipment,
          rawEmailText: `Subject: ${emailData.subject}\n\n${emailData.content}`,
          extractionConfidence: 0.95,
          aiNotes: JSON.stringify(aiNotes),
          priorityLevel: freightType === 'FTL_HAZMAT' ? 8 : 5, // Higher priority for hazmat
          createdBy: 'intake_agent_llm_enhanced'
        }
      })

      console.log('Created enhanced load:', load.id)

      // Create initial chat message with freight type context
      const freightDescription = FreightValidator.getFreightTypeDescription(freightType)
      await prisma.chatMessage.create({
        data: {
          loadId: load.id,
          brokerId: emailData.brokerId,
          role: 'assistant',
          content: `I've received your ${freightDescription} quote request from ${extractedData.pickup_location} to ${extractedData.delivery_location}. I'm preparing a detailed quote for you now.`,
          metadata: {
            action: 'load_created',
            freight_type: freightType,
            extracted_data: extractedData
          }
        }
      })

      return load.id
    } catch (error: any) {
      console.error('Error creating enhanced load:', error)
      throw new Error(`Failed to create load: ${error.message}`)
    }
  }

  private extractZipCode(location: string): string | null {
    if (!location) return null
    // Extract 5-digit zip code from location string
    const zipMatch = location.match(/\b\d{5}\b/)
    return zipMatch ? zipMatch[0] : null
  }
}