import { createClient } from '@/lib/supabase/server'

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
  private supabase: any

  constructor() {
    // Supabase will be initialized when needed
  }

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient()
    }
    return this.supabase
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
    const fullText = `${subject}\n${content}`.toLowerCase()

    // Extract pickup location
    const pickupMatch = fullText.match(/pickup[:\s]+([^,\n]+)/i) || 
                       fullText.match(/from[:\s]+([^,\n]+)/i) ||
                       fullText.match(/origin[:\s]+([^,\n]+)/i)
    if (pickupMatch) {
      data.pickup_location = pickupMatch[1].trim()
    }

    // Extract delivery location
    const deliveryMatch = fullText.match(/delivery[:\s]+([^,\n]+)/i) || 
                         fullText.match(/to[:\s]+([^,\n]+)/i) ||
                         fullText.match(/destination[:\s]+([^,\n]+)/i)
    if (deliveryMatch) {
      data.delivery_location = deliveryMatch[1].trim()
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
      data.commodity = commodityMatch[1].trim()
    }

    // Extract pickup date
    const dateMatch = fullText.match(/pickup\s*date[:\s]+([^,\n]+)/i) ||
                     fullText.match(/pick\s*up[:\s]+([^,\n]+)/i) ||
                     fullText.match(/date[:\s]+([^,\n]+)/i)
    if (dateMatch) {
      data.pickup_date = dateMatch[1].trim()
    }

    // Extract special requirements
    const specialMatch = fullText.match(/special\s*requirements?[:\s]+([^,\n]+)/i) ||
                        fullText.match(/notes?[:\s]+([^,\n]+)/i)
    if (specialMatch) {
      data.special_requirements = specialMatch[1].trim()
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
    const supabase = await this.getSupabase()
    
    console.log('Creating load with data:', {
      broker_id: emailData.brokerId,
      customer_email: emailData.from,
      pickup_location: extractedData.pickup_location,
      delivery_location: extractedData.delivery_location,
      weight: extractedData.weight,
      commodity: extractedData.commodity,
      pickup_date: extractedData.pickup_date
    })
    
    // Create the load record - temporarily remove confidence_score
    const { data: load, error } = await supabase
      .from('loads')
      .insert({
        broker_id: emailData.brokerId,
        customer_email: emailData.from,
        pickup_location: extractedData.pickup_location,
        delivery_location: extractedData.delivery_location,
        weight: extractedData.weight,
        commodity: extractedData.commodity || 'General Freight',
        pickup_date: extractedData.pickup_date || 'ASAP',
        special_requirements: extractedData.special_requirements,
        status: 'quoted',
        source: 'email',
        original_request: `Subject: ${emailData.subject}\n\n${emailData.content}`
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating load:', error)
      throw new Error(`Failed to create load: ${error.message}`)
    }

    console.log('Created load:', load.id)

    // Create initial chat message
    await supabase
      .from('chat_messages')
      .insert({
        load_id: load.id,
        broker_id: emailData.brokerId,
        role: 'assistant',
        content: `I've received your quote request for a shipment from ${extractedData.pickup_location} to ${extractedData.delivery_location}. I'm preparing a quote for you now.`,
        metadata: {
          action: 'load_created',
          extracted_data: extractedData
        }
      })

    return load.id
  }
}