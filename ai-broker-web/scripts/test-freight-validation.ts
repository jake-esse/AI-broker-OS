/**
 * Comprehensive Freight Validation Testing
 * 
 * Tests the LLM's ability to correctly identify missing information
 * and validate freight requirements based on freight type.
 * 
 * Edge cases focus on:
 * - Partial information that looks complete
 * - Information in non-standard formats
 * - Conflicting or ambiguous data
 * - Industry-specific terminology variations
 */

import { config } from 'dotenv'
import * as path from 'path'
import { IntakeAgentLLMEnhanced } from '../lib/agents/intake-llm-enhanced'
import { FreightValidator, FreightType } from '../lib/freight-types/freight-validator'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

interface ValidationTestCase {
  id: string
  category: string
  description: string
  email: {
    subject: string
    from: string
    content: string
  }
  expectedFreightType: FreightType
  expectedMissingFields: string[]
  expectedAction: 'proceed_to_quote' | 'request_clarification' | 'ignore'
  notes: string
}

// Comprehensive test cases for validation edge cases
const validationTestCases: ValidationTestCase[] = [
  // === TEMPERATURE AMBIGUITY CASES ===
  {
    id: 'temp-1',
    category: 'Temperature Ambiguity',
    description: 'Commodity suggests reefer but no temp specified',
    email: {
      subject: 'Load - Frozen food shipment',
      from: 'shipper@food.com',
      content: `Need quote for frozen pizzas:
      
From: Chicago, IL 60601
To: Dallas, TX 75201
Weight: 40,000 lbs
Equipment: 53' dry van
Pickup: Tomorrow morning

Please quote ASAP.`
    },
    expectedFreightType: 'FTL_DRY_VAN', // Should respect explicit equipment type
    expectedMissingFields: [],
    expectedAction: 'proceed_to_quote',
    notes: 'System should not infer reefer from commodity when dry van explicitly stated'
  },

  {
    id: 'temp-2',
    category: 'Temperature Ambiguity',
    description: 'Temperature mentioned casually, not as requirement',
    email: {
      subject: 'Shipment request',
      from: 'logistics@company.com',
      content: `Hi,

We have a load of electronics that was sitting in our 70°F warehouse.

Pickup: Atlanta, GA 30301
Delivery: Miami, FL 33101
Weight: 25,000 lbs
Need: Dry van
Ready: Wednesday

Thanks!`
    },
    expectedFreightType: 'FTL_DRY_VAN',
    expectedMissingFields: [],
    expectedAction: 'proceed_to_quote',
    notes: 'Casual temperature mention should not trigger reefer requirement'
  },

  {
    id: 'temp-3',
    category: 'Temperature Ambiguity',
    description: 'Reefer with only max temp specified',
    email: {
      subject: 'Refrigerated load',
      from: 'produce@farm.com',
      content: `Fresh produce shipment:

Origin: Salinas, CA 93901
Destination: Chicago, IL 60601
Weight: 42,000 lbs
Equipment: Reefer
Keep below 40°F
Pickup: Tomorrow AM`
    },
    expectedFreightType: 'FTL_REEFER',
    expectedMissingFields: [],
    expectedAction: 'proceed_to_quote',
    notes: 'Max temp only should be valid for reefer'
  },

  // === LOCATION AMBIGUITY CASES ===
  {
    id: 'loc-1',
    category: 'Location Ambiguity',
    description: 'City/state without zip but clear location',
    email: {
      subject: 'Load ready',
      from: 'shipper@clear.com',
      content: `Load details:

Pickup: Chicago, IL (downtown warehouse)
Deliver to: Houston, TX (port area)
Weight: 38,000 lbs  
Commodity: Steel coils
Equipment: Flatbed
Ready now`
    },
    expectedFreightType: 'FTL_FLATBED',
    expectedMissingFields: ['dimensions'], // Flatbed needs dimensions
    expectedAction: 'request_clarification',
    notes: 'Missing zip should not block if city/state are clear, but flatbed needs dimensions'
  },

  {
    id: 'loc-2',
    category: 'Location Ambiguity',
    description: 'Partial address with landmark',
    email: {
      subject: 'Urgent shipment',
      from: 'warehouse@company.com',
      content: `Pick up at our warehouse near O'Hare Airport
Deliver to Amazon fulfillment center in Dallas

35,000 lbs of consumer goods
Dry van needed
Pickup tomorrow 8am`
    },
    expectedFreightType: 'FTL_DRY_VAN',
    expectedMissingFields: ['pickup_location', 'delivery_location'],
    expectedAction: 'request_clarification',
    notes: 'Landmarks are not sufficient - need actual addresses'
  },

  {
    id: 'loc-3',
    category: 'Location Ambiguity',
    description: 'International border crossing mentioned',
    email: {
      subject: 'Cross-border load',
      from: 'intl@shipper.com',
      content: `Need quote:

From: Detroit, MI 48201
To: Toronto, ON M5V 3A8
Weight: 30,000 lbs
Dry van
Pickup Thursday

Must be bonded carrier.`
    },
    expectedFreightType: 'FTL_DRY_VAN',
    expectedMissingFields: ['commodity'], // Commodity required for customs
    expectedAction: 'request_clarification',
    notes: 'International shipments need commodity for customs'
  },

  // === WEIGHT AND DIMENSION EDGE CASES ===
  {
    id: 'weight-1',
    category: 'Weight Ambiguity',
    description: 'Weight in different units',
    email: {
      subject: 'Heavy machinery transport',
      from: 'equipment@mfg.com',
      content: `Transport request:

Pickup: Houston, TX 77001
Deliver: New Orleans, LA 70112
Cargo: Industrial generator - 20 tons
Need: Flatbed with chains
Dimensions: 12' L x 8' W x 10' H
Pickup date: Friday`
    },
    expectedFreightType: 'FTL_FLATBED',
    expectedMissingFields: [],
    expectedAction: 'proceed_to_quote',
    notes: 'System should convert tons to pounds (20 tons = 40,000 lbs)'
  },

  {
    id: 'weight-2',
    category: 'Weight Ambiguity',
    description: 'Multiple pieces with individual weights',
    email: {
      subject: 'LTL shipment',
      from: 'warehouse@dist.com',
      content: `Please quote:

From: Denver, CO 80202
To: Salt Lake City, UT 84101
4 pallets @ 500 lbs each
2 crates @ 750 lbs each
Total pieces: 6
Class 70
Liftgate delivery needed
Ready Monday`
    },
    expectedFreightType: 'LTL',
    expectedMissingFields: ['dimensions'],
    expectedAction: 'request_clarification',
    notes: 'LTL requires dimensions even though weight math is clear (3,500 lbs total)'
  },

  {
    id: 'weight-3',
    category: 'Weight Ambiguity',
    description: 'Weight range instead of exact',
    email: {
      subject: 'Variable weight load',
      from: 'shipper@flex.com',
      content: `Chicago to Memphis run:

Pickup: Chicago, IL 60601
Deliver: Memphis, TN 38103
Weight: 35,000-40,000 lbs depending on final order
Dry van
Tuesday pickup

Will confirm exact weight Monday.`
    },
    expectedFreightType: 'FTL_DRY_VAN',
    expectedMissingFields: ['commodity'],
    expectedAction: 'request_clarification',
    notes: 'Weight range acceptable but still need commodity'
  },

  // === EQUIPMENT TYPE CONFUSION ===
  {
    id: 'equip-1',
    category: 'Equipment Confusion',
    description: 'Conflicting equipment signals',
    email: {
      subject: 'Flatbed or step deck?',
      from: 'shipper@machinery.com',
      content: `Have a tall load:

From: Milwaukee, WI 53201
To: St. Louis, MO 63101
Machinery: 35,000 lbs
Dimensions: 20' x 8' x 14' high
Need flatbed but height might require step deck?
Pickup Thursday`
    },
    expectedFreightType: 'FTL_FLATBED',
    expectedMissingFields: [],
    expectedAction: 'proceed_to_quote',
    notes: 'System should identify flatbed and note height issue in warnings'
  },

  {
    id: 'equip-2',
    category: 'Equipment Confusion',
    description: 'Vague equipment description',
    email: {
      subject: 'Need a truck',
      from: 'basic@shipper.com',
      content: `Ship our products:

From: Phoenix, AZ 85001
To: Las Vegas, NV 89101  
22,000 lbs of boxed items
Need enclosed trailer
Pickup tomorrow`
    },
    expectedFreightType: 'FTL_DRY_VAN',
    expectedMissingFields: [],
    expectedAction: 'proceed_to_quote',
    notes: 'Enclosed trailer should map to dry van'
  },

  // === HAZMAT EDGE CASES ===
  {
    id: 'hazmat-1',
    category: 'Hazmat Ambiguity',
    description: 'Hazmat keyword without actual hazmat',
    email: {
      subject: 'Non-hazardous chemicals',
      from: 'chem@company.com',
      content: `Transport request:

From: Houston, TX 77001
To: Atlanta, GA 30301
Product: Non-hazardous cleaning chemicals
Weight: 40,000 lbs
Dry van is fine
No special requirements
Pickup Wednesday`
    },
    expectedFreightType: 'FTL_DRY_VAN',
    expectedMissingFields: [],
    expectedAction: 'proceed_to_quote',
    notes: 'Non-hazardous explicitly stated - not hazmat'
  },

  {
    id: 'hazmat-2',
    category: 'Hazmat Ambiguity',
    description: 'Partial hazmat info',
    email: {
      subject: 'Class 3 shipment',
      from: 'hazmat@chem.com',
      content: `Hazmat load:

Origin: Houston, TX 77001
Dest: New Orleans, LA 70112
Class 3 flammable liquid
Weight: 42,000 lbs
Pickup tomorrow

Need placarded truck.`
    },
    expectedFreightType: 'FTL_HAZMAT',
    expectedMissingFields: ['un_number', 'proper_shipping_name', 'packing_group', 'emergency_contact'],
    expectedAction: 'request_clarification',
    notes: 'Hazmat class alone is not sufficient'
  },

  // === DATE/TIME AMBIGUITY ===
  {
    id: 'date-1',
    category: 'Date Ambiguity',
    description: 'Relative date references',
    email: {
      subject: 'Load for next week',
      from: 'planner@company.com',
      content: `Planning ahead:

Chicago, IL 60601 to Dallas, TX 75201
38,000 lbs
Dry van
Pickup early next week (Mon or Tue)
Flexible on exact day`
    },
    expectedFreightType: 'FTL_DRY_VAN',
    expectedMissingFields: ['commodity'],
    expectedAction: 'request_clarification',
    notes: 'Flexible dates are acceptable but need commodity'
  },

  {
    id: 'date-2',
    category: 'Date Ambiguity',
    description: 'Appointment time without date',
    email: {
      subject: 'Appointment scheduled',
      from: 'shipper@scheduled.com',
      content: `Load info:

Pick up at 10:00 AM appointment
Chicago, IL 60601
Deliver to Houston, TX 77001
42,000 lbs machinery
Flatbed required
Dimensions: 20x8x8`
    },
    expectedFreightType: 'FTL_FLATBED',
    expectedMissingFields: ['pickup_date'],
    expectedAction: 'request_clarification',
    notes: 'Time without date is insufficient'
  },

  // === PARTIAL/LTL CONFUSION ===
  {
    id: 'partial-1',
    category: 'Partial vs LTL',
    description: 'Weight in partial range but called LTL',
    email: {
      subject: 'LTL quote needed',
      from: 'shipper@confused.com',
      content: `Small shipment:

From: Dallas, TX 75201
To: Austin, TX 78701
8,000 lbs on 4 pallets
Dimensions: 48x40x48 each
No special services needed
Pickup Friday`
    },
    expectedFreightType: 'PARTIAL',
    expectedMissingFields: ['commodity'],
    expectedAction: 'request_clarification',
    notes: '8,000 lbs is partial territory despite LTL mention'
  },

  {
    id: 'partial-2',
    category: 'Partial vs LTL',
    description: 'True LTL with class',
    email: {
      subject: 'Small freight',
      from: 'shipper@ltl.com',
      content: `LTL shipment:

Origin: Memphis, TN 38103
Destination: Nashville, TN 37201
1,200 lbs
Class 85
2 pallets 48x40x60
Standard delivery
Ready Monday`
    },
    expectedFreightType: 'LTL',
    expectedMissingFields: ['commodity'],
    expectedAction: 'request_clarification',
    notes: 'Proper LTL with class but missing commodity'
  },

  // === COMPLETE BUT TRICKY CASES ===
  {
    id: 'complete-1',
    category: 'Complete Information',
    description: 'All info present but scattered',
    email: {
      subject: 'RE: Your truck availability',
      from: 'buyer@shipper.com',
      content: `Yes, we have a load!

It's 35,000 lbs of auto parts going from our Detroit facility (48201) down to the
plant in Louisville (40201). Need a dry van.

Oh, pickup is set for Thursday morning around 8 AM.

Let me know your rate.`
    },
    expectedFreightType: 'FTL_DRY_VAN',
    expectedMissingFields: [],
    expectedAction: 'proceed_to_quote',
    notes: 'All required info present despite informal format'
  },

  {
    id: 'complete-2',
    category: 'Complete Information',
    description: 'Flatbed with all requirements',
    email: {
      subject: 'Steel coils - urgent',
      from: 'steel@manufacturer.com',
      content: `Urgent flatbed load:

Pickup: Gary, IN 46402
Deliver: Detroit, MI 48201
Commodity: Steel coils
Weight: 44,000 lbs
Dimensions: 6 coils, each 60" diameter x 48" wide
Tarping required
Chains and coil racks needed
Pickup: Tomorrow 6 AM

Need experienced steel hauler.`
    },
    expectedFreightType: 'FTL_FLATBED',
    expectedMissingFields: [],
    expectedAction: 'proceed_to_quote',
    notes: 'Complete flatbed load with all special requirements'
  }
]

export { validationTestCases }