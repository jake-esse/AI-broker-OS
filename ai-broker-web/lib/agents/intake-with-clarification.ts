/**
 * Enhanced Intake Agent with Clarification Flow
 * 
 * Implements the complete email intake process including:
 * 1. Initial email processing (4-step sequential)
 * 2. Clarification email generation if info missing
 * 3. Response monitoring and extraction
 * 4. Re-validation and final processing
 */

import { OpenAI } from 'openai'
import prisma from '@/lib/prisma'
import { FreightValidator, FreightType, LoadData } from '@/lib/freight-types/freight-validator'
import { EnhancedFreightValidator } from '@/lib/freight-types/enhanced-validator'
import { ClarificationGenerator } from '@/lib/email/clarification-generator'
import { EmailResponseProcessor } from '@/lib/email/response-processor'
import { OAuthEmailSender } from '@/lib/email/oauth-sender'

export interface IntakeResult {
  loadId: string
  status: 'quote_ready' | 'clarification_sent' | 'ignored'
  freightType?: FreightType
  extractedData?: LoadData
  clarificationEmailSent?: boolean
  missingFields?: string[]
}

export class IntakeAgentWithClarification {
  private openai: OpenAI
  private emailSender: OAuthEmailSender
  private clarificationGenerator: ClarificationGenerator
  private responseProcessor: EmailResponseProcessor
  
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    
    if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set')
    
    this.openai = new OpenAI({ apiKey })
    this.emailSender = new OAuthEmailSender()
    this.clarificationGenerator = new ClarificationGenerator()
    this.responseProcessor = new EmailResponseProcessor()
  }
  
  async processInitialEmail(emailData: {
    from: string
    to: string
    subject: string
    content: string
    brokerId: string
    messageId?: string
    inReplyTo?: string
    references?: string
  }): Promise<IntakeResult> {
    // Check if this is a response to a clarification
    if (emailData.inReplyTo || emailData.references) {
      const responseResult = await this.processResponseEmail({
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        content: emailData.content,
        inReplyTo: emailData.inReplyTo,
        threadId: emailData.references
      })
      
      if (responseResult) {
        return responseResult
      }
      // If no related load found, process as new email
    }
    // Step 1: Classification
    const classification = await this.classifyEmail(emailData)
    if (!classification.isLoadRequest) {
      return { 
        loadId: '', 
        status: 'ignored' 
      }
    }
    
    // Step 2: Extraction
    const extraction = await this.extractData(emailData)
    if (!extraction.extractedData) {
      return { 
        loadId: '', 
        status: 'ignored' 
      }
    }
    
    // Step 3: Freight Type
    const freightType = this.identifyFreightType(extraction.extractedData)
    
    // Step 4: Validation
    const validation = this.validateData(extraction.extractedData, freightType.freightType)
    
    // Create load record in database
    const load = await this.createLoadRecord({
      emailData,
      extractedData: extraction.extractedData,
      freightType: freightType.freightType,
      validation
    })
    
    // If validation passed, ready for quote
    if (validation.criticalIssues.length === 0) {
      return {
        loadId: load.id,
        status: 'quote_ready',
        freightType: freightType.freightType,
        extractedData: extraction.extractedData
      }
    }
    
    // Send clarification email
    const clarificationSent = await this.sendClarificationEmail({
      load,
      emailData,
      extractedData: extraction.extractedData,
      freightType: freightType.freightType,
      missingFields: validation.criticalIssues
    })
    
    return {
      loadId: load.id,
      status: 'clarification_sent',
      freightType: freightType.freightType,
      extractedData: extraction.extractedData,
      clarificationEmailSent: clarificationSent,
      missingFields: validation.criticalIssues.map(i => i.field)
    }
  }
  
  async processResponseEmail(emailData: {
    from: string
    to: string
    subject: string
    content: string
    inReplyTo?: string
    threadId?: string
  }): Promise<IntakeResult | null> {
    // Find the original load based on thread or reply-to
    const load = await this.findRelatedLoad(emailData)
    if (!load) return null
    
    // Process the response to extract missing info
    const response = await this.responseProcessor.processResponse({
      originalLoadId: load.id,
      threadId: emailData.threadId || load.threadId || '',
      emailContent: emailData.content,
      emailSubject: emailData.subject,
      existingData: this.loadToLoadData(load),
      freightType: load.freightType as FreightType,
      missingFields: load.missingFields || []
    })
    
    // Update load with merged data
    await this.responseProcessor.updateLoadInDatabase(
      load.id,
      response.mergedData,
      response.stillMissingFields
    )
    
    // Re-validate with updated data
    const revalidation = this.validateData(response.mergedData, load.freightType as FreightType)
    
    // If still missing critical info, send another clarification
    if (revalidation.criticalIssues.length > 0) {
      await this.sendClarificationEmail({
        load,
        emailData,
        extractedData: response.mergedData,
        freightType: load.freightType as FreightType,
        missingFields: revalidation.criticalIssues
      })
      
      return {
        loadId: load.id,
        status: 'clarification_sent',
        freightType: load.freightType as FreightType,
        extractedData: response.mergedData,
        missingFields: revalidation.criticalIssues.map(i => i.field)
      }
    }
    
    // All info complete - ready for quote
    await prisma.load.update({
      where: { id: load.id },
      data: { 
        status: 'READY_TO_QUOTE',
        missingFields: []
      }
    })
    
    return {
      loadId: load.id,
      status: 'quote_ready',
      freightType: load.freightType as FreightType,
      extractedData: response.mergedData
    }
  }
  
  private async classifyEmail(emailData: any): Promise<{ isLoadRequest: boolean }> {
    const systemPrompt = `Classify if this is a NEW freight load request.
    
IS a load when:
- Specific cargo needs transportation now/soon
- Has pickup/delivery details
- Requesting quote for actual shipment

NOT a load:
- Responses to our clarification emails
- Carrier offering capacity
- Payment disputes
- General inquiries

Return JSON: { "is_load_request": boolean }`

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
    return { isLoadRequest: result.is_load_request || false }
  }
  
  private async extractData(emailData: any): Promise<{ extractedData: LoadData | null }> {
    const systemPrompt = `Extract freight information from email.

Extract these fields:
- pickup_location, delivery_location
- weight (in pounds)
- commodity, equipment_type
- pickup_date
- All freight-type specific fields

Return JSON with "extracted_data" object.`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract from:\nSubject: ${emailData.subject}\n\n${emailData.content}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500
    })
    
    const result = JSON.parse(completion.choices[0].message.content || '{}')
    
    // Clean up weight
    if (result.extracted_data?.weight && typeof result.extracted_data.weight === 'string') {
      const match = result.extracted_data.weight.match(/[\d,]+/)
      if (match) {
        result.extracted_data.weight = parseInt(match[0].replace(/,/g, ''))
      }
    }
    
    return { extractedData: result.extracted_data || null }
  }
  
  private identifyFreightType(data: LoadData): { freightType: FreightType } {
    return { freightType: FreightValidator.identifyFreightType(data) }
  }
  
  private validateData(data: LoadData, freightType: FreightType) {
    const basic = FreightValidator.validateRequiredFields(data, freightType)
    const semantic = EnhancedFreightValidator.validateSemantics(data, freightType)
    
    const criticalIssues = [
      ...basic.missingFields.map(field => ({
        field,
        issue: 'missing' as const,
        message: `${FreightValidator.getFieldDisplayName(field)} is required`
      })),
      ...semantic.filter(s => s.issue === 'missing' || 
        (s.issue === 'insufficient' && ['pickup_location', 'delivery_location', 'commodity'].includes(s.field)))
    ]
    
    return { criticalIssues }
  }
  
  private parsePickupDate(dateStr?: string): Date | null {
    if (!dateStr) return null
    
    const str = dateStr.toLowerCase()
    const now = new Date()
    
    if (str.includes('monday')) {
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7
      const monday = new Date(now)
      monday.setDate(now.getDate() + daysUntilMonday)
      monday.setHours(9, 0, 0, 0) // Default to 9 AM
      return monday
    } else if (str.includes('tomorrow')) {
      const tomorrow = new Date(now)
      tomorrow.setDate(now.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)
      return tomorrow
    } else if (str.includes('today')) {
      const today = new Date(now)
      today.setHours(14, 0, 0, 0) // Default to 2 PM for same day
      return today
    } else if (str.includes('asap')) {
      return now
    }
    
    // Try parsing as regular date
    const parsed = new Date(dateStr)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  
  private async createLoadRecord(params: {
    emailData: any
    extractedData: LoadData
    freightType: FreightType
    validation: any
  }) {
    // Also need to create required fields for the existing schema
    const originZip = params.extractedData.pickup_zip || 
                     this.extractZipFromLocation(params.extractedData.pickup_location) || 
                     '00000'
    const destZip = params.extractedData.delivery_zip || 
                   this.extractZipFromLocation(params.extractedData.delivery_location) || 
                   '00000'
    
    return await prisma.load.create({
      data: {
        brokerId: params.emailData.brokerId,
        shipperEmail: params.emailData.from,
        freightType: params.freightType,
        status: params.validation.criticalIssues.length === 0 ? 'READY_TO_QUOTE' : 'AWAITING_INFO',
        pickupLocation: params.extractedData.pickup_location,
        deliveryLocation: params.extractedData.delivery_location,
        weight: params.extractedData.weight || 0,
        weightLb: params.extractedData.weight || 0, // Required field
        commodity: params.extractedData.commodity,
        pickupDate: this.parsePickupDate(params.extractedData.pickup_date),
        pickupDt: this.parsePickupDate(params.extractedData.pickup_date) || new Date(), // Required field
        equipmentType: params.extractedData.equipment_type,
        equipment: this.mapEquipmentType(params.extractedData.equipment_type) || 'DRY_VAN', // Required field
        temperature: params.extractedData.temperature ? JSON.stringify(params.extractedData.temperature) : null,
        dimensions: params.extractedData.dimensions ? JSON.stringify(params.extractedData.dimensions) : null,
        missingFields: params.validation.criticalIssues.map((i: any) => i.field),
        threadId: params.emailData.messageId,
        originalEmailSubject: params.emailData.subject,
        originalEmailContent: params.emailData.content,
        originZip, // Required field
        destZip, // Required field
        sourceType: 'EMAIL',
        createdBy: 'intake_with_clarification'
      }
    })
  }
  
  private extractZipFromLocation(location?: string): string | null {
    if (!location) return null
    const match = location.match(/\b\d{5}\b/)
    return match ? match[0] : null
  }
  
  private mapEquipmentType(equipmentType?: string): string {
    if (!equipmentType) return 'DRY_VAN'
    const type = equipmentType.toLowerCase()
    if (type.includes('reefer') || type.includes('refrigerated')) return 'REEFER'
    if (type.includes('flatbed')) return 'FLATBED'
    if (type.includes('dry van') || type.includes('van')) return 'DRY_VAN'
    return 'DRY_VAN'
  }
  
  private async sendClarificationEmail(params: {
    load: any
    emailData: any
    extractedData: LoadData
    freightType: FreightType
    missingFields: any[]
  }): Promise<boolean> {
    try {
      // Get broker info for email personalization
      const broker = await prisma.broker.findUnique({
        where: { id: params.load.brokerId }
      })
      
      const emailContent = await this.clarificationGenerator.generateEmail({
        shipperEmail: params.load.shipperEmail,
        brokerName: broker?.companyName || 'Your Freight Broker',
        freightType: params.freightType,
        extractedData: params.extractedData,
        missingFields: params.missingFields,
        originalSubject: params.load.originalEmailSubject,
        originalContent: params.load.originalEmailContent,
        loadId: params.load.id,
        threadId: params.load.threadId
      })
      
      const result = await this.emailSender.sendEmail(params.load.brokerId, {
        to: params.load.shipperEmail,
        subject: emailContent.subject,
        htmlContent: emailContent.htmlContent,
        textContent: emailContent.textContent,
        inReplyTo: params.load.threadId,
        references: params.load.threadId
      })
      
      if (result.success) {
        // Update load with clarification sent timestamp
        await prisma.load.update({
          where: { id: params.load.id },
          data: { 
            lastClarificationSent: new Date(),
            clarificationCount: { increment: 1 }
          }
        })
        
        console.log(`Clarification email sent via ${result.provider} to ${params.load.shipperEmail}`)
        return true
      } else {
        console.error('Failed to send clarification email:', result.error)
        return false
      }
    } catch (error) {
      console.error('Failed to send clarification email:', error)
      return false
    }
  }
  
  private async findRelatedLoad(emailData: any) {
    // Try to find by thread ID first
    if (emailData.threadId) {
      const load = await prisma.load.findFirst({
        where: {
          threadId: emailData.threadId
        }
      })
      if (load) return load
    }
    
    // Try to find by email subject (Re: pattern)
    if (emailData.subject.toLowerCase().startsWith('re:')) {
      const originalSubject = emailData.subject.replace(/^re:\s*/i, '').trim()
      return await prisma.load.findFirst({
        where: {
          originalEmailSubject: {
            contains: originalSubject,
            mode: 'insensitive'
          },
          shipperEmail: emailData.from
        },
        orderBy: { createdAt: 'desc' }
      })
    }
    
    // Try to find by shipper email and recent timeframe
    return await prisma.load.findFirst({
      where: {
        shipperEmail: emailData.from,
        status: 'AWAITING_INFO',
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Within last 7 days
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  }
  
  private loadToLoadData(load: any): LoadData {
    return {
      pickup_location: load.pickupLocation,
      delivery_location: load.deliveryLocation,
      weight: load.weight,
      commodity: load.commodity,
      pickup_date: load.pickupDate?.toISOString().split('T')[0],
      equipment_type: load.equipmentType,
      temperature: load.temperature ? JSON.parse(load.temperature) : undefined,
      dimensions: load.dimensions ? JSON.parse(load.dimensions) : undefined,
      hazmat_class: load.hazmatClass,
      un_number: load.unNumber,
      proper_shipping_name: load.properShippingName,
      packing_group: load.packingGroup,
      emergency_contact: load.emergencyContact,
      technical_name: load.technicalName,
      special_requirements: load.specialRequirements,
      freight_class: load.freightClass,
      piece_count: load.pieceCount
    }
  }
}