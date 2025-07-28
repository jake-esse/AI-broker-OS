/**
 * Carrier Quote Response Handler
 * 
 * Processes email responses from carriers containing quotes
 * and updates the system with their rates
 */

import { OpenAI } from 'openai'
import prisma from '@/lib/prisma'

export interface CarrierQuoteResult {
  isQuoteResponse: boolean
  loadId?: string
  quoteId?: string
  rate?: number
  ratePerMile?: number
  availability?: string
  notes?: string
  confidence: number
}

export class CarrierQuoteHandler {
  private openai: OpenAI
  
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    
    this.openai = new OpenAI({ apiKey })
  }
  
  /**
   * Process a potential carrier quote response
   */
  async processCarrierEmail(emailData: {
    from: string
    to: string
    subject: string
    content: string
    brokerId: string
    inReplyTo?: string
    references?: string
    messageId?: string
  }): Promise<CarrierQuoteResult> {
    try {
      console.log('[CarrierQuoteHandler] Processing email from:', emailData.from)
      
      // First check if this is a reply to a quote request
      const loadInfo = await this.identifyLoadFromEmail(emailData)
      
      if (!loadInfo) {
        return {
          isQuoteResponse: false,
          confidence: 0
        }
      }
      
      // Extract quote information using LLM
      const quoteData = await this.extractQuoteData(emailData)
      
      if (!quoteData.isQuoteResponse || !quoteData.rate) {
        return quoteData
      }
      
      // Find the quote record
      const quote = await prisma.quote.findFirst({
        where: {
          loadId: loadInfo.loadId,
          carrierEmail: emailData.from,
          status: 'pending'
        },
        orderBy: { createdAt: 'desc' }
      })
      
      if (!quote) {
        console.log('[CarrierQuoteHandler] No pending quote found for this carrier')
        return {
          isQuoteResponse: false,
          confidence: 0
        }
      }
      
      // Update quote with carrier's response
      await prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: 'responded',
          respondedAt: new Date(),
          rate: quoteData.rate,
          ratePerMile: quoteData.ratePerMile,
          notes: quoteData.notes,
          responseMethod: 'email'
        }
      })
      
      // Get load details for chat message
      const load = await prisma.load.findUnique({
        where: { id: loadInfo.loadId }
      })
      
      if (load) {
        // Create real-time chat notification
        await prisma.chatMessage.create({
          data: {
            loadId: loadInfo.loadId,
            brokerId: load.brokerId,
            role: 'assistant',
            content: this.formatQuoteNotification(emailData.from, quoteData, load),
            metadata: {
              type: 'carrier_quote',
              quoteId: quote.id,
              carrierEmail: emailData.from,
              rate: quoteData.rate,
              ratePerMile: quoteData.ratePerMile
            }
          }
        })
      }
      
      return {
        ...quoteData,
        loadId: loadInfo.loadId,
        quoteId: quote.id
      }
      
    } catch (error) {
      console.error('[CarrierQuoteHandler] Error processing carrier email:', error)
      return {
        isQuoteResponse: false,
        confidence: 0
      }
    }
  }
  
  /**
   * Identify which load this email is about
   */
  private async identifyLoadFromEmail(emailData: any): Promise<{ loadId: string } | null> {
    // Check if it's a reply to our quote request
    if (emailData.inReplyTo || emailData.references) {
      // Extract load ID from message ID if we embedded it
      const messageIdMatch = (emailData.inReplyTo || emailData.references).match(/load-([a-f0-9-]+)-quote/i)
      if (messageIdMatch) {
        return { loadId: messageIdMatch[1] }
      }
    }
    
    // Check subject for load references
    const subjectMatch = emailData.subject.match(/(\d{5})\s*to\s*(\d{5})/i)
    if (subjectMatch) {
      // Try to find a recent load with these zip codes
      const recentLoad = await prisma.load.findFirst({
        where: {
          brokerId: emailData.brokerId,
          originZip: subjectMatch[1],
          destZip: subjectMatch[2],
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        },
        orderBy: { createdAt: 'desc' }
      })
      
      if (recentLoad) {
        return { loadId: recentLoad.id }
      }
    }
    
    return null
  }
  
  /**
   * Extract quote information from email using LLM
   */
  private async extractQuoteData(emailData: any): Promise<CarrierQuoteResult> {
    const systemPrompt = `You are an AI assistant for a freight broker. Analyze carrier emails to determine if they contain rate quotes.

Extract the following information if present:
- Total rate/price (all-in rate including fuel)
- Rate per mile (if mentioned)
- Driver/truck availability
- Any special notes or conditions

Return JSON with:
{
  "isQuoteResponse": boolean,
  "rate": number (total rate in dollars),
  "ratePerMile": number or null,
  "availability": "immediate" | "24 hours" | "48 hours" | "other" | null,
  "notes": string or null,
  "confidence": 0-100
}`

    const userPrompt = `Analyze this email for carrier quote information:

From: ${emailData.from}
Subject: ${emailData.subject}

Content:
${emailData.content}`

    const completion = await this.openai.chat.completions.create({
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500
    })
    
    const response = JSON.parse(completion.choices[0].message.content || '{}')
    console.log('[CarrierQuoteHandler] LLM Response:', response)
    
    return response
  }
  
  /**
   * Format quote notification for chat
   */
  private formatQuoteNotification(carrierEmail: string, quoteData: any, load: any): string {
    let message = `💰 **New Quote Received!**\n\n`
    message += `**Carrier:** ${carrierEmail}\n`
    message += `**Rate:** $${quoteData.rate.toLocaleString()}`
    
    if (quoteData.ratePerMile) {
      message += ` ($${quoteData.ratePerMile}/mile)`
    }
    
    message += `\n`
    
    if (quoteData.availability) {
      const availabilityText = {
        'immediate': 'Available immediately',
        '24 hours': 'Available within 24 hours',
        '48 hours': 'Available within 48 hours',
        'other': 'Check notes for availability'
      }[quoteData.availability] || quoteData.availability
      
      message += `**Availability:** ${availabilityText}\n`
    }
    
    if (quoteData.notes) {
      message += `\n**Carrier Notes:**\n${quoteData.notes}`
    }
    
    // Compare to market rate if available
    const aiNotes = typeof load.aiNotes === 'string' 
      ? JSON.parse(load.aiNotes) 
      : (load.aiNotes || {})
    const marketPricing = aiNotes.marketPricing
    
    if (marketPricing && marketPricing.totalRate) {
      const difference = quoteData.rate - marketPricing.totalRate
      const percentDiff = (difference / marketPricing.totalRate * 100).toFixed(1)
      
      message += `\n\n`
      if (difference > 0) {
        message += `⬆️ This quote is $${Math.abs(difference)} (${Math.abs(Number(percentDiff))}%) above market rate`
      } else if (difference < 0) {
        message += `⬇️ This quote is $${Math.abs(difference)} (${Math.abs(Number(percentDiff))}%) below market rate`
      } else {
        message += `✅ This quote matches the market rate`
      }
    }
    
    return message
  }
}