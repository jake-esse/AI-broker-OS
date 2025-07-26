// --------------------------- seed-chat-messages.ts ----------------------------
/**
 * AI-Broker MVP · Chat Message Seeding Script
 * 
 * OVERVIEW:
 * Seeds initial chat messages for testing the LLM chat functionality.
 * Creates sample conversations for existing loads to demonstrate capabilities.
 * 
 * WORKFLOW:
 * 1. Connect to database
 * 2. Find existing loads and brokers
 * 3. Create sample chat messages
 * 4. Test conversation flow
 * 
 * BUSINESS LOGIC:
 * - Creates realistic freight brokerage conversations
 * - Demonstrates AI capabilities and tool usage
 * - Shows confidence scoring and human escalation
 * 
 * TECHNICAL ARCHITECTURE:
 * - Prisma database operations
 * - TypeScript script
 * - Run with ts-node or tsx
 * 
 * DEPENDENCIES:
 * - Prisma client
 * - Database connection
 */

import prisma from '../lib/prisma'

async function seedChatMessages() {
  try {
    // Get a sample load and broker
    const broker = await prisma.broker.findFirst()
    if (!broker) {
      console.error('No broker found. Please create a broker first.')
      return
    }

    const load = await prisma.load.findFirst({
      where: { brokerId: broker.id }
    })
    
    if (!load) {
      console.error('No load found for broker. Please create a load first.')
      return
    }

    console.log(`Seeding chat messages for load ${load.id} and broker ${broker.id}`)

    // Create initial system message
    await prisma.chatMessage.create({
      data: {
        loadId: load.id,
        brokerId: broker.id,
        role: 'system',
        content: `Load created from email request. Load #${load.loadNumber || 'N/A'} for ${load.shipperName || 'Unknown Shipper'}`,
        metadata: {}
      }
    })

    // Create AI introduction message
    await prisma.chatMessage.create({
      data: {
        loadId: load.id,
        brokerId: broker.id,
        role: 'assistant',
        content: `I've received a load request from ${load.shipperName || 'a shipper'} for a shipment:

📍 Origin: ${load.originZip}
📍 Destination: ${load.destZip}
📅 Pickup: ${new Date(load.pickupDt).toLocaleDateString()}
📦 Equipment: ${load.equipment}
⚖️ Weight: ${load.weightLb.toLocaleString()} lbs
${load.commodity ? `📦 Commodity: ${load.commodity}` : ''}

I'll help you manage this load efficiently. What would you like me to do first?`,
        metadata: {
          confidence: 0.95,
          suggestedActions: [
            { type: 'generate_quote', description: 'Generate market-based quote' },
            { type: 'search_carriers', description: 'Find available carriers' },
            { type: 'check_market_rates', description: 'Check current market rates' }
          ]
        }
      }
    })

    // Create a user message
    await prisma.chatMessage.create({
      data: {
        loadId: load.id,
        brokerId: broker.id,
        role: 'user',
        content: 'What are the current market rates for this lane?',
        metadata: {}
      }
    })

    // Create AI response with tool usage
    await prisma.chatMessage.create({
      data: {
        loadId: load.id,
        brokerId: broker.id,
        role: 'assistant',
        content: `I'll check the current market rates for the ${load.originZip} to ${load.destZip} lane.

Based on my analysis of recent quotes and market data:

📊 **Market Rate Analysis**:
• Average rate: $${(2.50 * (load.totalMiles || 500)).toFixed(2)} (Based on estimated ${load.totalMiles || 500} miles)
• Rate per mile: $2.30 - $2.70
• Current market: Balanced (neither tight nor loose capacity)

💡 **Recommendation**:
I suggest quoting **$${(2.65 * (load.totalMiles || 500)).toFixed(2)}** for this load, which includes:
• Base rate: $${(2.40 * (load.totalMiles || 500)).toFixed(2)}
• Fuel surcharge: $${(0.25 * (load.totalMiles || 500)).toFixed(2)}
• Target margin: 18%

This rate is competitive while maintaining healthy margins. Would you like me to send this quote to the shipper?`,
        metadata: {
          confidence: 0.88,
          toolCalls: [
            {
              tool: 'query_database',
              arguments: { table: 'quotes', filters: { originZip: load.originZip, destZip: load.destZip }, limit: 10 },
              result: { success: true, count: 5, avgRate: 2.50 }
            }
          ],
          suggestedActions: [
            { type: 'send_quote', description: 'Send quote to shipper' },
            { type: 'adjust_rate', description: 'Adjust the rate' },
            { type: 'search_carriers', description: 'Check carrier availability first' }
          ]
        }
      }
    })

    console.log('Successfully seeded chat messages!')

    // Display the messages
    const messages = await prisma.chatMessage.findMany({
      where: { loadId: load.id, brokerId: broker.id },
      orderBy: { createdAt: 'asc' }
    })

    console.log('\nSeeded messages:')
    messages.forEach(msg => {
      console.log(`\n[${msg.role.toUpperCase()}] ${msg.createdAt.toISOString()}`)
      console.log(msg.content)
      if (msg.metadata && Object.keys(msg.metadata).length > 0) {
        console.log('Metadata:', JSON.stringify(msg.metadata, null, 2))
      }
    })

  } catch (error) {
    console.error('Error seeding chat messages:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the script
seedChatMessages()