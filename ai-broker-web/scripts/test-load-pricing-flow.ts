/**
 * Test the complete load pricing and carrier quote flow
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import prisma from '../lib/prisma'
import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced'
import { CarrierQuoteHandler } from '../lib/agents/carrier-quote-handler'

async function testLoadPricingFlow() {
  console.log('🚛 Testing Complete Load Pricing Flow\n')
  
  const brokerId = 'b5a660c8-0bd7-4070-ae28-ad9bb815529e'
  
  // Step 1: Create a test load via email
  console.log('1️⃣ Creating test load...')
  
  const testEmail = {
    from: 'shipper@example.com',
    to: 'broker@example.com',
    subject: 'Need FTL Quote',
    content: `
      Hi,
      
      Please quote the following dry van load:
      
      Pickup: Dallas, TX 75201
      Delivery: Houston, TX 77001
      Weight: 35,000 lbs
      Commodity: General merchandise
      Equipment: 53' Dry Van
      Pickup date: December 30th
      
      Thanks!
    `,
    brokerId: brokerId
  }
  
  const agent = new IntakeAgentLLMEnhanced()
  const result = await agent.processEmail(testEmail)
  
  if (result.action !== 'proceed_to_quote' || !result.load_id) {
    console.error('❌ Failed to create load:', result)
    return
  }
  
  console.log('✅ Load created:', result.load_id)
  
  // Wait for auto-pricing to complete
  console.log('\n2️⃣ Waiting for auto-pricing...')
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  // Check if pricing was calculated
  const load = await prisma.load.findUnique({
    where: { id: result.load_id }
  })
  
  if (load?.aiNotes && typeof load.aiNotes === 'object') {
    const marketPricing = (load.aiNotes as any).marketPricing
    if (marketPricing) {
      console.log('✅ Market pricing calculated:')
      console.log('  Total Rate:', `$${marketPricing.totalRate}`)
      console.log('  Per Mile:', `$${marketPricing.ratePerMile}/mile`)
      console.log('  Miles:', marketPricing.totalMiles)
      console.log('  Market:', marketPricing.marketCondition)
    } else {
      console.log('⚠️  No market pricing found')
    }
  }
  
  // Check chat messages
  console.log('\n3️⃣ Checking chat messages...')
  const chatMessages = await prisma.chatMessage.findMany({
    where: { loadId: result.load_id },
    orderBy: { createdAt: 'asc' }
  })
  
  console.log(`Found ${chatMessages.length} chat messages:`)
  chatMessages.forEach((msg, i) => {
    console.log(`\n[${i + 1}] ${msg.role}:`)
    console.log(msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''))
  })
  
  // Check if quote requests were sent
  console.log('\n4️⃣ Checking carrier outreach...')
  const quotes = await prisma.quote.findMany({
    where: { loadId: result.load_id }
  })
  
  console.log(`Quote requests sent to ${quotes.length} carriers`)
  
  // Simulate a carrier response
  if (quotes.length > 0) {
    console.log('\n5️⃣ Simulating carrier quote response...')
    
    const carrierResponse = {
      from: quotes[0].carrierEmail || 'carrier@transport.com',
      to: 'broker@example.com',
      subject: `Re: Load Available: 75201 to 77001 - Van`,
      content: `
        Hi,
        
        We can handle this load.
        
        Our rate: $2,850 all-in
        
        Driver available immediately.
        
        Let me know if you want to book it.
        
        Thanks,
        ABC Transport
      `,
      brokerId: brokerId,
      inReplyTo: `<load-${result.load_id}-quote-${quotes[0].id}@aibroker>`,
      references: `<load-${result.load_id}-quote-${quotes[0].id}@aibroker>`
    }
    
    const quoteHandler = new CarrierQuoteHandler()
    const quoteResult = await quoteHandler.processCarrierEmail(carrierResponse)
    
    if (quoteResult.isQuoteResponse) {
      console.log('✅ Carrier quote processed:')
      console.log('  Rate:', `$${quoteResult.rate}`)
      console.log('  Availability:', quoteResult.availability)
      
      // Check for new chat message
      const newMessages = await prisma.chatMessage.findMany({
        where: { 
          loadId: result.load_id,
          createdAt: { gt: chatMessages[chatMessages.length - 1]?.createdAt || new Date(0) }
        }
      })
      
      if (newMessages.length > 0) {
        console.log('\n✅ Real-time quote notification sent to broker:')
        console.log(newMessages[0].content)
      }
    } else {
      console.log('⚠️  Failed to process carrier quote')
    }
  }
  
  // Cleanup
  console.log('\n🧹 Cleaning up test data...')
  
  // Delete in reverse order of dependencies
  await prisma.chatMessage.deleteMany({ where: { loadId: result.load_id } })
  await prisma.quote.deleteMany({ where: { loadId: result.load_id } })
  await prisma.load.delete({ where: { id: result.load_id } })
  
  console.log('✅ Test completed successfully!')
  
  await prisma.$disconnect()
}

testLoadPricingFlow().catch(console.error)