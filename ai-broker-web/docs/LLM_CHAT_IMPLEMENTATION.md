# LLM Chat Implementation Guide

## Overview

The AI-Broker platform now includes LLM-based chat functionality for load-specific conversations. This allows brokers to interact with an AI assistant that has full context awareness and database access for each load.

## Architecture

### Components

1. **LLM Chat Service** (`lib/services/llm/chat-service.ts`)
   - Manages OpenAI GPT-4 integration
   - Handles tool/function calling for database queries
   - Processes messages with load context
   - Calculates confidence scores

2. **Context Manager** (`lib/services/llm/context-manager.ts`)
   - Manages conversation history
   - Loads relevant load data
   - Formats context for LLM
   - Persists chat messages

3. **API Endpoints**
   - `POST /api/chat/[loadId]` - Send message to LLM
   - `GET /api/chat/[loadId]` - Get chat history and summary
   - `GET /api/chat/[loadId]/messages` - Get paginated messages

4. **Frontend Integration**
   - Updated `ChatInterface` component
   - Real-time message updates
   - Confidence indicators
   - Tool usage display

## Features

### 1. Load Context Awareness
The AI assistant has access to:
- Load details (origin, destination, equipment, weight, etc.)
- Recent communications
- Quotes and carrier information
- Load status and history

### 2. Database Access Tools
The LLM can execute these functions:
- `query_database` - Query any table with filters
- `update_load_status` - Update load status
- `send_quote` - Prepare quotes (requires approval)
- `search_carriers` - Find available carriers

### 3. Confidence Scoring
- High confidence (>85%): Fully automated responses
- Medium confidence (60-85%): Proceed with notification
- Low confidence (<60%): Require human approval

### 4. Human-in-the-Loop
- Visual confidence indicators
- Action required notifications
- Suggested actions for quick responses
- Escalation for complex decisions

## Setup

### Environment Variables
```bash
# Required in .env.local
OPENAI_API_KEY=your-openai-api-key
```

### Database Setup
The chat functionality uses these tables:
- `chat_messages` - Stores conversation history
- `notifications` - Action required alerts

### Seeding Test Data
Run the seed script to create sample conversations:
```bash
cd ai-broker-web
npx tsx scripts/seed-chat-messages.ts
```

## Usage

### Basic Chat Flow
1. Broker opens a load detail page
2. Types a message in the chat interface
3. LLM processes with full load context
4. Response includes confidence score and any tool usage
5. Low confidence responses trigger notifications

### Example Interactions

**Broker**: "What are the current market rates for this lane?"
**AI**: Queries database, analyzes rates, provides recommendation with confidence score

**Broker**: "Send a quote for $2,500"
**AI**: Prepares quote, but requires approval (confidence < 85%)

**Broker**: "Find me the best carriers for this load"
**AI**: Searches carriers, ranks by performance, provides recommendations

## System Prompts

The AI assistant is configured with:
- Load-specific context (origin, destination, dates, etc.)
- Freight brokerage expertise
- Professional communication standards
- Confidence-based decision making

## Testing

### Manual Testing
1. Create or use existing load
2. Navigate to `/loads/[loadId]`
3. Send test messages
4. Verify AI responses and tool usage

### API Testing
```bash
# Get chat history
curl http://localhost:3000/api/chat/[loadId] \
  -H "Cookie: your-auth-cookie"

# Send message
curl -X POST http://localhost:3000/api/chat/[loadId] \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{"message": "What is the status of this load?"}'
```

## Extending the System

### Adding New Tools
1. Add tool definition in `chat-service.ts`
2. Implement tool execution logic
3. Update system prompts if needed

### Custom Prompts
Modify `generateSystemPrompt()` in `chat-service.ts` to customize AI behavior

### Adding Agent Integration
The chat service can orchestrate other agents:
- Intake Agent for processing new information
- LoadBlast Agent for carrier outreach
- QuoteCollector for managing responses

## Security Considerations

- All database queries are scoped to broker's loads
- Authentication required for all endpoints
- Sensitive operations require high confidence
- Audit trail maintained in chat history

## Performance

- Messages cached in frontend
- Polling for real-time updates (5s interval)
- Database queries optimized with indexes
- Context window limited to recent messages

## Future Enhancements

1. **Streaming Responses**: Implement SSE for real-time typing
2. **Voice Integration**: Add speech-to-text capabilities
3. **Multi-Modal**: Support image uploads (BOL, POD)
4. **Advanced Analytics**: Track AI performance metrics
5. **Custom Training**: Fine-tune on broker-specific data