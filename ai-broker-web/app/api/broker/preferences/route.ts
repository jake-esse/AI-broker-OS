import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'

// GET /api/broker/preferences - Get broker preferences
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const broker = await prisma.broker.findFirst({
      where: { userId: user.id },
      select: { preferences: true }
    })

    if (!broker) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    return NextResponse.json({ preferences: broker.preferences })
  } catch (error) {
    console.error('Error fetching broker preferences:', error)
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    )
  }
}

// PUT /api/broker/preferences - Update broker preferences
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const broker = await prisma.broker.findFirst({
      where: { userId: user.id }
    })

    if (!broker) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    const body = await request.json()
    const { postToDAT, preferredCarriers, confidenceThresholds } = body

    // Get existing preferences
    const existingPreferences = broker.preferences as any || {}

    // Merge new preferences with existing ones
    const updatedPreferences = {
      ...existingPreferences,
      postToDAT: postToDAT ?? existingPreferences.postToDAT,
      preferredCarriers: preferredCarriers ?? existingPreferences.preferredCarriers,
      confidenceThresholds: confidenceThresholds ?? existingPreferences.confidenceThresholds,
      // Preserve other existing preferences
      defaultMarginPercent: existingPreferences.defaultMarginPercent,
      autoQuoteEnabled: existingPreferences.autoQuoteEnabled
    }

    // Update broker preferences
    await prisma.broker.update({
      where: { id: broker.id },
      data: {
        preferences: updatedPreferences
      }
    })

    return NextResponse.json({ 
      success: true, 
      preferences: updatedPreferences 
    })
  } catch (error) {
    console.error('Error updating broker preferences:', error)
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    )
  }
}