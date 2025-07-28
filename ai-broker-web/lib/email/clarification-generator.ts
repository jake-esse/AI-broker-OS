/**
 * Clarification Email Generator
 * 
 * Uses LLM to generate professional, context-aware emails requesting missing information
 * from shippers based on freight type and validation results.
 */

import { OpenAI } from 'openai'
import { FreightType, LoadData, FreightValidator } from '@/lib/freight-types/freight-validator'

export interface ClarificationEmailData {
  shipperEmail: string
  brokerName: string
  freightType: FreightType
  extractedData: LoadData
  missingFields: Array<{
    field: string
    issue: 'missing' | 'insufficient'
    message: string
  }>
  validationWarnings?: string[]
  originalSubject?: string
  originalContent?: string
  loadId: string
  threadId?: string
}

export class ClarificationGenerator {
  private openai: OpenAI
  
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    this.openai = new OpenAI({ apiKey })
  }
  
  async generateEmail(data: ClarificationEmailData): Promise<{
    subject: string
    htmlContent: string
    textContent: string
  }> {
    // Use LLM for dynamic generation
    const llmResponse = await this.generateWithLLM(data)
    
    // Fall back to static generation if LLM fails
    if (!llmResponse.success) {
      const subject = this.generateSubject(data.originalSubject)
      const htmlContent = this.generateHtmlContent(data)
      const textContent = this.generateTextContent(data)
      return { subject, htmlContent, textContent }
    }
    
    return {
      subject: llmResponse.subject,
      htmlContent: llmResponse.htmlContent,
      textContent: llmResponse.textContent
    }
  }
  
  private async generateWithLLM(data: ClarificationEmailData): Promise<{
    success: boolean
    subject: string
    htmlContent: string
    textContent: string
  }> {
    try {
      const systemPrompt = `You are a professional freight broker drafting an email to request missing information from a shipper.

Key requirements:
1. Be professional but friendly
2. Reference their original request for context
3. Acknowledge what information you already have
4. Clearly list what specific information is missing
5. Explain why each piece of missing information is needed for accurate quoting
6. Make it easy for the shipper to respond with the information
7. Include the load reference ID: ${data.loadId}
8. Use the broker name: ${data.brokerName}

Freight type context:
- This is a ${data.freightType} shipment
- Different freight types need different information for accurate quoting
- Be specific about format needed (e.g., "Please provide pickup time in format: MM/DD/YYYY HH:MM AM/PM")

Return JSON with:
{
  "subject": "Email subject line", 
  "htmlContent": "Full HTML email body with proper formatting and styling",
  "textContent": "Plain text version of the email"
}`

      const userPrompt = this.buildUserPrompt(data)
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000
      })
      
      const result = JSON.parse(completion.choices[0].message.content || '{}')
      
      return {
        success: true,
        subject: result.subject || this.generateSubject(data.originalSubject),
        htmlContent: result.htmlContent || this.generateHtmlContent(data),
        textContent: result.textContent || this.generateTextContent(data)
      }
    } catch (error) {
      console.error('LLM generation failed:', error)
      return {
        success: false,
        subject: '',
        htmlContent: '',
        textContent: ''
      }
    }
  }
  
  private buildUserPrompt(data: ClarificationEmailData): string {
    const existingInfo = this.formatExistingInfo(data.extractedData, data.freightType)
    const missingInfo = this.formatMissingInfo(data.missingFields, data.freightType)
    
    let prompt = `Original email context:
Subject: ${data.originalSubject || 'Quote Request'}
${data.originalContent ? `Content: ${data.originalContent}` : ''}

Load Reference: ${data.loadId}
Freight Type: ${FreightValidator.getFreightTypeDescription(data.freightType)}

Information we already have:
${existingInfo}

Information we need:
${missingInfo}`

    if (data.validationWarnings?.length) {
      prompt += `\n\nAdditional concerns:
${data.validationWarnings.join('\n')}`
    }

    prompt += '\n\nPlease draft a professional email requesting the missing information.'
    
    return prompt
  }
  
  private formatExistingInfo(data: LoadData, freightType: FreightType): string {
    const info: string[] = []
    
    if (data.pickup_location) info.push(`✓ Pickup: ${data.pickup_location}`)
    if (data.delivery_location) info.push(`✓ Delivery: ${data.delivery_location}`)
    if (data.weight) info.push(`✓ Weight: ${data.weight.toLocaleString()} lbs`)
    if (data.commodity) info.push(`✓ Commodity: ${data.commodity}`)
    if (data.pickup_date) info.push(`✓ Pickup Date: ${data.pickup_date}`)
    if (data.equipment_type) info.push(`✓ Equipment: ${data.equipment_type}`)
    
    // Freight type specific
    if (freightType === 'FTL_REEFER' && data.temperature) {
      info.push(`✓ Temperature: ${this.formatTemperature(data.temperature)}`)
    }
    
    if (freightType === 'FTL_FLATBED' && data.dimensions) {
      info.push(`✓ Dimensions: ${data.dimensions.length}' × ${data.dimensions.width}' × ${data.dimensions.height}'`)
    }
    
    if (freightType === 'FTL_HAZMAT') {
      if (data.hazmat_class) info.push(`✓ Hazmat Class: ${data.hazmat_class}`)
      if (data.un_number) info.push(`✓ UN Number: ${data.un_number}`)
    }
    
    return info.join('\n')
  }
  
  private formatMissingInfo(
    missingFields: Array<{ field: string; issue: string; message: string }>,
    freightType: FreightType
  ): string {
    const fieldDescriptions: Record<string, string> = {
      pickup_location: 'Complete pickup address including street, city, state, and ZIP code',
      delivery_location: 'Complete delivery address including street, city, state, and ZIP code',
      pickup_date: 'Specific pickup date and time (if appointment required)',
      weight: 'Total weight in pounds',
      commodity: 'Detailed description of what is being shipped',
      equipment_type: 'Type of trailer needed (dry van, reefer, flatbed, etc.)',
      temperature: 'Temperature requirements (min and max in °F)',
      dimensions: 'Length × Width × Height for each piece or total shipment',
      hazmat_class: 'DOT hazmat classification (1-9)',
      un_number: 'UN identification number',
      proper_shipping_name: 'DOT proper shipping name',
      packing_group: 'Packing group (I, II, or III)',
      emergency_contact: '24/7 emergency contact name and phone number',
      placards_required: 'Required placards for the shipment',
      technical_name: 'Technical or chemical name if applicable'
    }
    
    return missingFields.map(field => {
      const description = fieldDescriptions[field.field] || field.message
      const prefix = field.issue === 'insufficient' ? '⚠️ Incomplete' : '❌ Missing'
      return `${prefix}: ${description}`
    }).join('\n')
  }
  
  private formatTemperature(temp: any): string {
    if (typeof temp === 'object' && temp !== null) {
      if (temp.min !== undefined && temp.max !== undefined) {
        return `${temp.min}°${temp.unit || 'F'} to ${temp.max}°${temp.unit || 'F'}`
      } else if (temp.min !== undefined) {
        return `Min ${temp.min}°${temp.unit || 'F'}`
      } else if (temp.max !== undefined) {
        return `Max ${temp.max}°${temp.unit || 'F'}`
      }
    }
    return String(temp)
  }
  
  // Static fallback methods
  private generateSubject(originalSubject?: string): string {
    if (originalSubject) {
      const cleanSubject = originalSubject.replace(/^(RE:|Re:|re:|FW:|Fw:|fw:)\s*/i, '').trim()
      return `Re: ${cleanSubject}`
    }
    return 'Re: Your Quote Request'
  }

  private static generateSubject(originalSubject?: string): string {
    if (originalSubject) {
      // Format as standard email reply
      const cleanSubject = originalSubject.replace(/^(RE:|Re:|re:|FW:|Fw:|fw:)\s*/i, '').trim()
      return `Re: ${cleanSubject}`
    }
    
    // Fallback if no original subject
    return 'Re: Your Quote Request'
  }

  private static generateHtmlContent(data: ClarificationEmailData): string {
    const freightDescription = FreightValidator.getFreightTypeDescription(data.freightType)
    const missingFieldsList = data.missingFields
      .map(field => FreightValidator.getFieldDisplayName(field))
      .map(name => `<li>${name}</li>`)
      .join('\n')

    const extractedInfo = this.formatExtractedData(data.extractedData, data.freightType)
    const warningsList = data.validationWarnings?.length 
      ? `<div style="background-color: #FEF3C7; padding: 12px; border-radius: 4px; margin-top: 16px;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #92400E;">Additional Notes:</p>
          <ul style="margin: 0; padding-left: 20px;">
            ${data.validationWarnings.map(w => `<li style="color: #92400E;">${w}</li>`).join('\n')}
          </ul>
        </div>`
      : ''

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
    <h2 style="color: #1a73e8; margin-top: 0;">Additional Information Needed</h2>
    
    <p>Thank you for your quote request. I've identified this as a <strong>${freightDescription}</strong>.</p>
    
    <p>To provide you with an accurate quote, I need the following additional information:</p>
    
    <ul style="background-color: white; padding: 16px 16px 16px 32px; border-radius: 4px; border-left: 4px solid #1a73e8;">
      ${missingFieldsList}
    </ul>
    
    <div style="background-color: #E8F5E9; padding: 16px; border-radius: 4px; margin-top: 16px;">
      <h3 style="margin-top: 0; color: #2E7D32;">Information I've Already Captured:</h3>
      ${extractedInfo}
    </div>
    
    ${warningsList}
    
    <p style="margin-top: 20px;">Please reply with the missing information, and I'll prepare your quote immediately.</p>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 14px; color: #666;">
      <p style="margin: 0;">Best regards,<br>${data.brokerName}</p>
    </div>
  </div>
</body>
</html>`
  }

  private static generateTextContent(data: ClarificationEmailData): string {
    const freightDescription = FreightValidator.getFreightTypeDescription(data.freightType)
    const missingFieldsList = data.missingFields
      .map(field => FreightValidator.getFieldDisplayName(field))
      .map(name => `  - ${name}`)
      .join('\n')

    const extractedInfo = this.formatExtractedDataText(data.extractedData, data.freightType)
    const warnings = data.validationWarnings?.length
      ? `\nAdditional Notes:\n${data.validationWarnings.map(w => `  - ${w}`).join('\n')}\n`
      : ''

    return `Additional Information Needed

Thank you for your quote request. I've identified this as a ${freightDescription}.

To provide you with an accurate quote, I need the following additional information:

${missingFieldsList}

Information I've Already Captured:
${extractedInfo}
${warnings}
Please reply with the missing information, and I'll prepare your quote immediately.

Best regards,
${data.brokerName}`
  }

  private static formatExtractedData(data: LoadData, freightType: FreightType): string {
    const sections: string[] = []

    // Basic information
    if (data.pickup_location || data.delivery_location) {
      sections.push(`<p style="margin: 4px 0;"><strong>Route:</strong> ${data.pickup_location || 'TBD'} → ${data.delivery_location || 'TBD'}</p>`)
    }
    if (data.commodity) {
      sections.push(`<p style="margin: 4px 0;"><strong>Commodity:</strong> ${data.commodity}</p>`)
    }
    if (data.weight) {
      sections.push(`<p style="margin: 4px 0;"><strong>Weight:</strong> ${data.weight.toLocaleString()} lbs</p>`)
    }
    if (data.pickup_date) {
      sections.push(`<p style="margin: 4px 0;"><strong>Pickup Date:</strong> ${data.pickup_date}</p>`)
    }

    // Freight-type specific information
    if (freightType === 'FTL_REEFER' && data.temperature) {
      sections.push(`<p style="margin: 4px 0;"><strong>Temperature:</strong> ${data.temperature.min}°${data.temperature.unit} to ${data.temperature.max}°${data.temperature.unit}</p>`)
    }
    if (freightType === 'FTL_FLATBED' && data.dimensions) {
      sections.push(`<p style="margin: 4px 0;"><strong>Dimensions:</strong> ${data.dimensions.length}" × ${data.dimensions.width}" × ${data.dimensions.height}"</p>`)
    }
    if (freightType === 'LTL' && data.piece_count) {
      sections.push(`<p style="margin: 4px 0;"><strong>Piece Count:</strong> ${data.piece_count}</p>`)
    }
    if (freightType === 'FTL_HAZMAT' && data.hazmat_class) {
      sections.push(`<p style="margin: 4px 0;"><strong>Hazmat Class:</strong> ${data.hazmat_class}</p>`)
    }

    return sections.join('\n')
  }

  private static formatExtractedDataText(data: LoadData, freightType: FreightType): string {
    const lines: string[] = []

    if (data.pickup_location || data.delivery_location) {
      lines.push(`  Route: ${data.pickup_location || 'TBD'} → ${data.delivery_location || 'TBD'}`)
    }
    if (data.commodity) {
      lines.push(`  Commodity: ${data.commodity}`)
    }
    if (data.weight) {
      lines.push(`  Weight: ${data.weight.toLocaleString()} lbs`)
    }
    if (data.pickup_date) {
      lines.push(`  Pickup Date: ${data.pickup_date}`)
    }

    // Freight-type specific information
    if (freightType === 'FTL_REEFER' && data.temperature) {
      lines.push(`  Temperature: ${data.temperature.min}°${data.temperature.unit} to ${data.temperature.max}°${data.temperature.unit}`)
    }
    if (freightType === 'FTL_FLATBED' && data.dimensions) {
      lines.push(`  Dimensions: ${data.dimensions.length}" × ${data.dimensions.width}" × ${data.dimensions.height}"`)
    }
    if (freightType === 'LTL' && data.piece_count) {
      lines.push(`  Piece Count: ${data.piece_count}`)
    }
    if (freightType === 'FTL_HAZMAT' && data.hazmat_class) {
      lines.push(`  Hazmat Class: ${data.hazmat_class}`)
    }

    return lines.join('\n')
  }

  /**
   * Generate specific examples of what information is needed based on freight type
   */
  static getExampleFormat(freightType: FreightType, missingFields: string[]): string {
    const examples: Record<string, string> = {
      temperature: 'Temperature: 32-36°F or -10°F frozen',
      dimensions: 'Dimensions: 48" x 40" x 48" (length x width x height)',
      hazmat_class: 'Hazmat Class: 3 (flammable liquids)',
      un_number: 'UN Number: UN1203',
      proper_shipping_name: 'Proper Shipping Name: Gasoline',
      packing_group: 'Packing Group: II',
      emergency_contact: 'Emergency Contact: John Smith 555-123-4567 (24/7)',
      freight_class: 'Freight Class: 125',
      piece_count: 'Piece Count: 5 pallets',
      weight: 'Weight: 35,000 lbs',
      pickup_date: 'Pickup Date: December 20, 2024 or ASAP'
    }

    const relevantExamples = missingFields
      .filter(field => examples[field])
      .map(field => examples[field])

    if (relevantExamples.length === 0) return ''

    return `\n\nExample format:\n${relevantExamples.join('\n')}`
  }
}