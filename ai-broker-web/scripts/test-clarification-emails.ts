/**
 * Test Clarification Email Generation
 * 
 * Shows actual email content generated for different scenarios
 * 
 * Run with: npx tsx scripts/test-clarification-emails.ts
 */

import { config } from 'dotenv'
import * as path from 'path'
import { ClarificationGenerator } from '../lib/email/clarification-generator'
import { FreightType } from '../lib/freight-types/freight-validator'

config({ path: path.join(__dirname, '../.env.local') })

// Test scenarios with different missing information
const scenarios = [
  {
    name: 'Simple Dry Van - Missing Pickup Date',
    data: {
      shipperEmail: 'shipper@example.com',
      brokerName: 'Swift Freight Solutions',
      freightType: 'FTL_DRY_VAN' as FreightType,
      extractedData: {
        pickup_location: 'Chicago, IL 60601',
        delivery_location: 'Dallas, TX 75201',
        weight: 38000,
        commodity: 'Packaged consumer goods',
        equipment_type: 'Dry van'
      },
      missingFields: [{
        field: 'pickup_date',
        issue: 'missing' as const,
        message: 'Pickup date is required'
      }],
      originalSubject: 'Need quote for Chicago to Dallas',
      originalContent: 'I need to ship 38,000 lbs of consumer goods from Chicago to Dallas. Need a dry van.',
      loadId: 'LOAD-2024-001',
      threadId: 'msg-12345'
    }
  },
  {
    name: 'Reefer Load - Missing Temperature',
    data: {
      shipperEmail: 'logistics@foodco.com',
      brokerName: 'Cold Chain Express',
      freightType: 'FTL_REEFER' as FreightType,
      extractedData: {
        pickup_location: 'Salinas, CA 93901',
        delivery_location: 'Chicago, IL 60601',
        weight: 42000,
        commodity: 'Fresh produce',
        equipment_type: 'Reefer',
        pickup_date: '2024-12-20'
      },
      missingFields: [{
        field: 'temperature',
        issue: 'missing' as const,
        message: 'Temperature requirements are required for refrigerated shipments'
      }],
      originalSubject: 'Produce shipment - Salinas to Chicago',
      originalContent: 'We have 42,000 lbs of fresh produce going from Salinas to Chicago. Need reefer truck for pickup on Dec 20.',
      loadId: 'LOAD-2024-002',
      threadId: 'msg-67890'
    }
  },
  {
    name: 'Hazmat Load - Multiple Missing Fields',
    data: {
      shipperEmail: 'shipping@chemicalcorp.com',
      brokerName: 'HazMat Transport Pros',
      freightType: 'FTL_HAZMAT' as FreightType,
      extractedData: {
        pickup_location: 'Houston, TX 77001',
        delivery_location: 'Atlanta, GA 30301',
        weight: 35000,
        commodity: 'Chemical products',
        equipment_type: 'Dry van',
        pickup_date: '2024-12-22'
      },
      missingFields: [
        {
          field: 'hazmat_class',
          issue: 'missing' as const,
          message: 'DOT hazmat classification is required'
        },
        {
          field: 'un_number',
          issue: 'missing' as const,
          message: 'UN identification number is required'
        },
        {
          field: 'emergency_contact',
          issue: 'missing' as const,
          message: '24/7 emergency contact is required'
        }
      ],
      originalSubject: 'Hazmat shipment Houston to Atlanta',
      originalContent: 'Need to ship 35,000 lbs of chemical products from Houston to Atlanta. Pickup Dec 22.',
      loadId: 'LOAD-2024-003',
      threadId: 'msg-11111'
    }
  },
  {
    name: 'Insufficient Location Information',
    data: {
      shipperEmail: 'ops@distributor.com',
      brokerName: 'Precision Logistics',
      freightType: 'FTL_DRY_VAN' as FreightType,
      extractedData: {
        pickup_location: 'Walmart DC',
        delivery_location: 'somewhere in Miami',
        weight: 40000,
        commodity: 'Mixed merchandise',
        equipment_type: 'Dry van',
        pickup_date: 'Next Monday'
      },
      missingFields: [
        {
          field: 'pickup_location',
          issue: 'insufficient' as const,
          message: 'Need complete address with street, city, state, and ZIP'
        },
        {
          field: 'delivery_location',
          issue: 'insufficient' as const,
          message: 'Need complete address with street, city, state, and ZIP'
        },
        {
          field: 'pickup_date',
          issue: 'insufficient' as const,
          message: 'Need specific date (MM/DD/YYYY format)'
        }
      ],
      originalSubject: 'Load from Walmart DC to Miami',
      originalContent: 'Have a load from Walmart DC to somewhere in Miami. 40k lbs mixed merchandise. Pickup next Monday.',
      loadId: 'LOAD-2024-004',
      threadId: 'msg-22222'
    }
  }
]

async function testEmailGeneration() {
  console.log('📧 CLARIFICATION EMAIL GENERATION TEST')
  console.log('=====================================\n')
  
  const generator = new ClarificationGenerator()
  
  for (const scenario of scenarios) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`SCENARIO: ${scenario.name}`)
    console.log('='.repeat(80))
    
    try {
      const result = await generator.generateEmail(scenario.data as any)
      
      console.log('\n📬 GENERATED EMAIL:')
      console.log('-'.repeat(50))
      console.log(`TO: ${scenario.data.shipperEmail}`)
      console.log(`SUBJECT: ${result.subject}`)
      console.log('-'.repeat(50))
      console.log('\nPLAIN TEXT VERSION:')
      console.log(result.textContent)
      console.log('\n' + '-'.repeat(50))
      
      // Show missing fields summary
      console.log('\n📋 MISSING FIELDS REQUESTED:')
      scenario.data.missingFields.forEach(field => {
        console.log(`- ${field.field} (${field.issue}): ${field.message}`)
      })
      
    } catch (error: any) {
      console.error(`❌ Error generating email: ${error.message}`)
    }
  }
  
  console.log('\n\n✅ EMAIL GENERATION TEST COMPLETE')
}

// Run the test
testEmailGeneration().catch(console.error)