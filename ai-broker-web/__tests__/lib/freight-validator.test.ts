import { FreightValidator, FreightType, LoadData } from '@/lib/freight-types/freight-validator'

describe('FreightValidator', () => {
  describe('identifyFreightType', () => {
    it('should identify FTL_DRY_VAN for standard van loads', () => {
      const data: LoadData = {
        pickup_location: 'Chicago, IL',
        delivery_location: 'New York, NY',
        weight: 35000,
        equipment_type: 'dry van'
      }
      expect(FreightValidator.identifyFreightType(data)).toBe('FTL_DRY_VAN')
    })

    it('should identify FTL_REEFER for temperature-controlled loads', () => {
      const data: LoadData = {
        pickup_location: 'Miami, FL',
        delivery_location: 'Boston, MA',
        weight: 40000,
        commodity: 'frozen seafood',
        temperature: { min: -10, max: 0, unit: 'F' }
      }
      expect(FreightValidator.identifyFreightType(data)).toBe('FTL_REEFER')
    })

    it('should identify FTL_FLATBED for flatbed equipment', () => {
      const data: LoadData = {
        pickup_location: 'Houston, TX',
        delivery_location: 'Denver, CO',
        weight: 45000,
        equipment_type: 'flatbed',
        dimensions: { length: 480, width: 96, height: 96 }
      }
      expect(FreightValidator.identifyFreightType(data)).toBe('FTL_FLATBED')
    })

    it('should identify FTL_HAZMAT when hazmat fields present', () => {
      const data: LoadData = {
        pickup_location: 'Newark, NJ',
        delivery_location: 'Atlanta, GA',
        weight: 30000,
        hazmat_class: '3',
        un_number: 'UN1203',
        proper_shipping_name: 'Gasoline'
      }
      expect(FreightValidator.identifyFreightType(data)).toBe('FTL_HAZMAT')
    })

    it('should identify LTL for small weights', () => {
      const data: LoadData = {
        pickup_location: 'Seattle, WA',
        delivery_location: 'Portland, OR',
        weight: 2500,
        piece_count: 5
      }
      expect(FreightValidator.identifyFreightType(data)).toBe('LTL')
    })

    it('should identify PARTIAL for mid-range weights', () => {
      const data: LoadData = {
        pickup_location: 'Phoenix, AZ',
        delivery_location: 'Las Vegas, NV',
        weight: 12000,
        equipment_type: 'partial'
      }
      expect(FreightValidator.identifyFreightType(data)).toBe('PARTIAL')
    })
  })

  describe('validateRequiredFields', () => {
    it('should validate complete FTL_DRY_VAN load', () => {
      const data: LoadData = {
        pickup_location: 'Chicago, IL 60601',
        pickup_city: 'Chicago',
        pickup_state: 'IL',
        pickup_zip: '60601',
        delivery_location: 'New York, NY 10001',
        delivery_city: 'New York',
        delivery_state: 'NY',
        delivery_zip: '10001',
        weight: 35000,
        commodity: 'General Merchandise',
        pickup_date: '2024-12-20'
      }
      
      const result = FreightValidator.validateRequiredFields(data, 'FTL_DRY_VAN')
      expect(result.isValid).toBe(true)
      expect(result.missingFields).toHaveLength(0)
    })

    it('should identify missing temperature for reefer loads', () => {
      const data: LoadData = {
        pickup_location: 'Miami, FL',
        delivery_location: 'Boston, MA',
        weight: 40000,
        commodity: 'frozen seafood',
        pickup_date: '2024-12-20'
      }
      
      const result = FreightValidator.validateRequiredFields(data, 'FTL_REEFER')
      expect(result.isValid).toBe(false)
      expect(result.missingFields).toContain('temperature')
    })

    it('should identify missing hazmat fields', () => {
      const data: LoadData = {
        pickup_location: 'Newark, NJ',
        delivery_location: 'Atlanta, GA',
        weight: 30000,
        commodity: 'Hazardous Material',
        pickup_date: '2024-12-20',
        hazmat_class: '3'
        // Missing: un_number, proper_shipping_name, packing_group, emergency_contact, placards_required
      }
      
      const result = FreightValidator.validateRequiredFields(data, 'FTL_HAZMAT')
      expect(result.isValid).toBe(false)
      expect(result.missingFields).toContain('un_number')
      expect(result.missingFields).toContain('proper_shipping_name')
      expect(result.missingFields).toContain('packing_group')
      expect(result.missingFields).toContain('emergency_contact')
      expect(result.missingFields).toContain('placards_required')
    })

    it('should provide warnings for oversize flatbed loads', () => {
      const data: LoadData = {
        pickup_location: 'Houston, TX',
        delivery_location: 'Denver, CO',
        weight: 45000,
        commodity: 'Steel Beams',
        pickup_date: '2024-12-20',
        dimensions: { length: 700, width: 120, height: 100 } // Oversize
      }
      
      const result = FreightValidator.validateRequiredFields(data, 'FTL_FLATBED')
      expect(result.isValid).toBe(true)
      expect(result.warnings).toContain('Note: This load is oversize and will require permits')
    })

    it('should validate LTL requirements', () => {
      const data: LoadData = {
        pickup_location: 'Seattle, WA',
        delivery_location: 'Portland, OR',
        weight: 2500,
        commodity: 'Electronics',
        pickup_date: '2024-12-20',
        dimensions: { length: 48, width: 40, height: 48 },
        piece_count: 5,
        freight_class: '125'
      }
      
      const result = FreightValidator.validateRequiredFields(data, 'LTL')
      expect(result.isValid).toBe(true)
    })

    it('should warn about invalid freight class', () => {
      const data: LoadData = {
        pickup_location: 'Seattle, WA',
        delivery_location: 'Portland, OR',
        weight: 2500,
        commodity: 'Electronics',
        pickup_date: '2024-12-20',
        dimensions: { length: 48, width: 40, height: 48 },
        piece_count: 5,
        freight_class: '600' // Invalid - too high
      }
      
      const result = FreightValidator.validateRequiredFields(data, 'LTL')
      expect(result.warnings).toContain('Freight class must be between 50 and 500')
    })
  })

  describe('getFieldDisplayName', () => {
    it('should return human-readable field names', () => {
      expect(FreightValidator.getFieldDisplayName('pickup_location')).toBe('Pickup Location')
      expect(FreightValidator.getFieldDisplayName('hazmat_class')).toBe('Hazmat Class')
      expect(FreightValidator.getFieldDisplayName('temperature')).toBe('Temperature Requirements')
    })
  })

  describe('getFreightTypeDescription', () => {
    it('should return descriptions for all freight types', () => {
      expect(FreightValidator.getFreightTypeDescription('FTL_DRY_VAN'))
        .toBe('Standard full truckload shipment using a dry van trailer')
      expect(FreightValidator.getFreightTypeDescription('FTL_HAZMAT'))
        .toBe('Hazardous materials shipment requiring special handling and documentation')
      expect(FreightValidator.getFreightTypeDescription('LTL'))
        .toBe('Less-than-truckload shipment (150-15,000 lbs) sharing trailer space')
    })
  })
})