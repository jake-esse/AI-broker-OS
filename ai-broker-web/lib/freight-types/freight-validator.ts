/**
 * Freight Type Validator
 * 
 * Validates that all required information is present for different freight types
 * based on the business requirements documented in FREIGHT_BROKERAGE.md
 */

export type FreightType = 
  | 'FTL_DRY_VAN'
  | 'FTL_REEFER'
  | 'FTL_FLATBED'
  | 'FTL_HAZMAT'
  | 'LTL'
  | 'PARTIAL'
  | 'UNKNOWN'

export interface FreightRequirements {
  required: string[]
  optional: string[]
  validation?: Record<string, (value: any) => boolean | string>
}

export interface LoadData {
  pickup_location?: string
  pickup_city?: string
  pickup_state?: string
  pickup_zip?: string
  delivery_location?: string
  delivery_city?: string
  delivery_state?: string
  delivery_zip?: string
  weight?: number
  commodity?: string
  pickup_date?: string
  equipment_type?: string
  dimensions?: {
    length?: number
    width?: number
    height?: number
  }
  piece_count?: number
  temperature?: {
    min?: number
    max?: number
    unit?: 'F' | 'C'
  }
  hazmat_class?: string
  un_number?: string
  proper_shipping_name?: string
  packing_group?: string
  emergency_contact?: string
  placards_required?: boolean
  tarping_required?: boolean
  oversize_permits?: boolean
  escort_required?: boolean
  special_requirements?: string
  accessorials?: string[]
  freight_class?: string
  packaging_type?: string
}

// Define requirements for each freight type based on FREIGHT_BROKERAGE.md
export const FREIGHT_REQUIREMENTS: Record<FreightType, FreightRequirements> = {
  FTL_DRY_VAN: {
    required: [
      'pickup_location',
      'delivery_location',
      'weight',
      'commodity',
      'pickup_date'
    ],
    optional: [
      'pickup_city',
      'pickup_state',
      'pickup_zip',
      'delivery_city',
      'delivery_state',
      'delivery_zip',
      'dimensions',
      'piece_count',
      'special_requirements'
    ],
    validation: {
      weight: (value) => value > 0 && value <= 45000 || 'Weight must be between 1 and 45,000 lbs for dry van',
      pickup_zip: (value) => !value || /^\d{5}$/.test(value) || 'Invalid zip code format',
      delivery_zip: (value) => !value || /^\d{5}$/.test(value) || 'Invalid zip code format'
    }
  },

  FTL_REEFER: {
    required: [
      'pickup_location',
      'delivery_location',
      'weight',
      'commodity',
      'pickup_date',
      'temperature'
    ],
    optional: [
      'pickup_city',
      'pickup_state',
      'pickup_zip',
      'delivery_city',
      'delivery_state',
      'delivery_zip',
      'dimensions',
      'piece_count',
      'special_requirements'
    ],
    validation: {
      weight: (value) => value > 0 && value <= 43000 || 'Weight must be between 1 and 43,000 lbs for reefer',
      temperature: (value) => {
        if (!value || typeof value !== 'object') return 'Temperature requirements must be specified'
        // Allow either min or max to be specified, or both
        if (value.min === undefined && value.max === undefined) return 'At least one temperature limit (min or max) must be specified'
        if ((value.min !== undefined || value.max !== undefined) && (!value.unit || (value.unit !== 'F' && value.unit !== 'C'))) {
          return 'Temperature unit must be F or C when temperature is specified'
        }
        return true
      }
    }
  },

  FTL_FLATBED: {
    required: [
      'pickup_location',
      'delivery_location',
      'weight',
      'commodity',
      'pickup_date',
      'dimensions'
    ],
    optional: [
      'pickup_city',
      'pickup_state',
      'pickup_zip',
      'delivery_city',
      'delivery_state',
      'delivery_zip',
      'piece_count',
      'tarping_required',
      'oversize_permits',
      'escort_required',
      'special_requirements'
    ],
    validation: {
      weight: (value) => value > 0 && value <= 48000 || 'Weight must be between 1 and 48,000 lbs for standard flatbed',
      dimensions: (value) => {
        if (!value || typeof value !== 'object') return 'Dimensions required for flatbed loads'
        if (!value.length || !value.width || !value.height) return 'Length, width, and height all required'
        // Check for oversize (standard is 8.5' wide, 13.6' high, 53' long)
        const oversizeWidth = value.width > 102 // 8.5 feet in inches
        const oversizeHeight = value.height > 162 // 13.5 feet in inches  
        const oversizeLength = value.length > 636 // 53 feet in inches
        if (oversizeWidth || oversizeHeight || oversizeLength) {
          return 'Note: This load is oversize and will require permits'
        }
        return true
      }
    }
  },

  FTL_HAZMAT: {
    required: [
      'pickup_location',
      'delivery_location',
      'weight',
      'commodity',
      'pickup_date',
      'hazmat_class',
      'un_number',
      'proper_shipping_name',
      'packing_group',
      'emergency_contact',
      'placards_required'
    ],
    optional: [
      'pickup_city',
      'pickup_state',
      'pickup_zip',
      'delivery_city',
      'delivery_state',
      'delivery_zip',
      'dimensions',
      'piece_count',
      'special_requirements'
    ],
    validation: {
      hazmat_class: (value) => {
        const validClasses = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
        return validClasses.includes(String(value)) || 'Invalid hazmat class (must be 1-9)'
      },
      un_number: (value) => /^UN\d{4}$/.test(value) || 'UN number must be in format UN#### (e.g., UN1234)',
      packing_group: (value) => ['I', 'II', 'III'].includes(value) || 'Packing group must be I, II, or III'
    }
  },

  LTL: {
    required: [
      'pickup_location',
      'delivery_location',
      'weight',
      'commodity',
      'pickup_date',
      'dimensions',
      'piece_count',
      'freight_class'
    ],
    optional: [
      'pickup_city',
      'pickup_state',
      'pickup_zip',
      'delivery_city',
      'delivery_state',
      'delivery_zip',
      'packaging_type',
      'accessorials',
      'special_requirements'
    ],
    validation: {
      weight: (value) => value >= 150 && value <= 15000 || 'LTL weight must be between 150 and 15,000 lbs',
      piece_count: (value) => value > 0 || 'Piece count must be specified for LTL',
      freight_class: (value) => {
        const classNum = parseInt(value)
        return classNum >= 50 && classNum <= 500 || 'Freight class must be between 50 and 500'
      },
      dimensions: (value) => {
        if (!value || typeof value !== 'object') return 'Dimensions required for LTL classification'
        if (!value.length || !value.width || !value.height) return 'Length, width, and height all required for LTL'
        return true
      }
    }
  },

  PARTIAL: {
    required: [
      'pickup_location',
      'delivery_location',
      'weight',
      'commodity',
      'pickup_date',
      'dimensions'
    ],
    optional: [
      'pickup_city',
      'pickup_state',
      'pickup_zip',
      'delivery_city',
      'delivery_state',
      'delivery_zip',
      'piece_count',
      'special_requirements'
    ],
    validation: {
      weight: (value) => value >= 5000 && value <= 30000 || 'Partial loads typically between 5,000 and 30,000 lbs',
      dimensions: (value) => {
        if (!value || typeof value !== 'object') return 'Dimensions help determine if partial or full truck needed'
        return true
      }
    }
  },

  UNKNOWN: {
    required: [
      'pickup_location',
      'delivery_location'
    ],
    optional: [
      'weight',
      'commodity',
      'pickup_date',
      'equipment_type',
      'special_requirements'
    ]
  }
}

export class FreightValidator {
  /**
   * Identifies the freight type based on available data
   */
  static identifyFreightType(data: LoadData): FreightType {
    // Check for explicit hazmat indicators
    if (data.hazmat_class || data.un_number || data.proper_shipping_name) {
      return 'FTL_HAZMAT'
    }

    // Check equipment type first for explicit mentions
    const equipmentType = data.equipment_type?.toLowerCase() || ''
    
    // PRIORITY 1: Check for explicit dry van FIRST (most common)
    if (equipmentType.includes('dry van') || 
        equipmentType === 'van' || 
        (equipmentType.includes('dry') && !equipmentType.includes('deck'))) {
      return 'FTL_DRY_VAN'
    }

    // PRIORITY 2: Check for reefer/temperature requirements
    if (equipmentType.includes('reefer') ||
        equipmentType.includes('refrigerated')) {
      return 'FTL_REEFER'
    }
    
    // Check for temperature data ONLY if no explicit equipment type conflicts
    if (!equipmentType.includes('dry') && !equipmentType.includes('van') &&
        data.temperature && 
        (data.temperature.min !== undefined || data.temperature.max !== undefined)) {
      return 'FTL_REEFER'
    }
    
    // PRIORITY 3: Check for flatbed
    if (equipmentType.includes('flatbed') ||
        equipmentType.includes('step deck') ||
        equipmentType.includes('rgn') ||
        data.tarping_required === true ||
        data.oversize_permits === true) {
      return 'FTL_FLATBED'
    }

    // Check weight for LTL vs FTL determination
    if (data.weight) {
      // LTL indicators take priority
      if (data.freight_class) {
        return 'LTL'
      }
      
      // Weight-based determination
      if (data.weight < 5000 && data.weight >= 150) {
        // Check for pallets/pieces which indicates LTL
        if (data.piece_count || equipmentType.includes('ltl')) {
          return 'LTL'
        }
        // Small shipment without LTL indicators = still LTL
        return 'LTL'
      } else if (data.weight >= 5000 && data.weight <= 15000) {
        // Could be LTL or partial
        if (data.piece_count && data.piece_count <= 10) {
          return 'LTL'
        }
        if (equipmentType.includes('partial')) {
          return 'PARTIAL'
        }
        // 5000-15000 lbs defaults to PARTIAL
        return 'PARTIAL'
      } else if (data.weight > 15000 && data.weight <= 30000) {
        // Likely partial unless other indicators
        return 'PARTIAL'
      }
    }
    
    // Check commodity for temperature-sensitive items ONLY if no equipment type specified
    if (!equipmentType && data.commodity?.toLowerCase().match(/frozen|refrigerated|perishable|ice cream/)) {
      return 'FTL_REEFER'
    }

    // Default based on common patterns
    if (data.pickup_location && data.delivery_location) {
      // Check for other indicators
      if (equipmentType.includes('enclosed')) {
        return 'FTL_DRY_VAN'
      }
      // Default to most common type
      return 'FTL_DRY_VAN'
    }

    return 'UNKNOWN'
  }

  /**
   * Validates that all required fields are present for the freight type
   */
  static validateRequiredFields(data: LoadData, freightType: FreightType): {
    isValid: boolean
    missingFields: string[]
    warnings: string[]
  } {
    const requirements = FREIGHT_REQUIREMENTS[freightType]
    const missingFields: string[] = []
    const warnings: string[] = []

    // Check required fields
    for (const field of requirements.required) {
      const value = data[field as keyof LoadData]
      if (value === undefined || value === null || value === '') {
        missingFields.push(field)
      } else if (field === 'temperature' && typeof value === 'object') {
        // Special handling for temperature object
        const temp = value as any
        if ((temp.min === null || temp.min === undefined) && 
            (temp.max === null || temp.max === undefined)) {
          missingFields.push(field)
        }
      }
    }

    // Run custom validations
    if (requirements.validation) {
      for (const [field, validator] of Object.entries(requirements.validation)) {
        const value = data[field as keyof LoadData]
        if (value !== undefined && value !== null) {
          const result = validator(value)
          if (result !== true) {
            warnings.push(result as string)
          }
        }
      }
    }

    // Additional cross-field validations
    if (data.pickup_location && (!data.pickup_zip && !data.pickup_city && !data.pickup_state)) {
      warnings.push('Consider providing city, state, or zip for more accurate pickup location')
    }
    if (data.delivery_location && (!data.delivery_zip && !data.delivery_city && !data.delivery_state)) {
      warnings.push('Consider providing city, state, or zip for more accurate delivery location')
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
      warnings
    }
  }

  /**
   * Get human-readable field names
   */
  static getFieldDisplayName(field: string): string {
    const displayNames: Record<string, string> = {
      pickup_location: 'Pickup Location',
      delivery_location: 'Delivery Location',
      pickup_city: 'Pickup City',
      pickup_state: 'Pickup State',
      pickup_zip: 'Pickup ZIP Code',
      delivery_city: 'Delivery City',
      delivery_state: 'Delivery State',
      delivery_zip: 'Delivery ZIP Code',
      weight: 'Weight (lbs)',
      commodity: 'Commodity Description',
      pickup_date: 'Pickup Date',
      equipment_type: 'Equipment Type',
      dimensions: 'Dimensions (L x W x H)',
      piece_count: 'Piece Count',
      temperature: 'Temperature Requirements',
      hazmat_class: 'Hazmat Class',
      un_number: 'UN Number',
      proper_shipping_name: 'Proper Shipping Name',
      packing_group: 'Packing Group',
      emergency_contact: 'Emergency Contact',
      placards_required: 'Placards Required',
      freight_class: 'Freight Class',
      packaging_type: 'Packaging Type',
      accessorials: 'Accessorial Services',
      tarping_required: 'Tarping Required',
      oversize_permits: 'Oversize Permits Required',
      escort_required: 'Escort Required'
    }
    return displayNames[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  /**
   * Get a description of what information is needed for a freight type
   */
  static getFreightTypeDescription(freightType: FreightType): string {
    const descriptions: Record<FreightType, string> = {
      FTL_DRY_VAN: 'Standard full truckload shipment using a dry van trailer',
      FTL_REEFER: 'Temperature-controlled full truckload requiring refrigerated trailer',
      FTL_FLATBED: 'Open-deck flatbed shipment, may require permits for oversize loads',
      FTL_HAZMAT: 'Hazardous materials shipment requiring special handling and documentation',
      LTL: 'Less-than-truckload shipment (150-15,000 lbs) sharing trailer space',
      PARTIAL: 'Partial truckload (5,000-30,000 lbs) - between LTL and full truck',
      UNKNOWN: 'Unable to determine freight type - please provide more details'
    }
    return descriptions[freightType]
  }
}