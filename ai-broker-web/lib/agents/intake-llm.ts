/**
 * LLM-based Email Intake Agent
 * 
 * This is the current production email intake system that uses OpenAI
 * to intelligently parse load quote requests from emails.
 * 
 * Replaces the previous regex-based system (lib/agents/intake.ts)
 * for more accurate and flexible email parsing.
 */

import { OpenAI } from 'openai'
import prisma from '@/lib/prisma'

export interface IntakeProcessResult {
  action: 'proceed_to_quote' | 'request_clarification' | 'ignore'
  confidence: number
  extracted_data?: {
    pickup_location: string
    delivery_location: string
    pickup_city?: string
    pickup_state?: string
    pickup_zip?: string
    delivery_city?: string
    delivery_state?: string
    delivery_zip?: string
    weight?: number
    commodity?: string
    pickup_date?: string
    special_requirements?: string
    equipment_type?: string
  }
  clarification_needed?: string[]
  reason?: string
  load_id?: string
}

export class IntakeAgentLLM {
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
  }): Promise<IntakeProcessResult> {
    try {
      console.log('IntakeAgentLLM processing email:', {
        from: emailData.from,
        subject: emailData.subject,
        brokerId: emailData.brokerId
      })

      const systemPrompt = `You are an AI assistant for a freight broker. Your job is to analyze emails and determine if they are load quote requests.

For each email, you need to:
1. Determine if it's a load quote request
2. Extract all relevant information
3. Identify any missing required information

Required fields for a load:
- Pickup location (try to extract city, state, and zip separately if possible)
- Delivery location (try to extract city, state, and zip separately if possible)

Optional but important fields:
- Weight (in pounds)
- Commodity/freight type
- Pickup date/time
- Equipment type (van, flatbed, reefer, etc.)
- Special requirements

Return a JSON object with:
{
  "is_load_request": boolean,
  "confidence": number (0-100),
  "extracted_data": {
    "pickup_location": "full location string",
    "pickup_city": "city name",
    "pickup_state": "state abbreviation",
    "pickup_zip": "5-digit zip",
    "delivery_location": "full location string", 
    "delivery_city": "city name",
    "delivery_state": "state abbreviation",
    "delivery_zip": "5-digit zip",
    "weight": number (in pounds),
    "commodity": "freight description",
    "pickup_date": "date string",
    "equipment_type": "equipment type",
    "special_requirements": "any special notes"
  },
  "missing_fields": ["list of missing required or important fields"],
  "reasoning": "brief explanation of your decision"
}

For dates like "tomorrow", "next week", etc., keep them as-is in the pickup_date field.
If you can't extract city/state/zip separately, just put the full location in the main location field.`

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
        max_tokens: 1000
      })

      const response = JSON.parse(completion.choices[0].message.content || '{}')
      console.log('LLM Response:', response)

      // Decide action based on LLM analysis
      if (!response.is_load_request) {
        return {
          action: 'ignore',
          confidence: response.confidence || 90,
          reason: response.reasoning || 'Not a load quote request'
        }
      }

      const missingRequired = response.missing_fields?.filter((field: string) => 
        ['pickup_location', 'delivery_location'].includes(field)
      ) || []

      if (missingRequired.length === 0 && response.extracted_data?.pickup_location && response.extracted_data?.delivery_location) {
        // We have all required information - create a load
        const loadId = await this.createLoad(response.extracted_data, emailData)
        
        return {
          action: 'proceed_to_quote',
          confidence: response.confidence || 95,
          extracted_data: response.extracted_data,
          load_id: loadId
        }
      } else if (response.extracted_data && Object.keys(response.extracted_data).length > 0) {
        // Missing some information but it's a valid quote request
        return {
          action: 'request_clarification',
          confidence: response.confidence || 70,
          extracted_data: response.extracted_data,
          clarification_needed: response.missing_fields || [],
          reason: 'Missing some required information'
        }
      } else {
        // Not enough information
        return {
          action: 'ignore',
          confidence: response.confidence || 50,
          reason: 'Insufficient information for load quote'
        }
      }
    } catch (error: any) {
      console.error('IntakeAgentLLM error:', error)
      return {
        action: 'ignore',
        confidence: 0,
        reason: `Error processing email: ${error.message}`
      }
    }
  }

  private async createLoad(extractedData: any, emailData: any): Promise<string> {
    console.log('Creating load with LLM-extracted data:', extractedData)
    
    try {
      // Use extracted zip codes or try to extract from full location
      const originZip = extractedData.pickup_zip || 
                       this.extractZipCode(extractedData.pickup_location) || 
                       '00000'
      const destZip = extractedData.delivery_zip || 
                     this.extractZipCode(extractedData.delivery_location) || 
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
      
      // Map equipment type
      const equipmentMap: { [key: string]: string } = {
        'van': 'DRY_VAN',
        'dry van': 'DRY_VAN',
        'reefer': 'REEFER',
        'refrigerated': 'REEFER',
        'flatbed': 'FLATBED',
        'flat': 'FLATBED',
        'step deck': 'STEP_DECK',
        'lowboy': 'LOWBOY'
      }
      
      const equipment = extractedData.equipment_type 
        ? equipmentMap[extractedData.equipment_type.toLowerCase()] || 'DRY_VAN'
        : 'DRY_VAN'
      
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
          aiNotes: JSON.stringify({
            extracted_by: 'LLM',
            pickup_full: extractedData.pickup_location,
            delivery_full: extractedData.delivery_location,
            special_requirements: extractedData.special_requirements
          }),
          priorityLevel: 5,
          createdBy: 'intake_agent_llm'
        }
      })

      console.log('Created load:', load.id)

      // Create initial chat message
      await prisma.chatMessage.create({
        data: {
          loadId: load.id,
          brokerId: emailData.brokerId,
          role: 'assistant',
          content: `I've received your quote request for a shipment from ${extractedData.pickup_location} to ${extractedData.delivery_location}. I'm preparing a quote for you now.`,
          metadata: {
            action: 'load_created',
            extracted_data: extractedData
          }
        }
      })

      return load.id
    } catch (error: any) {
      console.error('Error creating load:', error)
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