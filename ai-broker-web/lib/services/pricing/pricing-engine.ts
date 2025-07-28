/**
 * Freight Pricing Engine
 * 
 * Calculates market rates for freight loads based on:
 * - Distance and route
 * - Equipment type
 * - Weight and dimensions
 * - Market conditions
 * - Seasonal factors
 * 
 * This is a simplified version. In production, you would integrate with:
 * - DAT RateView
 * - Truckstop.com Rate Analysis
 * - Historical broker data
 */

import { FreightType } from '@/lib/freight-types/freight-validator'

export interface PricingRequest {
  originZip: string
  destZip: string
  weight: number
  equipment: string
  freightType: FreightType
  commodity?: string
  pickupDate?: Date
  dimensions?: {
    length?: number
    width?: number
    height?: number
  }
  temperature?: {
    min?: number
    max?: number
    unit?: string
  }
  hazmatClass?: string
}

export interface PricingResult {
  baseRate: number
  ratePerMile: number
  totalMiles: number
  fuelSurcharge: number
  accessorialCharges: number
  totalRate: number
  marketCondition: 'soft' | 'balanced' | 'tight'
  confidence: number
  breakdown: {
    linehaul: number
    fuel: number
    accessorials: AccessorialCharge[]
  }
}

interface AccessorialCharge {
  type: string
  description: string
  amount: number
}

export class PricingEngine {
  // Base rates per mile by equipment type (simplified)
  private static BASE_RATES: Record<string, number> = {
    'FTL_DRY_VAN': 2.50,
    'FTL_REEFER': 2.85,
    'FTL_FLATBED': 2.75,
    'FTL_HAZMAT': 3.25,
    'LTL': 0.35, // per cwt (hundred pounds)
    'PARTIAL': 2.25
  }

  // Fuel surcharge calculation (simplified)
  private static FUEL_SURCHARGE_RATE = 0.35 // per mile

  /**
   * Calculate market rate for a load
   */
  static async calculateRate(request: PricingRequest): Promise<PricingResult> {
    // Calculate distance (simplified - in production use actual routing API)
    const distance = this.estimateDistance(request.originZip, request.destZip)
    
    // Get base rate for equipment type
    const baseRatePerMile = this.BASE_RATES[request.freightType] || 2.50
    
    // Calculate linehaul charge
    const linehaul = distance * baseRatePerMile
    
    // Calculate fuel surcharge
    const fuelSurcharge = distance * this.FUEL_SURCHARGE_RATE
    
    // Calculate accessorials
    const accessorials = this.calculateAccessorials(request)
    const accessorialTotal = accessorials.reduce((sum, charge) => sum + charge.amount, 0)
    
    // Determine market condition (simplified)
    const marketCondition = this.assessMarketCondition(request)
    
    // Apply market condition multiplier
    const marketMultiplier = {
      'soft': 0.95,
      'balanced': 1.0,
      'tight': 1.15
    }[marketCondition]
    
    // Calculate total
    const subtotal = (linehaul + fuelSurcharge) * marketMultiplier + accessorialTotal
    const totalRate = Math.round(subtotal)
    const ratePerMile = totalRate / distance
    
    return {
      baseRate: linehaul,
      ratePerMile: Number(ratePerMile.toFixed(2)),
      totalMiles: distance,
      fuelSurcharge: Math.round(fuelSurcharge),
      accessorialCharges: accessorialTotal,
      totalRate,
      marketCondition,
      confidence: 85, // Simplified confidence score
      breakdown: {
        linehaul: Math.round(linehaul * marketMultiplier),
        fuel: Math.round(fuelSurcharge * marketMultiplier),
        accessorials
      }
    }
  }
  
  /**
   * Estimate distance between zip codes (simplified)
   * In production, use Google Maps API or similar
   */
  private static estimateDistance(originZip: string, destZip: string): number {
    // This is a very simplified estimation
    // In reality, you'd use a routing API
    const zipDiff = Math.abs(parseInt(originZip.substr(0, 3)) - parseInt(destZip.substr(0, 3)))
    
    // Rough estimation: ~10 miles per zip code prefix difference
    const estimatedMiles = Math.max(zipDiff * 10, 50)
    
    // Add some randomness for realism
    return Math.round(estimatedMiles * (0.8 + Math.random() * 0.4))
  }
  
  /**
   * Calculate accessorial charges
   */
  private static calculateAccessorials(request: PricingRequest): AccessorialCharge[] {
    const charges: AccessorialCharge[] = []
    
    // Temperature control
    if (request.freightType === 'FTL_REEFER' && request.temperature) {
      charges.push({
        type: 'TEMP_CONTROL',
        description: 'Temperature controlled service',
        amount: 150
      })
      
      // Deep freeze surcharge
      if (request.temperature.min && request.temperature.min < 0) {
        charges.push({
          type: 'DEEP_FREEZE',
          description: 'Deep freeze service (below 0°F)',
          amount: 100
        })
      }
    }
    
    // Hazmat
    if (request.freightType === 'FTL_HAZMAT') {
      charges.push({
        type: 'HAZMAT',
        description: 'Hazardous materials handling',
        amount: 250
      })
    }
    
    // Overweight (over 45,000 lbs)
    if (request.weight > 45000) {
      charges.push({
        type: 'OVERWEIGHT',
        description: 'Overweight permit and handling',
        amount: 200
      })
    }
    
    // Weekend/holiday pickup (simplified)
    if (request.pickupDate) {
      const day = request.pickupDate.getDay()
      if (day === 0 || day === 6) { // Sunday or Saturday
        charges.push({
          type: 'WEEKEND',
          description: 'Weekend pickup',
          amount: 150
        })
      }
    }
    
    return charges
  }
  
  /**
   * Assess market condition (simplified)
   * In production, this would use real market data
   */
  private static assessMarketCondition(request: PricingRequest): 'soft' | 'balanced' | 'tight' {
    // Simplified logic based on common factors
    
    // Reefer loads in produce season (Apr-Oct) are tighter
    if (request.freightType === 'FTL_REEFER') {
      const month = (request.pickupDate || new Date()).getMonth()
      if (month >= 3 && month <= 9) {
        return 'tight'
      }
    }
    
    // Flatbed loads for construction (Mar-Nov) are tighter
    if (request.freightType === 'FTL_FLATBED') {
      const month = (request.pickupDate || new Date()).getMonth()
      if (month >= 2 && month <= 10) {
        return 'tight'
      }
    }
    
    // Default to balanced
    return 'balanced'
  }
}