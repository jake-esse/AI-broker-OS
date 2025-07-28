/**
 * Freight Industry Edge Case Tests
 * 
 * Based on real-world scenarios from FREIGHT_BROKERAGE.md
 * Tests the system's ability to handle complex freight industry situations
 */

import { config } from 'dotenv'
import * as path from 'path'
import { FreightType } from '../lib/freight-types/freight-validator'

config({ path: path.join(__dirname, '../.env.local') })

interface IndustryEdgeCaseTest {
  id: string
  category: string
  description: string
  businessContext: string
  email: {
    subject: string
    from: string
    content: string
  }
  expectedAction: 'proceed_to_quote' | 'request_clarification' | 'ignore'
  expectedFreightType?: FreightType
  expectedIssues?: string[]
  industryNotes: string
}

export const industryEdgeCases: IndustryEdgeCaseTest[] = [
  // === MULTI-STOP AND COMPLEX ROUTING ===
  {
    id: 'multi-stop-1',
    category: 'Multi-Stop Loads',
    description: 'Multiple pickup locations going to single delivery',
    businessContext: 'Common in retail consolidation where multiple vendors ship to one DC',
    email: {
      subject: 'Consolidation load - 3 pickups',
      from: 'logistics@retailchain.com',
      content: `Need a truck for consolidated pickup:
      
Stop 1: ABC Supplier, Chicago, IL 60601 - 15,000 lbs
Stop 2: XYZ Vendor, Milwaukee, WI 53201 - 12,000 lbs  
Stop 3: 123 Products, Madison, WI 53703 - 10,000 lbs

All deliver to: Distribution Center, Memphis, TN 38103

Total weight: 37,000 lbs
Equipment: 53' dry van
Pickup date: Thursday (all stops same day)

Need quote including stop charges.`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'FTL_DRY_VAN',
    expectedIssues: ['pickup_location'], // System expects single pickup
    industryNotes: 'Multi-stop loads require special handling and pricing'
  },

  {
    id: 'multi-stop-2',
    category: 'Multi-Stop Loads',
    description: 'Single pickup with multiple delivery stops',
    businessContext: 'Common in distribution where one shipper sends to multiple customers',
    email: {
      subject: 'Multi-drop shipment',
      from: 'distribution@manufacturer.com',
      content: `Multi-stop delivery needed:

Pickup: Our warehouse at 2500 Industrial Blvd, Dallas, TX 75201
Total weight: 42,000 lbs of packaged goods

Delivery stops:
1. Customer A - Houston, TX 77001 (20,000 lbs)
2. Customer B - San Antonio, TX 78201 (15,000 lbs)
3. Customer C - Austin, TX 78701 (7,000 lbs)

Need 53' dry van, pickup Monday morning
First delivery Tuesday AM, last delivery Tuesday PM`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'FTL_DRY_VAN',
    expectedIssues: ['delivery_location'], // System expects single delivery
    industryNotes: 'Multi-drop loads need stop-off charges and routing optimization'
  },

  // === APPOINTMENT AND TIME WINDOW COMPLEXITIES ===
  {
    id: 'appointment-1',
    category: 'Appointment Requirements',
    description: 'Strict appointment windows with penalties',
    businessContext: 'Large retailers often have strict receiving appointments with financial penalties',
    email: {
      subject: 'Target DC delivery - MUST HIT APPOINTMENT',
      from: 'shipping@cpgcompany.com',
      content: `CRITICAL LOAD - Target appointment

Pickup: Our facility - Cincinnati, OH 45201
Deliver: Target DC #3805, Woodland, CA 95776
Product: 38,000 lbs paper products
Equipment: 53' dry van

APPOINTMENT: Thursday 10:00 AM - MUST NOT BE LATE
$500 penalty for missing appointment
Driver must have Target vendor compliance training

Please confirm you can guarantee appointment.`
    },
    expectedAction: 'proceed_to_quote',
    expectedFreightType: 'FTL_DRY_VAN',
    expectedIssues: [],
    industryNotes: 'Appointment requirements significantly impact carrier selection and pricing'
  },

  {
    id: 'appointment-2',
    category: 'Appointment Requirements',
    description: 'Live load with detention concerns',
    businessContext: 'Live loading/unloading can result in detention charges if delayed',
    email: {
      subject: 'Live load - 4 hour window',
      from: 'logistics@steelcompany.com',
      content: `Steel coil shipment - LIVE LOAD

Pickup: Steel plant, Gary, IN 46402
- Live loading appointment 6 AM Wednesday
- Estimated 4 hours to load
- 6 coils @ 45,000 lbs total

Deliver: Fabricator, Nashville, TN 37201
- Open delivery Thursday

Equipment: Flatbed with coil racks
Must have proper securement equipment

Note: $75/hour detention after 2 hours free time`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'FTL_FLATBED',
    expectedIssues: ['dimensions'],
    industryNotes: 'Live loads require carriers willing to wait and proper detention agreements'
  },

  // === SPECIALIZED EQUIPMENT VARIATIONS ===
  {
    id: 'equipment-1',
    category: 'Specialized Equipment',
    description: 'Vented van for agricultural products',
    businessContext: 'Some commodities require specialized trailers not in standard categories',
    email: {
      subject: 'Potatoes - need vented van',
      from: 'sales@potatofarm.com',
      content: `Potato shipment requiring ventilation:

Load 45,000 lbs fresh potatoes
From: Boise, ID 83702 
To: Chicago, IL 60601

MUST HAVE VENTED VAN - regular dry van won't work
Potatoes need air circulation to prevent spoilage
No temperature control needed, just ventilation

Pickup Friday, deliver Monday`
    },
    expectedAction: 'proceed_to_quote',
    expectedFreightType: 'FTL_DRY_VAN',
    expectedIssues: [],
    industryNotes: 'Vented vans are a specialized subset of dry vans'
  },

  {
    id: 'equipment-2',
    category: 'Specialized Equipment',
    description: 'Conestoga trailer request',
    businessContext: 'Conestoga trailers offer benefits of both flatbed and dry van',
    email: {
      subject: 'Need Conestoga or curtainside',
      from: 'shipping@manufacturer.com',
      content: `Oversized machinery shipment:

From: Detroit, MI 48201
To: Dallas, TX 75201
Weight: 38,000 lbs
Dimensions: 45'L x 8'W x 9'H

Need Conestoga or curtainside trailer
- Side loading required
- Weather protection needed
- Standard flatbed won't work
- Dry van doors too small

Ready Tuesday`
    },
    expectedAction: 'proceed_to_quote',
    expectedFreightType: 'FTL_FLATBED',
    expectedIssues: [],
    industryNotes: 'Conestoga is a type of flatbed with retractable tarp system'
  },

  // === ACCESSORIAL AND SPECIAL SERVICES ===
  {
    id: 'accessorial-1',
    category: 'Special Services',
    description: 'Multiple accessorial services on LTL',
    businessContext: 'LTL shipments often require multiple special services that impact pricing',
    email: {
      subject: 'LTL with special handling',
      from: 'fulfillment@ecommerce.com',
      content: `LTL shipment needing several services:

Ship from: Our warehouse, Portland, OR 97201
Deliver to: Residential address in Bend, OR 97701

3 pallets, 2,800 lbs total
48" x 40" x 60" each pallet
Class 70

REQUIRED SERVICES:
- Liftgate at delivery (no dock)
- Residential delivery
- Inside delivery to garage
- Call before delivery
- Signature required

Need Tuesday pickup`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'LTL',
    expectedIssues: ['dimensions'],
    industryNotes: 'Multiple accessorials can double or triple base LTL rates'
  },

  {
    id: 'accessorial-2',
    category: 'Special Services',
    description: 'Blanket wrap service request',
    businessContext: 'High-value goods may require special handling beyond standard freight',
    email: {
      subject: 'Antique furniture - blanket wrap',
      from: 'gallery@artdealer.com',
      content: `High-value shipment needs special care:

Moving antique furniture collection
From: New York, NY 10001
To: Los Angeles, CA 90001

Approximately 8,000 lbs
Mix of tables, chairs, cabinets
Value: $450,000

MUST HAVE:
- Blanket wrap service
- Air ride suspension
- Team drivers
- High-value cargo insurance

Flexible on dates but need white glove service`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'PARTIAL',
    expectedIssues: ['commodity', 'pickup_date'],
    industryNotes: 'Blanket wrap is premium service for uncrated high-value items'
  },

  // === HAZMAT VARIATIONS AND COMPLEXITIES ===
  {
    id: 'hazmat-1',
    category: 'Hazmat Complexity',
    description: 'Multiple hazmat classes in one shipment',
    businessContext: 'Mixed hazmat loads require careful compatibility checking',
    email: {
      subject: 'Mixed hazmat load',
      from: 'shipping@chemicalco.com',
      content: `Hazmat shipment with multiple products:

From: Chemical plant, Houston, TX 77001
To: Distribution center, Phoenix, AZ 85001

Products:
- 10 drums UN1203 Gasoline (Class 3) - 4,000 lbs
- 15 drums UN1830 Sulfuric Acid (Class 8) - 6,000 lbs
- 20 boxes UN3077 Env. Hazardous Solid (Class 9) - 2,000 lbs

Total: 12,000 lbs
Need hazmat certified carrier
Emergency contact: 800-555-CHEM

Pickup Thursday`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'FTL_HAZMAT',
    expectedIssues: ['proper_shipping_name', 'packing_group', 'placards_required'],
    industryNotes: 'Segregation requirements may prevent mixing certain hazmat classes'
  },

  {
    id: 'hazmat-2',
    category: 'Hazmat Complexity',
    description: 'Limited quantity hazmat',
    businessContext: 'Limited quantities have reduced requirements but still need proper handling',
    email: {
      subject: 'Paint shipment - limited qty hazmat',
      from: 'warehouse@paintdistributor.com',
      content: `Paint shipment - Limited Quantity Hazmat:

From: Newark, NJ 07101
To: Richmond, VA 23219

300 cases of paint products
Each case contains consumer-size paint cans
Total weight: 18,000 lbs
UN1263 Paint, Class 3, PG III
Marked as Limited Quantity per 49 CFR

Regular dry van OK - no placards required
Need carrier comfortable with Ltd Qty hazmat

Ready Monday`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'FTL_HAZMAT',
    expectedIssues: ['emergency_contact'],
    industryNotes: 'Limited quantity has relaxed requirements but is still regulated'
  },

  // === TEMPERATURE CONTROL EDGE CASES ===
  {
    id: 'temp-control-1',
    category: 'Temperature Complexity',
    description: 'Multi-temp with different zones',
    businessContext: 'Some reefers can maintain different temperatures in separate zones',
    email: {
      subject: 'Multi-temp reefer load',
      from: 'logistics@fooddistributor.com',
      content: `Mixed temperature products:

From: Food warehouse, Atlanta, GA 30301
To: Grocery DC, Charlotte, NC 28201

Need multi-temp reefer with 3 zones:
- Frozen (-10°F): 15,000 lbs frozen foods
- Refrigerated (34°F): 18,000 lbs dairy
- Controlled ambient (55°F): 8,000 lbs produce

Total: 41,000 lbs
Must maintain all three temps
Continuous temperature monitoring required

Pickup Wednesday AM`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'FTL_REEFER',
    expectedIssues: ['temperature'], // System expects single temp range
    industryNotes: 'Multi-temp units are specialized and more expensive'
  },

  {
    id: 'temp-control-2',
    category: 'Temperature Complexity',
    description: 'Protect from freeze only',
    businessContext: 'Some loads just need freeze protection, not full refrigeration',
    email: {
      subject: 'Beverages - protect from freeze',
      from: 'shipping@beveragecompany.com',
      content: `Beverage shipment - freeze protection needed:

From: Bottling plant, Milwaukee, WI 53201
To: Distribution center, Minneapolis, MN 55401

42,000 lbs bottled beverages
Just need protection from freezing
Maintain above 35°F - no cooling needed
This is NOT a full reefer load

Standard dry van with heater unit acceptable
Or reefer on "protect from freeze" setting

Pickup Friday - winter weather expected`
    },
    expectedAction: 'proceed_to_quote',
    expectedFreightType: 'FTL_REEFER',
    expectedIssues: [],
    industryNotes: 'Protect from freeze is common in winter for liquids'
  },

  // === PARTIAL AND LTL BOUNDARY CASES ===
  {
    id: 'partial-ltl-1',
    category: 'Partial/LTL Boundary',
    description: 'Volume LTL vs partial truckload decision',
    businessContext: 'Loads between 10-15k lbs can go either LTL or partial',
    email: {
      subject: 'Is this LTL or partial?',
      from: 'traffic@manufacturer.com',
      content: `Not sure if this should be LTL or partial:

From: Kansas City, MO 64101
To: Denver, CO 80201

12 pallets of auto parts
Total weight: 11,500 lbs
Each pallet: 48" x 40" x 48"
Stackable, Class 65

Can go either way - whatever is cheaper
No special services needed
Standard commercial locations

Pickup next Tuesday`
    },
    expectedAction: 'proceed_to_quote',
    expectedFreightType: 'PARTIAL',
    expectedIssues: [],
    industryNotes: 'Broker must quote both options to find best value'
  },

  {
    id: 'partial-ltl-2',
    category: 'Partial/LTL Boundary',
    description: 'Dimensional weight affecting mode choice',
    businessContext: 'Light but bulky freight may be better as partial despite low weight',
    email: {
      subject: 'Lightweight but takes whole trailer',
      from: 'shipping@packagingco.com',
      content: `Shipping empty containers:

From: Los Angeles, CA 90001
To: Seattle, WA 98101

Empty plastic containers
Weight: only 4,500 lbs
BUT: Takes up entire 53' trailer (very bulky)
Cannot be compressed or nested

Not sure how to ship this - too light for truckload
but too big for LTL. What do you recommend?

Need it there by Friday`
    },
    expectedAction: 'proceed_to_quote',
    expectedFreightType: 'FTL_DRY_VAN', // Takes full trailer despite weight
    expectedIssues: ['dimensions'],
    industryNotes: 'Cube-out loads are priced on space, not weight'
  },

  // === PERMIT AND OVERSIZE COMPLEXITIES ===
  {
    id: 'oversize-1',
    category: 'Oversize/Permit Loads',
    description: 'Multi-state permit requirements',
    businessContext: 'Oversize loads need permits for each state they traverse',
    email: {
      subject: 'Oversize load - multiple states',
      from: 'projects@heavyequipment.com',
      content: `Oversize equipment move:

From: Houston, TX 77001
To: Chicago, IL 60601

Excavator on trailer
Total dimensions: 14' wide x 15' high x 65' long
Weight: 95,000 lbs (with trailer)

Route through: TX, OK, MO, IL
Need all state permits
Escort requirements per state
Can only move daylight hours

Target delivery in 5 days`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'FTL_FLATBED',
    expectedIssues: ['oversize_permits', 'escort_required'],
    industryNotes: 'Each state has different permit rules and costs'
  },

  {
    id: 'oversize-2',
    category: 'Oversize/Permit Loads',
    description: 'Overweight requiring special permits',
    businessContext: 'Overweight loads may need special routing to avoid weak bridges',
    email: {
      subject: 'Super heavy - need permits',
      from: 'logistics@industrialco.com',
      content: `Heavy machinery shipment:

From: Pittsburgh, PA 15201
To: Cleveland, OH 44101

Industrial press: 120,000 lbs
Dimensions: 12'L x 10'W x 11'H
Will need multi-axle trailer

Total weight with trailer ~150,000 lbs
Need overweight permits
Route must avoid restricted bridges

Flexible on timing - safety first`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'FTL_FLATBED',
    expectedIssues: ['weight'], // Exceeds normal limits
    industryNotes: 'Overweight requires special equipment and routing'
  },

  // === CROSS-BORDER AND INTERNATIONAL ===
  {
    id: 'cross-border-1',
    category: 'Cross-Border',
    description: 'NAFTA/USMCA shipment requirements',
    businessContext: 'Cross-border shipments need additional documentation',
    email: {
      subject: 'Load to Canada',
      from: 'export@usmanufacturer.com',
      content: `International shipment to Canada:

From: Buffalo, NY 14201
To: Toronto, ON M5H 2N1 Canada

Auto parts - 35,000 lbs
Dry van needed
Commercial invoice value: $125,000
HS codes and USMCA certificates ready

Need carrier with Canada authority
Must clear customs at Peace Bridge

Pickup Thursday for Monday delivery`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'FTL_DRY_VAN',
    expectedIssues: ['commodity'], // Need specific description for customs
    industryNotes: 'Cross-border requires specialized carriers and documentation'
  },

  {
    id: 'cross-border-2',
    category: 'Cross-Border',
    description: 'In-bond shipment through US',
    businessContext: 'In-bond shipments move through US without customs clearance',
    email: {
      subject: 'In-bond Mexico to Canada',
      from: 'freight@forwarder.com',
      content: `In-bond shipment:

From: Laredo, TX 78040 (already crossed from Mexico)
To: Windsor, ON N9A 6T3 Canada

Sealed container - IN BOND
Must remain sealed through US
T&E bond already filed
40,000 lbs automotive components

Need carrier approved for in-bond moves
Direct route required - no stops
Seal must not be broken

Ready now`
    },
    expectedAction: 'request_clarification',
    expectedFreightType: 'FTL_DRY_VAN',
    expectedIssues: ['commodity', 'pickup_date'],
    industryNotes: 'In-bond requires special carrier qualifications'
  },

  // === TEAM DRIVER AND EXPEDITED ===
  {
    id: 'expedited-1',
    category: 'Expedited/Team',
    description: 'True team run for time-sensitive load',
    businessContext: 'Team drivers can run continuously for faster delivery',
    email: {
      subject: 'URGENT - Need team drivers',
      from: 'emergency@pharmaceutical.com',
      content: `EXPEDITED TEAM RUN NEEDED:

From: Pharmaceutical plant, Indianapolis, IN 46201
To: Hospital, Los Angeles, CA 90001

Critical medical supplies - 28,000 lbs
Must deliver in 36 hours (normally 3-4 days)
REQUIRES TEAM DRIVERS - no stops except fuel

Temperature controlled 35-46°F
High value - $2M cargo value
Need tracking updates every 4 hours

Can pay premium for guaranteed service`
    },
    expectedAction: 'proceed_to_quote',
    expectedFreightType: 'FTL_REEFER',
    expectedIssues: [],
    industryNotes: 'Team runs command premium rates for guaranteed transit'
  },

  {
    id: 'expedited-2',
    category: 'Expedited/Team',
    description: 'Sprinter van for small expedited',
    businessContext: 'Small expedited loads often use Sprinter vans',
    email: {
      subject: 'Hot shot - small parts',
      from: 'production@factory.com',
      content: `Production line down - need parts ASAP:

From: Supplier in Columbus, OH 43201
To: Our plant in Louisville, KY 40201

Small crate: 500 lbs, 4'x3'x3'
Aircraft parts - plant is shut down waiting

Need Sprinter van or cargo van
Direct drive - 3 hours max
Driver wait while we confirm parts
Then return with defective parts

Will pay expedited rates`
    },
    expectedAction: 'proceed_to_quote',
    expectedFreightType: 'LTL', // Small expedited often classified as LTL
    expectedIssues: [],
    industryNotes: 'Hot shot/expedited uses different equipment and pricing'
  },

  // === NOT LOAD REQUESTS - INDUSTRY SPECIFIC ===
  {
    id: 'not-load-1',
    category: 'Not a Load',
    description: 'Carrier capacity inquiry',
    businessContext: 'Carriers often reach out to brokers about available loads',
    email: {
      subject: 'Truck available in Chicago',
      from: 'dispatch@carriercompany.com',
      content: `Good morning,

I have a driver delivering in Chicago tomorrow morning.
Looking for a load out going anywhere south or west.

53' dry van
Up to 45,000 lbs
Driver has hazmat and TWIC
Prefer 500+ mile loads

Please let me know what you have available.

Thanks,
Mike - ABC Transport`
    },
    expectedAction: 'ignore',
    expectedFreightType: undefined,
    expectedIssues: [],
    industryNotes: 'Carrier capacity emails are common but not load requests'
  },

  {
    id: 'not-load-2',
    category: 'Not a Load',
    description: 'Detention dispute',
    businessContext: 'Detention charges are common source of disputes',
    email: {
      subject: 'RE: Load #12345 - Detention Invoice',
      from: 'billing@trucking.com',
      content: `Regarding load #12345 from last week:

Driver waited 6 hours at delivery (arrived 8am, unloaded 2pm)
According to our agreement, 2 hours free time

Please approve 4 hours detention @ $75/hour = $300
POD and time stamps attached

This needs to be added to our settlement.`
    },
    expectedAction: 'ignore',
    expectedFreightType: undefined,
    expectedIssues: [],
    industryNotes: 'Detention disputes require documentation review'
  },

  {
    id: 'not-load-3',
    category: 'Not a Load',
    description: 'Annual contract RFP',
    businessContext: 'Large shippers often do annual bids for contract rates',
    email: {
      subject: 'RFP - 2024 Transportation Contract',
      from: 'procurement@bigshipper.com',
      content: `Annual Transportation RFP

We are accepting bids for our 2024 transportation contract:
- 500+ annual loads
- Primary lanes: Chicago-Dallas, Atlanta-Miami, LA-Seattle
- Mix of dry van and reefer
- Dedicated capacity preferred

Please download the full RFP package from our portal.
Bids due by month end.

This is not an immediate load - contract starts January 1.`
    },
    expectedAction: 'ignore',
    expectedFreightType: undefined,
    expectedIssues: [],
    industryNotes: 'Contract RFPs are strategic opportunities, not spot loads'
  }
]