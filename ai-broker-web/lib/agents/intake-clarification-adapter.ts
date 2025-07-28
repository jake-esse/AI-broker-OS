/**
 * Intake Clarification Adapter
 * 
 * Adapts the new clarification flow to work with the existing database schema
 * Uses OAuth email sending instead of Resend
 */

import { IntakeAgentLLMEnhanced } from './intake-llm-enhanced'
import { ClarificationGenerator } from '@/lib/email/clarification-generator'
import { EmailResponseProcessor } from '@/lib/email/response-processor'
import { OAuthEmailSender } from '@/lib/email/oauth-sender'
import prisma from '@/lib/prisma'
import { FreightType, LoadData } from '@/lib/freight-types/freight-validator'

export class IntakeClarificationAdapter {
  private enhancedAgent: IntakeAgentLLMEnhanced
  private clarificationGen: ClarificationGenerator
  private responseProcessor: EmailResponseProcessor
  private emailSender: OAuthEmailSender
  
  constructor() {
    this.enhancedAgent = new IntakeAgentLLMEnhanced()
    this.clarificationGen = new ClarificationGenerator()
    this.responseProcessor = new EmailResponseProcessor()
    this.emailSender = new OAuthEmailSender()
  }
  
  async processInitialEmail(emailData: {
    from: string
    to: string
    subject: string
    content: string
    brokerId: string
    messageId?: string
  }) {
    // Use existing enhanced agent
    const result = await this.enhancedAgent.processEmail(emailData)
    
    // Map to new format
    if (result.action === 'proceed_to_quote' && result.load_id) {
      return {
        loadId: result.load_id,
        status: 'quote_ready' as const,
        freightType: result.freight_type,
        extractedData: result.extracted_data
      }
    } else if (result.action === 'request_clarification') {
      // Store in ClarificationRequest table for tracking
      if (result.extracted_data && Object.keys(result.extracted_data).length > 0) {
        await prisma.clarificationRequest.create({
          data: {
            brokerId: emailData.brokerId,
            shipperEmail: emailData.from,
            freightType: result.freight_type || 'UNKNOWN',
            extractedData: result.extracted_data,
            missingFields: result.missing_fields || [],
            validationWarnings: result.validation_warnings || [],
            emailMessageId: emailData.messageId
          }
        })
      }
      
      return {
        loadId: '',
        status: 'clarification_sent' as const,
        freightType: result.freight_type,
        extractedData: result.extracted_data,
        missingFields: result.missing_fields,
        clarificationEmailSent: false // Will be sent by route handler
      }
    }
    
    return {
      loadId: '',
      status: 'ignored' as const
    }
  }
  
  async processResponseEmail(emailData: {
    from: string
    to: string
    subject: string
    content: string
    inReplyTo?: string
    threadId?: string
  }) {
    // Find related clarification request
    const clarificationRequest = await prisma.clarificationRequest.findFirst({
      where: {
        shipperEmail: emailData.from,
        responseReceived: false,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Within last 7 days
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    
    if (!clarificationRequest) {
      return null
    }
    
    // Extract missing info from response
    const response = await this.responseProcessor.processResponse({
      originalLoadId: '',
      threadId: emailData.threadId || '',
      emailContent: emailData.content,
      emailSubject: emailData.subject,
      existingData: clarificationRequest.extractedData as LoadData,
      freightType: clarificationRequest.freightType as FreightType,
      missingFields: clarificationRequest.missingFields || []
    })
    
    // Update clarification request with merged data
    await prisma.clarificationRequest.update({
      where: { id: clarificationRequest.id },
      data: {
        responseReceived: true,
        responseReceivedAt: new Date(),
        mergedData: response.mergedData
      }
    })
    
    // Check if we now have all required info
    if (response.stillMissingFields.length === 0) {
      // Create load with complete data
      const loadData = response.mergedData
      const load = await prisma.load.create({
        data: {
          brokerId: clarificationRequest.brokerId,
          shipperEmail: clarificationRequest.shipperEmail,
          originZip: this.extractZip(loadData.pickup_location) || '00000',
          destZip: this.extractZip(loadData.delivery_location) || '00000',
          weightLb: loadData.weight || 0,
          commodity: loadData.commodity,
          pickupDt: loadData.pickup_date ? new Date(loadData.pickup_date) : new Date(),
          equipment: loadData.equipment_type || 'DRY VAN',
          status: 'NEW_RFQ',
          sourceType: 'EMAIL',
          rawEmailText: `${clarificationRequest.extractedData}\n\nResponse:\n${emailData.content}`,
          missingFields: []
        }
      })
      
      // Update clarification request
      await prisma.clarificationRequest.update({
        where: { id: clarificationRequest.id },
        data: {
          loadCreated: true,
          loadId: load.id
        }
      })
      
      return {
        loadId: load.id,
        status: 'quote_ready' as const,
        freightType: clarificationRequest.freightType as FreightType,
        extractedData: response.mergedData
      }
    } else {
      // Still missing info
      return {
        loadId: '',
        status: 'clarification_sent' as const,
        freightType: clarificationRequest.freightType as FreightType,
        extractedData: response.mergedData,
        missingFields: response.stillMissingFields,
        clarificationEmailSent: false
      }
    }
  }
  
  private extractZip(location?: string): string | null {
    if (!location) return null
    const match = location.match(/\b\d{5}\b/)
    return match ? match[0] : null
  }
  
  async sendClarificationEmail(params: {
    brokerId: string
    shipperEmail: string
    freightType: FreightType
    extractedData: any
    missingFields: Array<{ field: string; issue: 'missing' | 'insufficient'; message: string }>
    originalSubject?: string
    originalContent?: string
    messageId?: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Get broker info
      const broker = await prisma.broker.findUnique({
        where: { id: params.brokerId }
      })
      
      if (!broker) {
        return { success: false, error: 'Broker not found' }
      }
      
      // Generate clarification email
      const emailContent = await this.clarificationGen.generateEmail({
        shipperEmail: params.shipperEmail,
        brokerName: broker.companyName || 'Your Freight Broker',
        freightType: params.freightType,
        extractedData: params.extractedData,
        missingFields: params.missingFields,
        originalSubject: params.originalSubject,
        originalContent: params.originalContent,
        loadId: `REQ-${Date.now()}`,
        threadId: params.messageId
      })
      
      // Send via OAuth
      const result = await this.emailSender.sendEmail(params.brokerId, {
        to: params.shipperEmail,
        subject: emailContent.subject,
        htmlContent: emailContent.htmlContent,
        textContent: emailContent.textContent,
        inReplyTo: params.messageId,
        references: params.messageId
      })
      
      if (result.success) {
        // Update clarification request if exists
        const clarificationRequest = await prisma.clarificationRequest.findFirst({
          where: {
            brokerId: params.brokerId,
            shipperEmail: params.shipperEmail,
            emailMessageId: params.messageId
          }
        })
        
        if (clarificationRequest) {
          await prisma.clarificationRequest.update({
            where: { id: clarificationRequest.id },
            data: {
              emailSent: true,
              emailId: result.messageId,
              sentAt: new Date()
            }
          })
        }
      }
      
      return result
    } catch (error: any) {
      console.error('Failed to send clarification email:', error)
      return { success: false, error: error.message }
    }
  }
}