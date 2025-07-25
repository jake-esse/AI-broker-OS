import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if user is authenticated
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get broker
    const broker = await prisma.broker.findFirst({
      where: { userId: user.id }
    })

    if (!broker) {
      return NextResponse.json(
        { error: 'Broker not found' },
        { status: 404 }
      )
    }

    // Get the specific load
    const load = await prisma.load.findFirst({
      where: {
        id: params.id,
        brokerId: broker.id
      }
    })

    if (!load) {
      return NextResponse.json(
        { error: 'Load not found' },
        { status: 404 }
      )
    }

    // Transform the load data to match the expected format
    const transformedLoad = {
      id: load.id,
      shipper_name: load.shipperName || load.shipperEmail || 'Unknown Shipper',
      shipper_email: load.shipperEmail,
      status: load.status,
      created_at: load.createdAt.toISOString(),
      notifications_count: 0, // TODO: Calculate from actual notifications
      requires_action: load.requiresHumanReview || false,
      origin_city: extractCity(load.originZip),
      origin_state: extractState(load.originZip),
      origin_zip: load.originZip,
      dest_city: extractCity(load.destZip),
      dest_state: extractState(load.destZip),
      dest_zip: load.destZip,
      reference_number: load.loadNumber,
      equipment: load.equipment,
      weight: load.weightLb,
      pickup_date: load.pickupDt.toISOString(),
      commodity: load.commodity,
      rate_per_mile: load.ratePerMile?.toNumber(),
      total_miles: load.totalMiles,
      special_requirements: extractSpecialRequirements(load.aiNotes),
      raw_email_text: load.rawEmailText,
      ai_notes: load.aiNotes
    }

    return NextResponse.json({ 
      load: transformedLoad 
    })
  } catch (error: any) {
    console.error('Error fetching load:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch load' },
      { status: 500 }
    )
  }
}

// Helper functions to extract city/state from zip
// In a real app, you'd use a zip code database
function extractCity(zip: string): string {
  const zipMap: { [key: string]: string } = {
    '60601': 'Chicago',
    '10001': 'New York',
    // Add more as needed
  }
  return zipMap[zip] || 'Unknown City'
}

function extractState(zip: string): string {
  const stateMap: { [key: string]: string } = {
    '60601': 'IL',
    '10001': 'NY',
    // Add more as needed
  }
  return stateMap[zip] || 'XX'
}

function extractSpecialRequirements(aiNotes: string | null): string | undefined {
  if (!aiNotes) return undefined
  
  try {
    const notes = JSON.parse(aiNotes)
    return notes.special_requirements
  } catch {
    return undefined
  }
}