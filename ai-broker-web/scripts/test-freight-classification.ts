/**
 * Test freight type classification accuracy
 * 
 * Run with: npx tsx scripts/test-freight-classification.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced'
import { FreightValidator } from '../lib/freight-types/freight-validator'

// Test emails representing different freight types
const testEmails = [
  {
    name: 'Dry Van FTL',
    email: {
      from: 'shipper@example.com',
      to: 'broker@example.com',
      subject: 'Quote Request - Chicago to Dallas',
      content: `
        Hi,
        
        I need a quote for shipping 35 pallets of general merchandise.
        
        Pickup: Chicago, IL 60601
        Delivery: Dallas, TX 75201
        Weight: 38,000 lbs
        Ready for pickup: Tomorrow morning
        
        Standard dry van is fine. No special requirements.
        
        Thanks,
        John
      `,
      brokerId: 'test-broker-id'
    }
  },
  {
    name: 'Refrigerated (Reefer) Load',
    email: {
      from: 'produce@freshfoods.com',
      to: 'broker@example.com',
      subject: 'Reefer Load - Miami to Boston',
      content: `
        Need pricing for temperature controlled shipment:
        
        Origin: Miami, FL 33101
        Destination: Boston, MA 02101
        
        Product: Fresh produce (strawberries)
        Weight: 40,000 lbs
        Temperature: Must maintain 34-36°F
        
        Pickup date: December 20th, 8 AM
        Delivery: December 21st by 6 AM
        
        Please quote ASAP.
      `,
      brokerId: 'test-broker-id'
    }
  },
  {
    name: 'Flatbed with Oversize',
    email: {
      from: 'steel@manufacturing.com',
      to: 'broker@example.com',
      subject: 'Flatbed Quote Needed',
      content: `
        We have steel beams that need transport:
        
        From: Houston, TX 77001
        To: Denver, CO 80201
        
        Dimensions: 60 feet long x 10 feet wide x 8 feet high
        Weight: 45,000 lbs
        Equipment: Flatbed required, tarping needed
        
        This is oversize so will need permits.
        
        When can you pick up?
      `,
      brokerId: 'test-broker-id'
    }
  },
  {
    name: 'Hazmat Shipment',
    email: {
      from: 'logistics@chemicals.com',
      to: 'broker@example.com',
      subject: 'Hazmat Load - UN1203 Gasoline',
      content: `
        Hazardous material shipment request:
        
        Newark, NJ 07102 to Atlanta, GA 30301
        
        Product: Gasoline
        UN Number: UN1203
        Hazmat Class: 3 (Flammable Liquid)
        Packing Group: II
        Weight: 30,000 lbs
        
        Emergency Contact: Safety Manager 555-123-4567 (24/7)
        Placards Required: Yes
        
        Need carrier with hazmat endorsement.
      `,
      brokerId: 'test-broker-id'
    }
  },
  {
    name: 'LTL Shipment',
    email: {
      from: 'shipping@electronics.com',
      to: 'broker@example.com',
      subject: 'Small shipment quote',
      content: `
        Hi there,
        
        I have a small shipment:
        
        From: Seattle, WA 98101
        To: Portland, OR 97201
        
        5 pallets of electronics
        Total weight: 2,500 lbs
        Dimensions per pallet: 48" x 40" x 48"
        Freight class: 125
        
        Need liftgate at delivery (no dock)
        
        Thanks!
      `,
      brokerId: 'test-broker-id'
    }
  },
  {
    name: 'Missing Critical Information',
    email: {
      from: 'customer@company.com',
      to: 'broker@example.com',
      subject: 'Need shipping quote',
      content: `
        Hi,
        
        I need to ship some equipment from Chicago.
        It weighs about 25,000 lbs.
        
        Can you give me a quote?
        
        Thanks
      `,
      brokerId: 'test-broker-id'
    }
  }
]

async function testFreightClassification() {
  console.log('🚛 Testing Enhanced Freight Classification System\n')
  console.log('=' .repeat(80))
  
  const agent = new IntakeAgentLLMEnhanced()
  
  for (const test of testEmails) {
    console.log(`\n📧 Test: ${test.name}`)
    console.log('-'.repeat(40))
    
    try {
      const result = await agent.processEmail(test.email)
      
      console.log(`✅ Action: ${result.action}`)
      console.log(`📊 Confidence: ${result.confidence}%`)
      
      if (result.freight_type) {
        console.log(`🚚 Freight Type: ${result.freight_type}`)
        console.log(`📝 Description: ${FreightValidator.getFreightTypeDescription(result.freight_type)}`)
      }
      
      if (result.extracted_data) {
        console.log('\n📋 Extracted Data:')
        const data = result.extracted_data
        if (data.pickup_location) console.log(`  • Pickup: ${data.pickup_location}`)
        if (data.delivery_location) console.log(`  • Delivery: ${data.delivery_location}`)
        if (data.weight) console.log(`  • Weight: ${data.weight.toLocaleString()} lbs`)
        if (data.commodity) console.log(`  • Commodity: ${data.commodity}`)
        if (data.pickup_date) console.log(`  • Pickup Date: ${data.pickup_date}`)
        if (data.temperature) console.log(`  • Temperature: ${data.temperature.min}-${data.temperature.max}°${data.temperature.unit}`)
        if (data.dimensions) console.log(`  • Dimensions: ${data.dimensions.length}"×${data.dimensions.width}"×${data.dimensions.height}"`)
        if (data.hazmat_class) console.log(`  • Hazmat Class: ${data.hazmat_class}`)
      }
      
      if (result.missing_fields && result.missing_fields.length > 0) {
        console.log('\n⚠️  Missing Required Fields:')
        result.missing_fields.forEach(field => {
          console.log(`  • ${field}`)
        })
      }
      
      if (result.validation_warnings && result.validation_warnings.length > 0) {
        console.log('\n⚠️  Validation Warnings:')
        result.validation_warnings.forEach(warning => {
          console.log(`  • ${warning}`)
        })
      }
      
      if (result.reason) {
        console.log(`\n💭 Reason: ${result.reason}`)
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error}`)
    }
    
    console.log('\n' + '='.repeat(80))
  }
}

// Run the test
testFreightClassification().catch(console.error)