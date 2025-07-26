// --------------------------- context-manager.ts ----------------------------
/**
 * AI-Broker MVP · Load Context Manager (Chat Conversations)
 * 
 * OVERVIEW:
 * Manages conversation context and history for load-specific chats.
 * Maintains state, retrieves relevant data, and formats context for LLM.
 * 
 * WORKFLOW:
 * 1. Load conversation history from database
 * 2. Retrieve relevant load data and relationships
 * 3. Format context for LLM consumption
 * 4. Store new messages and maintain conversation state
 * 5. Track confidence scores and human interventions
 * 
 * BUSINESS LOGIC:
 * - Conversation persistence for audit trail
 * - Context window management for LLM efficiency
 * - Relevant data retrieval based on conversation topic
 * - Human-in-the-loop tracking and escalation
 * 
 * TECHNICAL ARCHITECTURE:
 * - Prisma for database operations
 * - Efficient context windowing
 * - Message role management
 * - Metadata tracking for analytics
 * 
 * DEPENDENCIES:
 * - Prisma client for database access
 * - ChatMessage model for conversation storage
 */

import prisma from '@/lib/prisma'

export interface ConversationContext {
  loadId: string
  brokerId: string
  messages: ChatMessageWithContext[]
  loadData: any
  relatedData: {
    quotes?: any[]
    carriers?: any[]
    communications?: any[]
    loadBlasts?: any[]
  }
  metadata: {
    totalMessages: number
    lastActivity: Date
    requiresAction: boolean
    confidenceScores: number[]
  }
}

export interface ChatMessageWithContext {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: Date
  metadata?: any
  confidence?: number
  toolCalls?: any[]
}

export class LoadContextManager {
  private maxContextMessages = 20 // Maximum messages to include in context
  
  /**
   * Load full conversation context for a load
   */
  async loadConversationContext(
    loadId: string,
    brokerId: string,
    includeRelatedData = true
  ): Promise<ConversationContext> {
    // Get conversation messages
    const messages = await this.getConversationHistory(loadId, brokerId)
    
    // Get load data
    const loadData = await prisma.load.findUnique({
      where: { id: loadId }
    })
    
    if (!loadData) {
      throw new Error('Load not found')
    }
    
    // Get related data if requested
    const relatedData: any = {}
    if (includeRelatedData) {
      const [quotes, communications, loadBlasts] = await Promise.all([
        prisma.quote.findMany({
          where: { loadId },
          orderBy: { createdAt: 'desc' },
          take: 5
        }),
        prisma.communication.findMany({
          where: { loadId },
          orderBy: { createdAt: 'desc' },
          take: 10
        }),
        prisma.loadBlast.findMany({
          where: { loadId },
          orderBy: { createdAt: 'desc' },
          take: 5
        })
      ])
      
      relatedData.quotes = quotes
      relatedData.communications = communications
      relatedData.loadBlasts = loadBlasts
      
      // Get carriers if we have quotes
      if (quotes.length > 0) {
        const carrierIds = quotes
          .map(q => q.carrierId)
          .filter(id => id !== null) as string[]
        
        if (carrierIds.length > 0) {
          relatedData.carriers = await prisma.carrier.findMany({
            where: { id: { in: carrierIds } }
          })
        }
      }
    }
    
    // Calculate metadata
    const metadata = this.calculateMetadata(messages)
    
    return {
      loadId,
      brokerId,
      messages,
      loadData,
      relatedData,
      metadata
    }
  }
  
  /**
   * Get conversation history with proper formatting
   */
  private async getConversationHistory(
    loadId: string,
    brokerId: string
  ): Promise<ChatMessageWithContext[]> {
    const dbMessages = await prisma.chatMessage.findMany({
      where: {
        loadId,
        brokerId
      },
      orderBy: { createdAt: 'asc' },
      take: this.maxContextMessages * -1 // Get last N messages
    })
    
    return dbMessages.map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      createdAt: msg.createdAt,
      metadata: msg.metadata as any,
      confidence: msg.metadata ? (msg.metadata as any).confidence : undefined,
      toolCalls: msg.metadata ? (msg.metadata as any).toolCalls : undefined
    }))
  }
  
  /**
   * Save a new message to the conversation
   */
  async saveMessage(
    loadId: string,
    brokerId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: any
  ): Promise<string> {
    const message = await prisma.chatMessage.create({
      data: {
        loadId,
        brokerId,
        role,
        content,
        metadata: metadata || {}
      }
    })
    
    return message.id
  }
  
  /**
   * Save user message and AI response together
   */
  async saveConversationTurn(
    loadId: string,
    brokerId: string,
    userMessage: string,
    aiResponse: {
      content: string
      confidence: number
      toolCalls?: any[]
      suggestedActions?: any[]
    }
  ): Promise<{
    userMessageId: string
    aiMessageId: string
  }> {
    // Save user message
    const userMessageId = await this.saveMessage(
      loadId,
      brokerId,
      'user',
      userMessage
    )
    
    // Save AI response with metadata
    const aiMessageId = await this.saveMessage(
      loadId,
      brokerId,
      'assistant',
      aiResponse.content,
      {
        confidence: aiResponse.confidence,
        toolCalls: aiResponse.toolCalls,
        suggestedActions: aiResponse.suggestedActions
      }
    )
    
    // Update notification if action required
    if (aiResponse.confidence < 0.85) {
      await this.createActionRequiredNotification(loadId, brokerId, aiResponse)
    }
    
    return { userMessageId, aiMessageId }
  }
  
  /**
   * Get conversation summary for display
   */
  async getConversationSummary(loadId: string, brokerId: string): Promise<{
    totalMessages: number
    lastMessage?: string
    lastMessageTime?: Date
    requiresAction: boolean
    averageConfidence: number
  }> {
    const messages = await prisma.chatMessage.findMany({
      where: { loadId, brokerId },
      orderBy: { createdAt: 'desc' },
      take: 10
    })
    
    if (messages.length === 0) {
      return {
        totalMessages: 0,
        requiresAction: false,
        averageConfidence: 1
      }
    }
    
    const confidenceScores = messages
      .filter(m => m.role === 'assistant' && m.metadata)
      .map(m => (m.metadata as any).confidence || 1)
      .filter(c => c !== undefined)
    
    const averageConfidence = confidenceScores.length > 0
      ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
      : 1
    
    const requiresAction = messages.some(m => 
      m.role === 'assistant' && 
      m.metadata && 
      ((m.metadata as any).confidence || 1) < 0.85
    )
    
    return {
      totalMessages: await prisma.chatMessage.count({ where: { loadId, brokerId } }),
      lastMessage: messages[0]?.content,
      lastMessageTime: messages[0]?.createdAt,
      requiresAction,
      averageConfidence
    }
  }
  
  /**
   * Format context for LLM consumption
   */
  formatContextForLLM(context: ConversationContext): {
    messages: Array<{ role: string; content: string }>
    contextSummary: string
  } {
    // Format messages for LLM
    const messages = context.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))
    
    // Build context summary
    const contextSummary = this.buildContextSummary(context)
    
    return { messages, contextSummary }
  }
  
  /**
   * Build a summary of relevant context
   */
  private buildContextSummary(context: ConversationContext): string {
    const parts = []
    
    // Add quote information if available
    if (context.relatedData.quotes && context.relatedData.quotes.length > 0) {
      const latestQuote = context.relatedData.quotes[0]
      parts.push(`Latest quote: $${latestQuote.rate} from ${latestQuote.carrierName || 'Unknown Carrier'}`)
    }
    
    // Add communication summary
    if (context.relatedData.communications && context.relatedData.communications.length > 0) {
      parts.push(`${context.relatedData.communications.length} recent communications`)
    }
    
    // Add load blast status
    if (context.relatedData.loadBlasts && context.relatedData.loadBlasts.length > 0) {
      const activeBlasts = context.relatedData.loadBlasts.filter(lb => lb.blastStatus === 'SENT')
      if (activeBlasts.length > 0) {
        parts.push(`${activeBlasts.length} active load blasts`)
      }
    }
    
    return parts.length > 0 ? `Additional context: ${parts.join(', ')}` : ''
  }
  
  /**
   * Calculate conversation metadata
   */
  private calculateMetadata(messages: ChatMessageWithContext[]): ConversationContext['metadata'] {
    const confidenceScores = messages
      .filter(m => m.confidence !== undefined)
      .map(m => m.confidence!)
    
    const requiresAction = messages.some(m => 
      m.role === 'assistant' && 
      m.confidence !== undefined && 
      m.confidence < 0.85
    )
    
    return {
      totalMessages: messages.length,
      lastActivity: messages.length > 0 ? messages[messages.length - 1].createdAt : new Date(),
      requiresAction,
      confidenceScores
    }
  }
  
  /**
   * Create notification for action required
   */
  private async createActionRequiredNotification(
    loadId: string,
    brokerId: string,
    aiResponse: any
  ): Promise<void> {
    await prisma.notification.create({
      data: {
        brokerId,
        type: 'action_required',
        title: 'AI needs your input',
        message: `Low confidence decision (${Math.round(aiResponse.confidence * 100)}%) on load requires your review`,
        metadata: {
          loadId,
          confidence: aiResponse.confidence,
          suggestedActions: aiResponse.suggestedActions
        }
      }
    })
  }
}

// Export singleton instance
export const contextManager = new LoadContextManager()