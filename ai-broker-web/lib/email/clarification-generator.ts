/**
 * Clarification Email Generator
 * 
 * Generates professional emails requesting missing information
 * based on freight type and validation results.
 */

import { FreightType, LoadData, FreightValidator } from '@/lib/freight-types/freight-validator'

export interface ClarificationEmailData {
  shipperEmail: string
  brokerName: string
  freightType: FreightType
  extractedData: LoadData
  missingFields: string[]
  validationWarnings?: string[]
}

export class ClarificationGenerator {
  static generateEmail(data: ClarificationEmailData): {
    subject: string
    htmlContent: string
    textContent: string
  } {
    const subject = this.generateSubject(data.freightType, data.extractedData)
    const htmlContent = this.generateHtmlContent(data)
    const textContent = this.generateTextContent(data)

    return { subject, htmlContent, textContent }
  }

  private static generateSubject(freightType: FreightType, extractedData: LoadData): string {
    const route = extractedData.pickup_location && extractedData.delivery_location
      ? ` - ${extractedData.pickup_location} to ${extractedData.delivery_location}`
      : ''
    
    return `Additional Information Needed for Your Quote Request${route}`
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