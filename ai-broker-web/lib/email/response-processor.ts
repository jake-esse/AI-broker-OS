/**
 * Email Response Processor
 * 
 * Extracts missing information from shipper responses to clarification emails
 * and merges it with existing load data
 */

import { OpenAI } from 'openai'
import { LoadData, FreightType } from '@/lib/freight-types/freight-validator'
import prisma from '@/lib/prisma'

export interface ResponseContext {
  originalLoadId: string
  threadId: string
  emailContent: string
  emailSubject: string
  existingData: LoadData
  freightType: FreightType
  missingFields: string[]
}

export interface ProcessedResponse {
  extractedInfo: Partial<LoadData>
  confidence: number
  stillMissingFields: string[]
  mergedData: LoadData
}

export class EmailResponseProcessor {
  private openai: OpenAI
  
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    this.openai = new OpenAI({ apiKey })
  }
  
  async processResponse(context: ResponseContext): Promise<ProcessedResponse> {
    // Step 1: Extract information from response
    const extracted = await this.extractMissingInfo(context)
    
    // Step 2: Merge with existing data
    const mergedData = this.mergeLoadData(context.existingData, extracted.data)
    
    // Step 3: Identify what's still missing
    const stillMissing = this.identifyStillMissing(context.missingFields, extracted.fieldsFound)
    
    return {
      extractedInfo: extracted.data,
      confidence: extracted.confidence,
      stillMissingFields: stillMissing,
      mergedData
    }
  }
  
  private async extractMissingInfo(context: ResponseContext): Promise<{
    data: Partial<LoadData>
    fieldsFound: string[]
    confidence: number
  }> {
    const systemPrompt = `You are extracting freight information from a shipper's response to a clarification email.

Context:
- This is a ${context.freightType} shipment
- We previously asked for: ${context.missingFields.join(', ')}
- Extract ONLY the information that was missing, not what we already have

Important:
1. Look for the specific missing information requested
2. Extract exact values as provided by the shipper
3. Convert units if needed (e.g., tons to pounds: 1 ton = 2000 lbs)
4. Parse dates/times into standard format
5. Return null for fields not mentioned in the response

Return JSON with:
{
  "extracted_data": {
    // Only fields that were missing and are now provided
  },
  "fields_found": ["field1", "field2"],
  "confidence": 0-100
}`

    const userPrompt = `Original missing fields: ${context.missingFields.join(', ')}

Shipper's response:
Subject: ${context.emailSubject}
Content: ${context.emailContent}

Extract the missing information from this response.`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500
    })
    
    const result = JSON.parse(completion.choices[0].message.content || '{}')
    
    // Clean up extracted data
    const cleanedData = this.cleanExtractedData(result.extracted_data || {})
    
    return {
      data: cleanedData,
      fieldsFound: result.fields_found || [],
      confidence: result.confidence || 50
    }
  }
  
  private cleanExtractedData(data: any): Partial<LoadData> {
    const cleaned: Partial<LoadData> = {}
    
    // Handle weight conversion
    if (data.weight !== undefined) {
      if (typeof data.weight === 'string') {
        const match = data.weight.match(/[\d,]+/)
        if (match) {
          cleaned.weight = parseInt(match[0].replace(/,/g, ''))
        }
      } else if (typeof data.weight === 'number') {
        cleaned.weight = data.weight
      }
    }
    
    // Handle temperature
    if (data.temperature) {
      cleaned.temperature = this.parseTemperature(data.temperature)
    }
    
    // Handle dimensions
    if (data.dimensions) {
      cleaned.dimensions = this.parseDimensions(data.dimensions)
    }
    
    // Copy string fields directly
    const stringFields = [
      'pickup_location', 'delivery_location', 'commodity', 
      'pickup_date', 'equipment_type', 'hazmat_class', 
      'un_number', 'proper_shipping_name', 'packing_group',
      'emergency_contact', 'technical_name', 'special_requirements'
    ]
    
    for (const field of stringFields) {
      if (data[field] !== undefined && data[field] !== null) {
        cleaned[field as keyof LoadData] = String(data[field])
      }
    }
    
    // Handle numeric fields
    if (data.piece_count !== undefined) {
      cleaned.piece_count = parseInt(String(data.piece_count))
    }
    
    if (data.freight_class !== undefined) {
      cleaned.freight_class = String(data.freight_class)
    }
    
    return cleaned
  }
  
  private parseTemperature(temp: any): LoadData['temperature'] {
    if (typeof temp === 'string') {
      // Parse strings like "32-38F" or "keep at 35 degrees"
      const rangeMatch = temp.match(/(\d+)\s*[-to]\s*(\d+)\s*([FC])?/i)
      if (rangeMatch) {
        return {
          min: parseInt(rangeMatch[1]),
          max: parseInt(rangeMatch[2]),
          unit: (rangeMatch[3] || 'F').toUpperCase() as 'F' | 'C'
        }
      }
      
      const singleMatch = temp.match(/(\d+)\s*(?:degrees?\s*)?([FC])?/i)
      if (singleMatch) {
        const value = parseInt(singleMatch[1])
        return {
          min: value - 2, // Assume small range if single value given
          max: value + 2,
          unit: (singleMatch[2] || 'F').toUpperCase() as 'F' | 'C'
        }
      }
    } else if (typeof temp === 'object' && temp !== null) {
      return {
        min: temp.min || 32,
        max: temp.max || 40,
        unit: temp.unit || 'F'
      }
    }
    
    return { min: 32, max: 40, unit: 'F' }
  }
  
  private parseDimensions(dims: any): LoadData['dimensions'] {
    if (typeof dims === 'string') {
      // Parse strings like "48x40x48" or "48' x 40' x 48'"
      const match = dims.match(/(\d+)\s*[x'\"]\s*(\d+)\s*[x'\"]\s*(\d+)/i)
      if (match) {
        return {
          length: parseInt(match[1]),
          width: parseInt(match[2]),
          height: parseInt(match[3])
        }
      }
    } else if (typeof dims === 'object' && dims !== null) {
      return {
        length: dims.length || 0,
        width: dims.width || 0,
        height: dims.height || 0
      }
    }
    
    return { length: 0, width: 0, height: 0 }
  }
  
  private mergeLoadData(existing: LoadData, updates: Partial<LoadData>): LoadData {
    // Create merged object, preferring new data over existing
    const merged: LoadData = { ...existing }
    
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null) {
        (merged as any)[key] = value
      }
    }
    
    return merged
  }
  
  private identifyStillMissing(originallyMissing: string[], fieldsFound: string[]): string[] {
    return originallyMissing.filter(field => !fieldsFound.includes(field))
  }
  
  async updateLoadInDatabase(loadId: string, mergedData: LoadData, stillMissing: string[]): Promise<void> {
    // Update the load with merged data
    await prisma.load.update({
      where: { id: loadId },
      data: {
        pickupLocation: mergedData.pickup_location,
        deliveryLocation: mergedData.delivery_location,
        weight: mergedData.weight,
        commodity: mergedData.commodity,
        pickupDate: mergedData.pickup_date ? new Date(mergedData.pickup_date) : undefined,
        equipmentType: mergedData.equipment_type,
        temperature: mergedData.temperature ? JSON.stringify(mergedData.temperature) : undefined,
        dimensions: mergedData.dimensions ? JSON.stringify(mergedData.dimensions) : undefined,
        hazmatClass: mergedData.hazmat_class,
        unNumber: mergedData.un_number,
        properShippingName: mergedData.proper_shipping_name,
        packingGroup: mergedData.packing_group,
        emergencyContact: mergedData.emergency_contact,
        technicalName: mergedData.technical_name,
        specialRequirements: mergedData.special_requirements,
        freightClass: mergedData.freight_class,
        pieceCount: mergedData.piece_count,
        // Update status based on whether info is complete
        status: stillMissing.length === 0 ? 'READY_TO_QUOTE' : 'AWAITING_INFO',
        missingFields: stillMissing.length > 0 ? stillMissing : undefined
      }
    })
  }
}