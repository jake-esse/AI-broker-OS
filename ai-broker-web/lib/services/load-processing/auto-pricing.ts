/**
 * Automatic Load Pricing Service
 * 
 * Automatically calculates market pricing when loads are created
 * and notifies brokers via chat messages
 */

import prisma from '@/lib/prisma'
import { PricingEngine } from '@/lib/services/pricing/pricing-engine'
import { FreightType } from '@/lib/freight-types/freight-validator'

export class AutoPricingService {
  /**
   * Process a newly created load:
   * 1. Calculate market price
   * 2. Update load with pricing info
   * 3. Create chat message for broker
   */
  static async processNewLoad(loadId: string): Promise<void> {
    try {
      // Get load details
      const load = await prisma.load.findUnique({
        where: { id: loadId }
      })
      
      if (!load) {
        console.error(`Load ${loadId} not found`)
        return
      }
      
      console.log(`[AutoPricing] Processing load ${loadId}`)
      
      // Prepare pricing request
      const pricingRequest = {
        originZip: load.originZip,
        destZip: load.destZip,
        weight: load.weightLb,
        equipment: load.equipment,
        freightType: (load.equipment || 'FTL_DRY_VAN') as FreightType,
        commodity: load.commodity || undefined,
        pickupDate: load.pickupDt ? new Date(load.pickupDt) : undefined,
        dimensions: this.extractDimensions(load.aiNotes),
        temperature: this.extractTemperature(load.aiNotes),
        hazmatClass: this.extractHazmat(load.aiNotes)
      }
      
      // Calculate market rate
      const pricing = await PricingEngine.calculateRate(pricingRequest)
      
      console.log(`[AutoPricing] Calculated rate: $${pricing.totalRate} (${pricing.ratePerMile}/mile)`)
      
      // Update load with pricing information
      const currentNotes = typeof load.aiNotes === 'string' 
        ? JSON.parse(load.aiNotes) 
        : (load.aiNotes || {})
        
      const updatedNotes = {
        ...currentNotes,
        marketPricing: {
          totalRate: pricing.totalRate,
          ratePerMile: pricing.ratePerMile,
          totalMiles: pricing.totalMiles,
          marketCondition: pricing.marketCondition,
          confidence: pricing.confidence,
          calculatedAt: new Date().toISOString(),
          breakdown: pricing.breakdown
        }
      }
      
      await prisma.load.update({
        where: { id: loadId },
        data: {
          status: 'quoted',
          aiNotes: JSON.stringify(updatedNotes)
        }
      })
      
      // Create chat message with pricing info
      await prisma.chatMessage.create({
        data: {
          loadId: loadId,
          brokerId: load.brokerId,
          role: 'assistant',
          content: this.formatPricingMessage(pricing, load),
          metadata: {
            type: 'market_pricing',
            pricing: pricing
          }
        }
      })
      
      console.log(`[AutoPricing] Completed processing for load ${loadId}`)
      
      // Trigger carrier outreach in the background
      import('@/lib/services/carrier-outreach/quote-request-sender').then(({ QuoteRequestSender }) => {
        QuoteRequestSender.sendQuoteRequests(loadId).catch(error => {
          console.error('[AutoPricing] Error in carrier outreach:', error)
        })
      })
      
    } catch (error) {
      console.error(`[AutoPricing] Error processing load ${loadId}:`, error)
    }
  }
  
  /**
   * Format pricing information into a user-friendly message
   */
  private static formatPricingMessage(pricing: any, load: any): string {
    const marketEmoji = {
      'soft': '🟢',
      'balanced': '🟡', 
      'tight': '🔴'
    }[pricing.marketCondition] || '🟡'
    
    let message = `📊 **Market Rate Analysis**\n\n`
    message += `Route: ${load.originZip} → ${load.destZip} (${pricing.totalMiles} miles)\n`
    message += `Equipment: ${load.equipment}\n`
    message += `Weight: ${load.weightLb.toLocaleString()} lbs\n\n`
    
    message += `**Recommended Rate:** $${pricing.totalRate.toLocaleString()} total\n`
    message += `**Rate per Mile:** $${pricing.ratePerMile}/mile\n`
    message += `**Market Condition:** ${marketEmoji} ${pricing.marketCondition.charAt(0).toUpperCase() + pricing.marketCondition.slice(1)}\n\n`
    
    message += `**Rate Breakdown:**\n`
    message += `• Linehaul: $${pricing.breakdown.linehaul.toLocaleString()}\n`
    message += `• Fuel Surcharge: $${pricing.breakdown.fuel.toLocaleString()}\n`
    
    if (pricing.breakdown.accessorials.length > 0) {
      message += `• Accessorials:\n`
      pricing.breakdown.accessorials.forEach((charge: any) => {
        message += `  - ${charge.description}: $${charge.amount}\n`
      })
    }
    
    message += `\n*Confidence: ${pricing.confidence}%*`
    
    return message
  }
  
  /**
   * Extract dimensions from AI notes
   */
  private static extractDimensions(aiNotes: any): any {
    if (!aiNotes) return undefined
    
    const notes = typeof aiNotes === 'string' ? JSON.parse(aiNotes) : aiNotes
    if (notes.dimensions) return notes.dimensions
    if (notes.extracted_data?.dimensions) return notes.extracted_data.dimensions
    
    return undefined
  }
  
  /**
   * Extract temperature requirements from AI notes
   */
  private static extractTemperature(aiNotes: any): any {
    if (!aiNotes) return undefined
    
    const notes = typeof aiNotes === 'string' ? JSON.parse(aiNotes) : aiNotes
    if (notes.temperature_requirements) return notes.temperature_requirements
    if (notes.temperature) return notes.temperature
    if (notes.extracted_data?.temperature) return notes.extracted_data.temperature
    
    return undefined
  }
  
  /**
   * Extract hazmat info from AI notes
   */
  private static extractHazmat(aiNotes: any): string | undefined {
    if (!aiNotes) return undefined
    
    const notes = typeof aiNotes === 'string' ? JSON.parse(aiNotes) : aiNotes
    return notes.hazmat_class || notes.extracted_data?.hazmat_class
  }
}