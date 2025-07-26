/**
 * Clarification Response Handler
 * 
 * Tracks and processes responses to clarification requests,
 * validates complete data, and creates loads when ready.
 */

import prisma from '@/lib/prisma'
import { FreightValidator, FreightType, LoadData } from '@/lib/freight-types/freight-validator'
import { IntakeAgentLLMEnhanced } from './intake-llm-enhanced'

export interface ClarificationResponseResult {
  clarificationRequestId?: string
  isResponse: boolean
  mergedData?: LoadData
  loadCreated: boolean
  loadId?: string
  validationResult?: {
    isValid: boolean
    missingFields: string[]
    warnings: string[]
  }
}

export class ClarificationResponseHandler {
  /**
   * Find matching clarification request based on email metadata
   */
  static async findMatchingRequest(emailData: {
    from: string
    brokerId: string
    subject?: string
    inReplyTo?: string
    references?: string
    messageId?: string
  }): Promise<any | null> {
    try {
      // First try to find by message ID if we have threading info
      if (emailData.inReplyTo || emailData.references) {
        // Extract message IDs from references header
        const messageIds: string[] = []
        if (emailData.inReplyTo) {
          messageIds.push(emailData.inReplyTo)
        }
        if (emailData.references) {
          // References can contain multiple message IDs
          const refs = emailData.references.split(/\s+/)
          messageIds.push(...refs)
        }

        // Clean message IDs (remove angle brackets if present)
        const cleanIds = messageIds.map(id => 
          id.replace(/^</, '').replace(/>$/, '')
        )

        console.log('Looking for clarification by message IDs:', cleanIds)

        const request = await prisma.clarificationRequest.findFirst({
          where: {
            brokerId: emailData.brokerId,
            emailMessageId: { in: cleanIds },
            responseReceived: false,
            loadCreated: false
          },
          orderBy: { createdAt: 'desc' }
        })

        if (request) {
          console.log('Found clarification request by message ID:', request.id)
          return request
        }
      }

      // Fallback: Find by email and subject pattern
      const isReplySubject = emailData.subject?.toLowerCase().includes('re:')
      if (isReplySubject || emailData.from) {
        console.log('Looking for clarification by email and timeframe')
        
        const request = await prisma.clarificationRequest.findFirst({
          where: {
            brokerId: emailData.brokerId,
            shipperEmail: emailData.from,
            responseReceived: false,
            loadCreated: false,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Within 7 days
            }
          },
          orderBy: { createdAt: 'desc' }
        })

        if (request) {
          console.log('Found clarification request by email:', request.id)
          return request
        }
      }

      return null
    } catch (error) {
      console.error('Error finding clarification request:', error)
      return null
    }
  }

  /**
   * Process a potential clarification response
   */
  static async processResponse(
    emailData: {
      from: string
      to: string
      subject: string
      content: string
      brokerId: string
      inReplyTo?: string
      references?: string
      messageId?: string
    },
    emailId?: string
  ): Promise<ClarificationResponseResult> {
    try {
      // Find matching clarification request
      const clarificationRequest = await this.findMatchingRequest(emailData)
      
      if (!clarificationRequest) {
        return {
          isResponse: false,
          loadCreated: false
        }
      }

      console.log('Processing clarification response for request:', clarificationRequest.id)

      // Extract new data from the response email
      const agent = new IntakeAgentLLMEnhanced()
      const extractionResult = await agent.extractLoadData(emailData)

      // Merge with previous data
      const previousData = clarificationRequest.extractedData as LoadData
      const mergedData: LoadData = {
        ...previousData,
        ...extractionResult.extracted_data
      }

      console.log('Merged data:', mergedData)

      // Re-validate with complete data
      const freightType = clarificationRequest.freightType as FreightType
      const validationResult = FreightValidator.validateRequiredFields(mergedData, freightType)

      // Update clarification request with response info
      await prisma.clarificationRequest.update({
        where: { id: clarificationRequest.id },
        data: {
          responseReceived: true,
          responseReceivedAt: new Date(),
          responseEmailId: emailId,
          mergedData: mergedData,
          updatedAt: new Date()
        }
      })

      // If validation passes, create the load
      if (validationResult.isValid && mergedData.pickup_location && mergedData.delivery_location) {
        console.log('All required fields present, creating load')
        
        const loadId = await this.createLoadFromMergedData(
          mergedData,
          freightType,
          emailData,
          clarificationRequest.id
        )

        // Update clarification request with load info
        await prisma.clarificationRequest.update({
          where: { id: clarificationRequest.id },
          data: {
            loadCreated: true,
            loadId: loadId
          }
        })

        // Create success message
        await prisma.chatMessage.create({
          data: {
            loadId: loadId,
            brokerId: emailData.brokerId,
            role: 'assistant',
            content: `Thank you for providing the additional information. I've created your load and I'm now preparing a detailed quote.`,
            metadata: {
              action: 'clarification_completed',
              clarification_request_id: clarificationRequest.id,
              freight_type: freightType
            }
          }
        })

        return {
          clarificationRequestId: clarificationRequest.id,
          isResponse: true,
          mergedData,
          loadCreated: true,
          loadId,
          validationResult
        }
      } else {
        // Still missing some information
        console.log('Still missing required fields after response:', validationResult.missingFields)
        
        // Create a message indicating what's still missing
        await prisma.chatMessage.create({
          data: {
            loadId: `pending-${clarificationRequest.id}`,
            brokerId: emailData.brokerId,
            role: 'assistant',
            content: `Thank you for the additional information. I still need the following to provide your quote: ${validationResult.missingFields.map(f => FreightValidator.getFieldDisplayName(f)).join(', ')}`,
            metadata: {
              action: 'clarification_incomplete',
              clarification_request_id: clarificationRequest.id,
              missing_fields: validationResult.missingFields,
              freight_type: freightType
            }
          }
        })

        return {
          clarificationRequestId: clarificationRequest.id,
          isResponse: true,
          mergedData,
          loadCreated: false,
          validationResult
        }
      }
    } catch (error) {
      console.error('Error processing clarification response:', error)
      return {
        isResponse: false,
        loadCreated: false
      }
    }
  }

  /**
   * Create load from merged clarification data
   */
  private static async createLoadFromMergedData(
    mergedData: LoadData,
    freightType: FreightType,
    emailData: any,
    clarificationRequestId: string
  ): Promise<string> {
    // Use extracted zip codes or try to extract from full location
    const originZip = mergedData.pickup_zip || 
                     this.extractZipCode(mergedData.pickup_location || '') || 
                     '00000'
    const destZip = mergedData.delivery_zip || 
                   this.extractZipCode(mergedData.delivery_location || '') || 
                   '00000'
    
    // Parse pickup date
    let pickupDate = new Date()
    if (mergedData.pickup_date) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      
      const dateStr = mergedData.pickup_date.toLowerCase()
      if (dateStr.includes('tomorrow')) {
        pickupDate = tomorrow
      } else if (dateStr.includes('today')) {
        pickupDate = new Date()
      } else if (dateStr.includes('asap')) {
        pickupDate = new Date()
      } else {
        // Try to parse the date
        const parsed = new Date(mergedData.pickup_date)
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
      FTL_HAZMAT: mergedData.equipment_type?.toUpperCase() || 'DRY_VAN',
      LTL: 'LTL',
      PARTIAL: 'PARTIAL',
      UNKNOWN: 'DRY_VAN'
    }
    
    const equipment = freightTypeToEquipment[freightType]
    
    // Build comprehensive AI notes
    const aiNotes = {
      freight_type: freightType,
      clarification_request_id: clarificationRequestId,
      extracted_by: 'Clarification_Response_Handler',
      pickup_full: mergedData.pickup_location,
      pickup_components: {
        city: mergedData.pickup_city,
        state: mergedData.pickup_state,
        zip: mergedData.pickup_zip
      },
      delivery_full: mergedData.delivery_location,
      delivery_components: {
        city: mergedData.delivery_city,
        state: mergedData.delivery_state,
        zip: mergedData.delivery_zip
      },
      dimensions: mergedData.dimensions,
      temperature_requirements: mergedData.temperature,
      hazmat_details: mergedData.hazmat_class ? {
        class: mergedData.hazmat_class,
        un_number: mergedData.un_number,
        proper_shipping_name: mergedData.proper_shipping_name,
        packing_group: mergedData.packing_group,
        emergency_contact: mergedData.emergency_contact,
        placards_required: mergedData.placards_required
      } : undefined,
      special_requirements: mergedData.special_requirements,
      ltl_details: freightType === 'LTL' ? {
        freight_class: mergedData.freight_class,
        packaging_type: mergedData.packaging_type,
        accessorials: mergedData.accessorials
      } : undefined,
      flatbed_details: freightType === 'FTL_FLATBED' ? {
        tarping_required: mergedData.tarping_required,
        oversize_permits: mergedData.oversize_permits,
        escort_required: mergedData.escort_required
      } : undefined
    }
    
    // Create the load record
    const load = await prisma.load.create({
      data: {
        brokerId: emailData.brokerId,
        shipperEmail: emailData.from,
        originZip: originZip,
        destZip: destZip,
        weightLb: mergedData.weight || 0,
        commodity: mergedData.commodity || 'General Freight',
        pickupDt: pickupDate,
        status: 'NEW_RFQ',
        sourceType: 'EMAIL',
        equipment: equipment,
        rawEmailText: `Subject: ${emailData.subject}\n\n${emailData.content}`,
        extractionConfidence: 0.95,
        aiNotes: JSON.stringify(aiNotes),
        priorityLevel: freightType === 'FTL_HAZMAT' ? 8 : 5,
        createdBy: 'clarification_response_handler'
      }
    })

    console.log('Created load from clarification response:', load.id)
    return load.id
  }

  private static extractZipCode(location: string): string | null {
    if (!location) return null
    const zipMatch = location.match(/\b\d{5}\b/)
    return zipMatch ? zipMatch[0] : null
  }

  /**
   * Get clarification request statistics for a broker
   */
  static async getStatistics(brokerId: string): Promise<{
    total: number
    pending: number
    responded: number
    converted: number
    averageResponseTime: number | null
  }> {
    const requests = await prisma.clarificationRequest.findMany({
      where: { brokerId }
    })

    const pending = requests.filter(r => !r.responseReceived).length
    const responded = requests.filter(r => r.responseReceived).length
    const converted = requests.filter(r => r.loadCreated).length

    // Calculate average response time
    const responseTimes = requests
      .filter(r => r.responseReceived && r.sentAt && r.responseReceivedAt)
      .map(r => r.responseReceivedAt!.getTime() - r.sentAt!.getTime())

    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null

    return {
      total: requests.length,
      pending,
      responded,
      converted,
      averageResponseTime
    }
  }
}