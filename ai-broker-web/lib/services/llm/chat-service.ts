// --------------------------- chat-service.ts ----------------------------
/**
 * AI-Broker MVP · LLM Chat Service (OpenAI GPT-4)
 * 
 * OVERVIEW:
 * Manages LLM-based chat interactions for load-specific conversations.
 * Provides database context awareness and tool orchestration capabilities.
 * 
 * WORKFLOW:
 * 1. Receives broker messages with load context
 * 2. Queries database for relevant load information
 * 3. Constructs context-aware prompts with system instructions
 * 4. Manages conversation history and generates AI responses
 * 5. Orchestrates agent/tool usage for automation tasks
 * 
 * BUSINESS LOGIC:
 * - Load-specific context awareness for accurate responses
 * - Access to database for real-time information
 * - Tool/agent orchestration for freight brokerage automation
 * - Confidence scoring for human-in-the-loop decisions
 * 
 * TECHNICAL ARCHITECTURE:
 * - OpenAI GPT-4 for language understanding
 * - Prisma for database access
 * - Function calling for tool orchestration
 * - Streaming responses for better UX
 * 
 * DEPENDENCIES:
 * - OPENAI_API_KEY environment variable
 * - Prisma client for database access
 * - Load context and conversation history
 */

import prisma from '@/lib/prisma'
import OpenAI from 'openai'
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat'

// Initialize OpenAI with error checking
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.error('OPENAI_API_KEY is not set in environment variables')
}

const openai = new OpenAI({
  apiKey: apiKey || 'missing-api-key',
})

export interface LoadContext {
  loadId: string
  brokerId: string
  load: any
  recentCommunications?: any[]
  quotes?: any[]
  carriers?: any[]
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: any
}

export class LLMChatService {
  private model = 'gpt-4o-mini' // Using the model from .env.local
  
  /**
   * Available tools/functions the LLM can call
   */
  private tools: ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'query_database',
        description: 'Query the database for load, carrier, quote, or other freight brokerage data',
        parameters: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              enum: ['loads', 'carriers', 'quotes', 'communications', 'load_blasts'],
              description: 'The database table to query'
            },
            filters: {
              type: 'object',
              description: 'Filter conditions for the query'
            },
            select: {
              type: 'array',
              items: { type: 'string' },
              description: 'Fields to select from the table'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of records to return'
            }
          },
          required: ['table']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_load_status',
        description: 'Update the status of a load',
        parameters: {
          type: 'object',
          properties: {
            loadId: { type: 'string' },
            status: { 
              type: 'string',
              enum: ['NEW_RFQ', 'QUOTED', 'BOOKED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED']
            },
            notes: { type: 'string' }
          },
          required: ['loadId', 'status']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'send_quote',
        description: 'Send a quote to a shipper for a load',
        parameters: {
          type: 'object',
          properties: {
            loadId: { type: 'string' },
            rate: { type: 'number' },
            notes: { type: 'string' }
          },
          required: ['loadId', 'rate']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_carriers',
        description: 'Search for carriers based on equipment type and service areas',
        parameters: {
          type: 'object',
          properties: {
            equipmentType: { type: 'string' },
            originZip: { type: 'string' },
            destZip: { type: 'string' },
            limit: { type: 'number' }
          },
          required: ['equipmentType']
        }
      }
    }
  ]

  /**
   * Generate system prompt with load context
   */
  private generateSystemPrompt(context: LoadContext): string {
    return `You are an AI freight broker assistant helping manage load ${context.load?.loadNumber || context.loadId}.

Current Load Information:
- Shipper: ${context.load?.shipperName || 'Unknown'}
- Origin: ${context.load?.originZip || 'Unknown'}
- Destination: ${context.load?.destZip || 'Unknown'}
- Pickup Date: ${context.load?.pickupDt ? new Date(context.load.pickupDt).toLocaleDateString() : 'Unknown'}
- Equipment: ${context.load?.equipment || 'Unknown'}
- Weight: ${context.load?.weightLb ? `${context.load.weightLb} lbs` : 'Unknown'}
- Status: ${context.load?.status || 'Unknown'}
- Commodity: ${context.load?.commodity || 'General Freight'}

Your role is to:
1. Help the broker manage this specific load efficiently
2. Provide accurate information from the database when needed
3. Suggest appropriate actions based on the load's current status
4. Maintain professional communication standards
5. Flag any decisions that require human approval (confidence < 85%)

When making recommendations:
- Always explain your reasoning
- Provide confidence levels for important decisions
- Suggest next best actions based on load status
- Use industry-standard freight brokerage terminology

You have access to query the database and perform certain actions. Always verify current information before making recommendations.`
  }

  /**
   * Process a chat message and generate AI response
   */
  async processMessage(
    message: string,
    context: LoadContext,
    conversationHistory: ChatMessage[] = []
  ): Promise<{
    response: string
    confidence: number
    suggestedActions?: any[]
    toolCalls?: any[]
  }> {
    try {
      // Load full context from database
      const fullContext = await this.loadFullContext(context)
      
      // Construct messages for OpenAI
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: this.generateSystemPrompt(fullContext)
        },
        ...conversationHistory.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        })),
        {
          role: 'user',
          content: message
        }
      ]

      // Call OpenAI with tools
      console.log('Calling OpenAI with model:', this.model)
      console.log('Messages count:', messages.length)
      
      const completion = await openai.chat.completions.create({
        model: this.model,
        messages,
        tools: this.tools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 1000
      })

      console.log('OpenAI response received:', completion.choices[0])
      
      const responseMessage = completion.choices[0].message
      let finalResponse = responseMessage.content || 'I apologize, but I was unable to generate a response.'
      const toolCalls: any[] = []

      // Handle tool calls if any
      if (responseMessage.tool_calls) {
        for (const toolCall of responseMessage.tool_calls) {
          const result = await this.executeToolCall(toolCall, context)
          toolCalls.push({
            tool: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments),
            result
          })

          // Add tool results to conversation and get final response
          messages.push(responseMessage)
          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: toolCall.id
          })
        }

        // Get final response after tool calls
        const finalCompletion = await openai.chat.completions.create({
          model: this.model,
          messages,
          temperature: 0.7,
          max_tokens: 1000
        })

        finalResponse = finalCompletion.choices[0].message.content || 'I apologize, but I was unable to generate a response.'
      }

      // Calculate confidence based on response content
      const confidence = this.calculateConfidence(finalResponse, toolCalls)

      // Extract suggested actions from response
      const suggestedActions = this.extractSuggestedActions(finalResponse)

      return {
        response: finalResponse,
        confidence,
        suggestedActions,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      }
    } catch (error) {
      console.error('Error processing LLM message:', error)
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Failed to process message')
    }
  }

  /**
   * Load full context from database
   */
  private async loadFullContext(context: LoadContext): Promise<LoadContext> {
    const [load, recentCommunications, quotes, carriers] = await Promise.all([
      // Get full load details
      prisma.load.findUnique({
        where: { id: context.loadId }
      }),
      
      // Get recent communications
      prisma.communication.findMany({
        where: { loadId: context.loadId },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      
      // Get quotes for this load
      prisma.quote.findMany({
        where: { loadId: context.loadId },
        orderBy: { createdAt: 'desc' }
      }),
      
      // Get potential carriers (if load has equipment type)
      context.load?.equipment ? 
        prisma.carrier.findMany({
          where: {
            equipmentTypes: { has: context.load.equipment },
            status: 'ACTIVE'
          },
          take: 5
        }) : []
    ])

    return {
      ...context,
      load: load || context.load,
      recentCommunications,
      quotes,
      carriers
    }
  }

  /**
   * Execute a tool call from the LLM
   */
  private async executeToolCall(toolCall: any, context: LoadContext): Promise<any> {
    const { name, arguments: args } = toolCall.function
    const parsedArgs = JSON.parse(args)

    switch (name) {
      case 'query_database':
        return this.queryDatabase(parsedArgs)
      
      case 'update_load_status':
        return this.updateLoadStatus(parsedArgs)
      
      case 'send_quote':
        return this.sendQuote(parsedArgs, context)
      
      case 'search_carriers':
        return this.searchCarriers(parsedArgs)
      
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }

  /**
   * Query database tool implementation
   */
  private async queryDatabase(args: any): Promise<any> {
    const { table, filters = {}, select = [], limit = 10 } = args

    try {
      // Map table names to Prisma models
      const modelMap: any = {
        loads: prisma.load,
        carriers: prisma.carrier,
        quotes: prisma.quote,
        communications: prisma.communication,
        load_blasts: prisma.loadBlast
      }

      const model = modelMap[table]
      if (!model) {
        throw new Error(`Invalid table: ${table}`)
      }

      // Build query
      const query: any = {
        where: filters,
        take: limit
      }

      if (select.length > 0) {
        query.select = select.reduce((acc: any, field: string) => {
          acc[field] = true
          return acc
        }, {})
      }

      const results = await model.findMany(query)
      return {
        success: true,
        count: results.length,
        data: results
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query failed'
      }
    }
  }

  /**
   * Update load status tool implementation
   */
  private async updateLoadStatus(args: any): Promise<any> {
    const { loadId, status, notes } = args

    try {
      const updated = await prisma.load.update({
        where: { id: loadId },
        data: {
          status,
          aiNotes: notes,
          updatedAt: new Date()
        }
      })

      return {
        success: true,
        message: `Load status updated to ${status}`,
        load: updated
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Update failed'
      }
    }
  }

  /**
   * Send quote tool implementation (mock for now)
   */
  private async sendQuote(args: any, context: LoadContext): Promise<any> {
    const { loadId, rate, notes } = args

    // In production, this would integrate with email/communication services
    return {
      success: true,
      message: `Quote of $${rate} prepared for load ${loadId}`,
      action_required: 'Broker approval needed before sending',
      confidence: 0.75
    }
  }

  /**
   * Search carriers tool implementation
   */
  private async searchCarriers(args: any): Promise<any> {
    const { equipmentType, originZip, destZip, limit = 10 } = args

    try {
      const carriers = await prisma.carrier.findMany({
        where: {
          equipmentTypes: { has: equipmentType },
          status: 'ACTIVE'
        },
        orderBy: [
          { preferenceTier: 'asc' },
          { loadsCompleted: 'desc' }
        ],
        take: limit
      })

      return {
        success: true,
        count: carriers.length,
        carriers: carriers.map(c => ({
          id: c.id,
          name: c.carrierName,
          email: c.contactEmail,
          phone: c.contactPhone,
          equipment: c.equipmentTypes,
          tier: c.preferenceTier,
          loadsCompleted: c.loadsCompleted
        }))
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed'
      }
    }
  }

  /**
   * Calculate confidence score based on response
   */
  private calculateConfidence(response: string, toolCalls: any[]): number {
    // Base confidence
    let confidence = 0.85

    // Adjust based on response characteristics
    if (response.includes('I recommend') || response.includes('I suggest')) {
      confidence -= 0.1
    }
    if (response.includes('need your approval') || response.includes('requires human')) {
      confidence -= 0.15
    }
    if (response.includes('I\'m confident') || response.includes('definitely')) {
      confidence += 0.1
    }

    // Adjust based on tool usage
    if (toolCalls.length > 0) {
      confidence += 0.05 * toolCalls.filter(tc => tc.result?.success).length
    }

    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, confidence))
  }

  /**
   * Extract suggested actions from response
   */
  private extractSuggestedActions(response: string): any[] {
    const actions = []

    // Simple pattern matching for common actions
    if (response.includes('send') && response.includes('quote')) {
      actions.push({ type: 'send_quote', description: 'Send quote to shipper' })
    }
    if (response.includes('contact') && response.includes('carrier')) {
      actions.push({ type: 'contact_carrier', description: 'Contact carriers for capacity' })
    }
    if (response.includes('update') && response.includes('status')) {
      actions.push({ type: 'update_status', description: 'Update load status' })
    }

    return actions
  }
}

// Export singleton instance
export const chatService = new LLMChatService()