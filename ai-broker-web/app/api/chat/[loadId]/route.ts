// --------------------------- route.ts ----------------------------
/**
 * AI-Broker MVP · Chat API Endpoint (Load-Specific Conversations)
 * 
 * OVERVIEW:
 * REST API endpoint for handling load-specific chat interactions.
 * Processes broker messages, manages LLM conversations, and handles tool orchestration.
 * 
 * WORKFLOW:
 * 1. Authenticate broker and verify load access
 * 2. Retrieve conversation context and history
 * 3. Process message through LLM with database context
 * 4. Execute any tool calls requested by LLM
 * 5. Store conversation and return response
 * 
 * BUSINESS LOGIC:
 * - Load-specific access control
 * - Conversation persistence for audit trail
 * - Tool execution with approval workflows
 * - Confidence-based human escalation
 * 
 * TECHNICAL ARCHITECTURE:
 * - Next.js App Router API routes
 * - Authentication via session
 * - LLM service integration
 * - Streaming response support
 * 
 * DEPENDENCIES:
 * - Authentication middleware
 * - LLM chat service
 * - Context manager
 * - Prisma client
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import { chatService } from '@/lib/services/llm/chat-service'
import { contextManager } from '@/lib/services/llm/context-manager'
import prisma from '@/lib/prisma'

// GET /api/chat/[loadId] - Get chat history
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

    // Get conversation history
    const messages = await prisma.chatMessage.findMany({
      where: {
        loadId,
        brokerId: broker.id
      },
      orderBy: { createdAt: 'asc' }
    })

    // Get conversation summary
    const summary = await contextManager.getConversationSummary(loadId, broker.id)

    return NextResponse.json({
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        metadata: msg.metadata
      })),
      summary
    })
  } catch (error) {
    console.error('Error fetching chat history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chat history' },
      { status: 500 }
    )
  }
}

// POST /api/chat/[loadId] - Send message to LLM
export async function POST(
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

    // Parse request body
    const { message } = await request.json()
    
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 })
    }

    // Load conversation context
    const context = await contextManager.loadConversationContext(loadId, broker.id)
    
    // Format conversation history for LLM
    const { messages: conversationHistory } = contextManager.formatContextForLLM(context)
    
    // Process message through LLM
    const llmResponse = await chatService.processMessage(
      message,
      {
        loadId,
        brokerId: broker.id,
        load: context.loadData
      },
      conversationHistory.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      }))
    )

    // Save conversation turn
    const { userMessageId, aiMessageId } = await contextManager.saveConversationTurn(
      loadId,
      broker.id,
      message,
      {
        content: llmResponse.response,
        confidence: llmResponse.confidence,
        toolCalls: llmResponse.toolCalls,
        suggestedActions: llmResponse.suggestedActions
      }
    )

    // Return response
    return NextResponse.json({
      userMessage: {
        id: userMessageId,
        role: 'user',
        content: message,
        createdAt: new Date()
      },
      aiMessage: {
        id: aiMessageId,
        role: 'assistant',
        content: llmResponse.response,
        createdAt: new Date(),
        metadata: {
          confidence: llmResponse.confidence,
          toolCalls: llmResponse.toolCalls,
          suggestedActions: llmResponse.suggestedActions
        }
      },
      requiresAction: llmResponse.confidence < 0.85
    })
  } catch (error) {
    console.error('Error processing chat message:', error)
    // Return more detailed error in development
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? error instanceof Error ? error.message : 'Unknown error'
      : 'Failed to process message'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

// DELETE /api/chat/[loadId] - Clear chat history (optional)
export async function DELETE(
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

    // Delete chat messages for this load
    await prisma.chatMessage.deleteMany({
      where: {
        loadId,
        brokerId: broker.id
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error clearing chat history:', error)
    return NextResponse.json(
      { error: 'Failed to clear chat history' },
      { status: 500 }
    )
  }
}