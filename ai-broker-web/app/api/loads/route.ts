import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get broker
    const broker = await prisma.broker.findFirst({
      where: { userId: user.id }
    })

    if (!broker) {
      return NextResponse.json({ loads: [] })
    }

    // Get loads for this broker
    const loads = await prisma.load.findMany({
      where: { brokerId: broker.id },
      orderBy: { createdAt: 'desc' }
    })

    // Transform to match expected format
    const transformedLoads = loads.map(load => ({
      id: load.id,
      shipper_name: load.shipperName || load.shipperEmail || 'Unknown Shipper',
      status: load.status,
      created_at: load.createdAt.toISOString(),
      notifications_count: 0,
      requires_action: load.requiresHumanReview || load.status === 'NEW_RFQ' || false,
      origin_city: extractCity(load.originZip),
      origin_state: extractState(load.originZip),
      dest_city: extractCity(load.destZip),
      dest_state: extractState(load.destZip),
      reference_number: load.loadNumber,
      // Additional fields from schema
      equipment: load.equipment,
      weight: load.weightLb,
      pickup_date: load.pickupDt.toISOString(),
      commodity: load.commodity,
      rate_per_mile: load.ratePerMile
    }))

    return NextResponse.json({ loads: transformedLoads })
  } catch (error) {
    console.error('Error fetching loads:', error)
    return NextResponse.json({ error: 'Failed to fetch loads' }, { status: 500 })
  }
}

// Helper functions to extract city/state from zip
// In a real app, you'd use a zip code database
function extractCity(zip: string): string {
  const zipMap: { [key: string]: string } = {
    '60601': 'Chicago',
    '10001': 'New York',
    '00000': 'Unknown',
    // Add more as needed
  }
  return zipMap[zip] || zip
}

function extractState(zip: string): string {
  const stateMap: { [key: string]: string } = {
    '60601': 'IL',
    '10001': 'NY',
    '00000': 'XX',
    // Add more as needed
  }
  return stateMap[zip] || 'XX'
}