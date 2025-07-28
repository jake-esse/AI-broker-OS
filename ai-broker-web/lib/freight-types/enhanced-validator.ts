/**
 * Enhanced Freight Validator with Semantic Validation
 * 
 * This validator checks not just if fields exist, but if they're
 * semantically sufficient for freight operations.
 */

import { LoadData, FreightType } from './freight-validator'

export interface SemanticValidationResult {
  field: string
  value: any
  issue: 'missing' | 'insufficient' | 'invalid'
  reason: string
}

export class EnhancedFreightValidator {
  // Generic terms that are insufficient for commodity
  private static readonly GENERIC_COMMODITIES = [
    'goods', 'consumer goods', 'products', 'items', 'freight',
    'cargo', 'shipment', 'load', 'merchandise', 'stuff'
  ]

  // Landmark patterns that are insufficient for locations
  private static readonly LANDMARK_PATTERNS = [
    /near\s+(the\s+)?/i,
    /by\s+(the\s+)?/i,
    /close\s+to/i,
    /around/i,
    /vicinity\s+of/i
  ]

  /**
   * Perform semantic validation on extracted data
   */
  static validateSemantics(
    data: LoadData,
    freightType: FreightType
  ): SemanticValidationResult[] {
    const issues: SemanticValidationResult[] = []

    // Validate pickup location
    if (data.pickup_location) {
      if (this.isLandmarkOnly(data.pickup_location)) {
        issues.push({
          field: 'pickup_location',
          value: data.pickup_location,
          issue: 'insufficient',
          reason: 'Landmark reference without specific address'
        })
      }
    } else {
      issues.push({
        field: 'pickup_location',
        value: null,
        issue: 'missing',
        reason: 'Pickup location is required'
      })
    }

    // Validate delivery location
    if (data.delivery_location) {
      if (this.isLandmarkOnly(data.delivery_location)) {
        issues.push({
          field: 'delivery_location',
          value: data.delivery_location,
          issue: 'insufficient',
          reason: 'Landmark reference without specific address'
        })
      }
    } else {
      issues.push({
        field: 'delivery_location',
        value: null,
        issue: 'missing',
        reason: 'Delivery location is required'
      })
    }

    // Validate commodity
    if (data.commodity) {
      if (this.isGenericCommodity(data.commodity)) {
        issues.push({
          field: 'commodity',
          value: data.commodity,
          issue: 'insufficient',
          reason: 'Commodity description too generic for proper handling/rating'
        })
      }
    } else {
      issues.push({
        field: 'commodity',
        value: null,
        issue: 'missing',
        reason: 'Commodity description is required'
      })
    }

    // Validate pickup date
    if (data.pickup_date) {
      if (this.isTimeOnly(data.pickup_date)) {
        issues.push({
          field: 'pickup_date',
          value: data.pickup_date,
          issue: 'insufficient',
          reason: 'Time specified without date'
        })
      }
    } else {
      issues.push({
        field: 'pickup_date',
        value: null,
        issue: 'missing',
        reason: 'Pickup date is required'
      })
    }

    // Freight-type specific validations
    issues.push(...this.validateFreightSpecific(data, freightType))

    return issues
  }

  /**
   * Check if location is just a landmark reference
   */
  private static isLandmarkOnly(location: string): boolean {
    // Check for landmark patterns
    const hasLandmark = this.LANDMARK_PATTERNS.some(pattern => 
      pattern.test(location)
    )
    
    // Check if it has any specific address components
    const hasStreetNumber = /\d+\s+\w+/.test(location)
    const hasZipCode = /\b\d{5}\b/.test(location)
    const hasState = /\b[A-Z]{2}\b/.test(location)
    
    return hasLandmark && !hasStreetNumber && !hasZipCode
  }

  /**
   * Check if commodity is too generic
   */
  private static isGenericCommodity(commodity: string): boolean {
    const lower = commodity.toLowerCase().trim()
    
    // Exact match with generic terms
    if (this.GENERIC_COMMODITIES.includes(lower)) {
      return true
    }
    
    // Check if it's just generic term with simple modifier
    const pattern = new RegExp(
      `^(\\w+\\s+)?(${this.GENERIC_COMMODITIES.join('|')})$`,
      'i'
    )
    
    return pattern.test(commodity)
  }

  /**
   * Check if date field only contains time
   */
  private static isTimeOnly(date: string): boolean {
    // Patterns that indicate time only
    const timeOnlyPatterns = [
      /^\d{1,2}:\d{2}\s*(am|pm)?$/i,  // 10:30 AM
      /^\d{1,2}\s*(am|pm)$/i,          // 10 AM
      /^\d{1,2}:\d{2}$/,               // 10:30
    ]
    
    return timeOnlyPatterns.some(pattern => pattern.test(date.trim()))
  }

  /**
   * Freight-type specific semantic validations
   */
  private static validateFreightSpecific(
    data: LoadData,
    freightType: FreightType
  ): SemanticValidationResult[] {
    const issues: SemanticValidationResult[] = []

    switch (freightType) {
      case 'FTL_FLATBED':
        if (!data.dimensions) {
          issues.push({
            field: 'dimensions',
            value: null,
            issue: 'missing',
            reason: 'Dimensions required for flatbed loads'
          })
        }
        break

      case 'FTL_REEFER':
        if (!data.temperature) {
          issues.push({
            field: 'temperature',
            value: null,
            issue: 'missing',
            reason: 'Temperature requirements needed for reefer'
          })
        }
        break

      case 'LTL':
        if (!data.freight_class) {
          issues.push({
            field: 'freight_class',
            value: null,
            issue: 'missing',
            reason: 'Freight class required for LTL rating'
          })
        }
        if (!data.dimensions) {
          issues.push({
            field: 'dimensions',
            value: null,
            issue: 'missing',
            reason: 'Dimensions required for LTL classification'
          })
        }
        break

      case 'FTL_HAZMAT':
        // Check for complete hazmat info
        const hazmatFields = [
          { field: 'un_number', reason: 'UN number required for hazmat' },
          { field: 'proper_shipping_name', reason: 'Proper shipping name required' },
          { field: 'packing_group', reason: 'Packing group required' },
          { field: 'emergency_contact', reason: '24/7 emergency contact required' }
        ]
        
        for (const { field, reason } of hazmatFields) {
          if (!data[field as keyof LoadData]) {
            issues.push({
              field,
              value: null,
              issue: 'missing',
              reason
            })
          }
        }
        break
    }

    // Check for international shipment requirements
    if (this.isInternational(data)) {
      if (!data.commodity || this.isGenericCommodity(data.commodity)) {
        issues.push({
          field: 'commodity',
          value: data.commodity,
          issue: 'insufficient',
          reason: 'Specific commodity description required for customs'
        })
      }
    }

    return issues
  }

  /**
   * Check if shipment crosses international borders
   */
  private static isInternational(data: LoadData): boolean {
    // Check for Canadian postal codes or provinces
    const canadianPattern = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|\b(ON|QC|BC|AB|MB|SK)\b/
    
    const pickup = `${data.pickup_location} ${data.pickup_state} ${data.pickup_zip}`.toUpperCase()
    const delivery = `${data.delivery_location} ${data.delivery_state} ${data.delivery_zip}`.toUpperCase()
    
    // If one is Canadian and one is US, it's international
    const pickupCanadian = canadianPattern.test(pickup)
    const deliveryCanadian = canadianPattern.test(delivery)
    
    return pickupCanadian !== deliveryCanadian
  }

  /**
   * Get a summary of validation issues suitable for clarification emails
   */
  static getClarificationSummary(issues: SemanticValidationResult[]): string {
    const missing = issues.filter(i => i.issue === 'missing')
    const insufficient = issues.filter(i => i.issue === 'insufficient')
    
    let summary = ''
    
    if (missing.length > 0) {
      summary += 'Missing information:\n'
      missing.forEach(i => {
        summary += `- ${i.reason}\n`
      })
    }
    
    if (insufficient.length > 0) {
      summary += '\nInsufficient information:\n'
      insufficient.forEach(i => {
        summary += `- ${i.field}: "${i.value}" - ${i.reason}\n`
      })
    }
    
    return summary
  }
}