import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import { ClarificationResponseHandler } from '@/lib/agents/clarification-response-handler'
import prisma from '@/lib/prisma'

export async function GET() {
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

    // Get statistics
    const stats = await ClarificationResponseHandler.getStatistics(broker.id)

    // Get recent clarification requests
    const recentRequests = await prisma.clarificationRequest.findMany({
      where: { brokerId: broker.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        shipperEmail: true,
        freightType: true,
        missingFields: true,
        responseReceived: true,
        loadCreated: true,
        sentAt: true,
        responseReceivedAt: true,
        createdAt: true
      }
    })

    // Calculate conversion rate
    const conversionRate = stats.responded > 0 
      ? (stats.converted / stats.responded * 100).toFixed(1)
      : '0'

    return NextResponse.json({
      statistics: {
        ...stats,
        conversionRate: `${conversionRate}%`,
        averageResponseTimeMinutes: stats.averageResponseTime 
          ? Math.round(stats.averageResponseTime / 1000 / 60)
          : null
      },
      recentRequests: recentRequests.map(req => ({
        ...req,
        responseTime: req.responseReceivedAt && req.sentAt
          ? Math.round((req.responseReceivedAt.getTime() - req.sentAt.getTime()) / 1000 / 60)
          : null
      }))
    })
  } catch (error: any) {
    console.error('Error fetching clarification stats:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch statistics' },
      { status: 500 }
    )
  }
}