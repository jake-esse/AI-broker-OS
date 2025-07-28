/**
 * Carrier Quote Request Sender
 * 
 * Automatically sends quote requests to preferred carriers
 * when a load receives market pricing
 */

import prisma from '@/lib/prisma'
import { OAuthEmailSender } from '@/lib/email/oauth-sender'

export interface CarrierQuoteRequest {
  loadId: string
  brokerId: string
  carrierEmails: string[]
}

export class QuoteRequestSender {
  /**
   * Send quote requests to preferred carriers
   */
  static async sendQuoteRequests(loadId: string): Promise<void> {
    try {
      // Get load details with broker info
      const load = await prisma.load.findUnique({
        where: { id: loadId }
      })
      
      if (!load) {
        console.error(`[QuoteRequestSender] Load ${loadId} not found`)
        return
      }
      
      // Get broker preferences for preferred carriers
      const broker = await prisma.broker.findUnique({
        where: { id: load.brokerId }
      })
      
      if (!broker || !broker.preferences) {
        console.log('[QuoteRequestSender] No broker preferences found')
        return
      }
      
      const preferences = broker.preferences as any
      const preferredCarriers = preferences.preferredCarriers || []
      
      if (preferredCarriers.length === 0) {
        console.log('[QuoteRequestSender] No preferred carriers configured')
        return
      }
      
      console.log(`[QuoteRequestSender] Sending quote requests to ${preferredCarriers.length} carriers`)
      
      // Get market pricing from AI notes
      const aiNotes = typeof load.aiNotes === 'string' 
        ? JSON.parse(load.aiNotes) 
        : (load.aiNotes || {})
      const marketPricing = aiNotes.marketPricing
      
      if (!marketPricing) {
        console.log('[QuoteRequestSender] No market pricing found, skipping carrier outreach')
        return
      }
      
      // Prepare email content
      const emailContent = this.prepareQuoteRequestEmail(load, marketPricing)
      
      // Send to each carrier
      const emailSender = new OAuthEmailSender()
      const results = await Promise.allSettled(
        preferredCarriers.map(async (carrierEmail: string) => {
          try {
            // Create quote record
            const quote = await prisma.quote.create({
              data: {
                loadId: loadId,
                carrierEmail: carrierEmail.trim(),
                status: 'pending',
                sentAt: new Date()
              }
            })
            
            // Send email
            const result = await emailSender.sendEmail(load.brokerId, {
              to: carrierEmail.trim(),
              subject: emailContent.subject,
              htmlContent: emailContent.html,
              textContent: emailContent.text,
              // Include load ID in message ID for tracking responses
              messageId: `load-${loadId}-quote-${quote.id}@aibroker`
            })
            
            if (result.success) {
              console.log(`[QuoteRequestSender] Sent to ${carrierEmail}`)
              return { success: true, carrier: carrierEmail }
            } else {
              console.error(`[QuoteRequestSender] Failed to send to ${carrierEmail}:`, result.error)
              // Update quote status
              await prisma.quote.update({
                where: { id: quote.id },
                data: { status: 'failed' }
              })
              return { success: false, carrier: carrierEmail, error: result.error }
            }
            
          } catch (error) {
            console.error(`[QuoteRequestSender] Error sending to ${carrierEmail}:`, error)
            return { success: false, carrier: carrierEmail, error: error }
          }
        })
      )
      
      // Count successes
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length
      
      // Create chat message about carrier outreach
      await prisma.chatMessage.create({
        data: {
          loadId: loadId,
          brokerId: load.brokerId,
          role: 'assistant',
          content: `📤 I've sent quote requests to ${successCount} of your preferred carriers. I'll notify you as soon as they respond with their rates.`,
          metadata: {
            type: 'carrier_outreach',
            carriers_contacted: successCount,
            total_carriers: preferredCarriers.length
          }
        }
      })
      
    } catch (error) {
      console.error('[QuoteRequestSender] Error in sendQuoteRequests:', error)
    }
  }
  
  /**
   * Prepare quote request email content
   */
  private static prepareQuoteRequestEmail(load: any, marketPricing: any): {
    subject: string
    html: string
    text: string
  } {
    const pickupDate = load.pickupDt ? new Date(load.pickupDt).toLocaleDateString() : 'ASAP'
    
    const subject = `Load Available: ${load.originZip} to ${load.destZip} - ${load.equipment || 'Van'}`
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #2563eb;">Load Opportunity</h2>
        
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Load Details:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 0;"><strong>Origin:</strong></td>
              <td>${load.originZip}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0;"><strong>Destination:</strong></td>
              <td>${load.destZip}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0;"><strong>Distance:</strong></td>
              <td>${marketPricing.totalMiles} miles</td>
            </tr>
            <tr>
              <td style="padding: 5px 0;"><strong>Equipment:</strong></td>
              <td>${load.equipment || 'Dry Van'}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0;"><strong>Weight:</strong></td>
              <td>${load.weightLb.toLocaleString()} lbs</td>
            </tr>
            <tr>
              <td style="padding: 5px 0;"><strong>Commodity:</strong></td>
              <td>${load.commodity}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0;"><strong>Pickup Date:</strong></td>
              <td>${pickupDate}</td>
            </tr>
          </table>
        </div>
        
        <div style="background: #e0f2fe; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #0369a1;">Quick Quote Request</h3>
          <p>Please reply with your best rate for this load. Include:</p>
          <ul>
            <li>All-in rate (linehaul + fuel)</li>
            <li>Driver availability</li>
            <li>Any special requirements or concerns</li>
          </ul>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          <em>Reply to this email with your quote. We're looking for reliable carriers for immediate dispatch.</em>
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #9ca3af; font-size: 12px;">
          This is an automated quote request. Reply directly to submit your rate.
        </p>
      </div>
    `
    
    const text = `
Load Opportunity

LOAD DETAILS:
Origin: ${load.originZip}
Destination: ${load.destZip}
Distance: ${marketPricing.totalMiles} miles
Equipment: ${load.equipment || 'Dry Van'}
Weight: ${load.weightLb.toLocaleString()} lbs
Commodity: ${load.commodity}
Pickup Date: ${pickupDate}

Please reply with your best all-in rate for this load.

Include:
- All-in rate (linehaul + fuel)
- Driver availability
- Any special requirements or concerns

Reply to this email with your quote.
    `.trim()
    
    return { subject, html, text }
  }
}