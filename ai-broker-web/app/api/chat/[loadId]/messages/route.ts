// --------------------------- messages/route.ts ----------------------------
/**
 * AI-Broker MVP · Chat Messages API Endpoint
 * 
 * OVERVIEW:
 * Dedicated endpoint for fetching chat messages with pagination and real-time updates.
 * Supports streaming and polling for new messages.
 * 
 * WORKFLOW:
 * 1. Authenticate broker and verify load access
 * 2. Fetch messages with optional pagination
 * 3. Support real-time updates via polling
 * 4. Return formatted messages with metadata
 * 
 * BUSINESS LOGIC:
 * - Message retrieval with proper access control
 * - Pagination for performance
 * - Real-time update support
 * - Metadata inclusion for UI features
 * 
 * TECHNICAL ARCHITECTURE:
 * - RESTful API with pagination
 * - Efficient database queries
 * - Supports polling for real-time feel
 * - JSON response format
 * 
 * DEPENDENCIES:
 * - Authentication
 * - Prisma client
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'

// GET /api/chat/[loadId]/messages - Get paginated messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ loadId: string }> }
) {
  try {
    // Authenticate user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get broker ID from user
    const broker = await prisma.broker.findFirst({
      where: { userId: user.id }
    })
    
    if (!broker) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    const { loadId } = await params

    // Verify broker has access to this load
    const load = await prisma.load.findFirst({
      where: {
        id: loadId,
        brokerId: broker.id
      }
    })

    if (!load) {
      return NextResponse.json({ error: 'Load not found or access denied' }, { status: 404 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const cursor = searchParams.get('cursor') // For pagination
    const since = searchParams.get('since') // For polling new messages

    // Build query
    const where: any = {
      loadId,
      brokerId: broker.id
    }

    if (cursor) {
      where.id = { gt: cursor }
    }

    if (since) {
      where.createdAt = { gt: new Date(since) }
    }

    // Fetch messages
    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit
    })

    // Format response
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
      metadata: msg.metadata,
      // Extract specific metadata fields for easier frontend use
      confidence: (msg.metadata as any)?.confidence,
      toolCalls: (msg.metadata as any)?.toolCalls,
      suggestedActions: (msg.metadata as any)?.suggestedActions
    }))

    // Get next cursor if there are more messages
    const lastMessage = messages[messages.length - 1]
    const hasMore = messages.length === limit

    return NextResponse.json({
      messages: formattedMessages,
      pagination: {
        cursor: lastMessage?.id,
        hasMore
      },
      load: {
        id: load.id,
        loadNumber: load.loadNumber,
        status: load.status,
        shipperName: load.shipperName,
        originZip: load.originZip,
        destZip: load.destZip
      }
    })
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}