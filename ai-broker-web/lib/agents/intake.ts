/**
 * DEPRECATED: This regex-based intake agent has been replaced by IntakeAgentLLM
 * which uses OpenAI for more accurate and flexible email parsing.
 * 
 * This file is kept for reference purposes only.
 * Use lib/agents/intake-llm.ts instead.
 */

import prisma from '@/lib/prisma'

export interface IntakeProcessResult {
  action: 'proceed_to_quote' | 'request_clarification' | 'ignore'
  confidence: number
  extracted_data?: {
    pickup_location: string
    delivery_location: string
    weight?: number
    commodity?: string
    pickup_date?: string
    special_requirements?: string
  }
  clarification_needed?: string[]
  reason?: string
  load_id?: string
}

export class IntakeAgent {
  constructor() {
    // No initialization needed for Prisma
  }

  async processEmail(emailData: {
    from: string
    to: string
    subject: string
    content: string
    brokerId: string
  }): Promise<IntakeProcessResult> {
    try {
      console.log('IntakeAgent processing email:', {
        from: emailData.from,
        subject: emailData.subject,
        brokerId: emailData.brokerId
      })

      // Extract load information from email content
      const extractedData = this.extractLoadData(emailData.content, emailData.subject)

      // Determine if we have enough information to proceed
      const missingFields = this.checkMissingFields(extractedData)

      if (missingFields.length === 0 && extractedData.pickup_location && extractedData.delivery_location) {
        // We have all required information - create a load
        const loadId = await this.createLoad(extractedData, emailData)
        
        return {
          action: 'proceed_to_quote',
          confidence: 95,
          extracted_data: extractedData,
          load_id: loadId
        }
      } else if (missingFields.length <= 2) {
        // Missing some information but it's a valid quote request
        return {
          action: 'request_clarification',
          confidence: 70,
          extracted_data: extractedData,
          clarification_needed: missingFields,
          reason: 'Missing some required information'
        }
      } else {
        // Not a quote request or too much missing information
        return {
          action: 'ignore',
          confidence: 90,
          reason: 'Does not appear to be a valid load quote request'
        }
      }
    } catch (error) {
      console.error('IntakeAgent error:', error)
      return {
        action: 'ignore',
        confidence: 0,
        reason: `Error processing email: ${error.message}`
      }
    }
  }

  private extractLoadData(content: string, subject: string): any {
    const data: any = {}
    const originalText = `${subject}\n${content}`
    const fullText = originalText.toLowerCase()

    // Helper function to extract original case text
    const extractOriginalCase = (match: RegExpMatchArray | null, fullTextLower: string, originalText: string): string | null => {
      if (!match) return null
      const startIndex = fullTextLower.indexOf(match[0])
      if (startIndex === -1) return match[1].trim()
      const actualMatch = originalText.substring(startIndex, startIndex + match[0].length)
      const colonIndex = actualMatch.indexOf(':')
      if (colonIndex !== -1) {
        return actualMatch.substring(colonIndex + 1).trim()
      }
      return match[1].trim()
    }

    // Extract pickup location
    const pickupMatch = fullText.match(/pickup[:\s]+([^,\n]+)/i) || 
                       fullText.match(/from[:\s]+([^,\n]+)/i) ||
                       fullText.match(/origin[:\s]+([^,\n]+)/i)
    if (pickupMatch) {
      data.pickup_location = extractOriginalCase(pickupMatch, fullText, originalText)
    }

    // Extract delivery location
    const deliveryMatch = fullText.match(/delivery[:\s]+([^,\n]+)/i) || 
                         fullText.match(/to[:\s]+([^,\n]+)/i) ||
                         fullText.match(/destination[:\s]+([^,\n]+)/i)
    if (deliveryMatch) {
      data.delivery_location = extractOriginalCase(deliveryMatch, fullText, originalText)
    }

    // Extract weight
    const weightMatch = fullText.match(/(\d+[\d,]*)\s*(lbs?|pounds?)/i)
    if (weightMatch) {
      data.weight = parseInt(weightMatch[1].replace(/,/g, ''))
    }

    // Extract commodity
    const commodityMatch = fullText.match(/commodity[:\s]+([^,\n]+)/i) ||
                          fullText.match(/freight[:\s]+([^,\n]+)/i) ||
                          fullText.match(/cargo[:\s]+([^,\n]+)/i)
    if (commodityMatch) {
      data.commodity = extractOriginalCase(commodityMatch, fullText, originalText)
    }

    // Extract pickup date
    const dateMatch = fullText.match(/pickup\s*date[:\s]+([^,\n]+)/i) ||
                     fullText.match(/pick\s*up[:\s]+([^,\n]+)/i) ||
                     fullText.match(/date[:\s]+([^,\n]+)/i)
    if (dateMatch) {
      data.pickup_date = extractOriginalCase(dateMatch, fullText, originalText)
    }

    // Extract special requirements
    const specialMatch = fullText.match(/special\s*requirements?[:\s]+([^,\n]+)/i) ||
                        fullText.match(/notes?[:\s]+([^,\n]+)/i)
    if (specialMatch) {
      data.special_requirements = extractOriginalCase(specialMatch, fullText, originalText)
    }

    return data
  }

  private checkMissingFields(data: any): string[] {
    const required = ['pickup_location', 'delivery_location']
    const optional = ['weight', 'commodity', 'pickup_date']
    const missing = []

    for (const field of required) {
      if (!data[field]) {
        missing.push(field)
      }
    }

    // Only add optional fields if we're missing less than 2 required fields
    if (missing.length < 2) {
      for (const field of optional) {
        if (!data[field]) {
          missing.push(field)
        }
      }
    }

    return missing
  }

  private async createLoad(extractedData: any, emailData: any): Promise<string> {
    console.log('Creating load with data:', {
      broker_id: emailData.brokerId,
      customer_email: emailData.from,
      pickup_location: extractedData.pickup_location,
      delivery_location: extractedData.delivery_location,
      weight: extractedData.weight,
      commodity: extractedData.commodity,
      pickup_date: extractedData.pickup_date
    })
    
    try {
      // Parse pickup and delivery locations to extract zips
      const originZip = this.extractZipCode(extractedData.pickup_location) || '00000'
      const destZip = this.extractZipCode(extractedData.delivery_location) || '00000'
      
      console.log('Extracted zip codes:', {
        pickup_location: extractedData.pickup_location,
        delivery_location: extractedData.delivery_location,
        originZip,
        destZip
      })
      
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
          equipment: 'DRY_VAN', // Default equipment type
          rawEmailText: `Subject: ${emailData.subject}\n\n${emailData.content}`,
          extractionConfidence: 0.95,
          aiNotes: `Extracted from email: ${emailData.from}`,
          priorityLevel: 5,
          createdBy: 'intake_agent'
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