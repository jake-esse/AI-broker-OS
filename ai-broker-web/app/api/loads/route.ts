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
      requires_action: load.status === 'QUOTED' || load.status === 'PENDING_CLARIFICATION',
      origin_city: load.originZip,
      origin_state: '', // We only have zip codes in the schema
      dest_city: load.destZip,
      dest_state: '',
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