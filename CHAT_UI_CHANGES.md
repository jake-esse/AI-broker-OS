# Chat-First UI Implementation Changes

## Overview
This document outlines all changes required to implement the chat-first UI design for AI-Broker, where freight brokers interact with an AI assistant through load-specific conversations.

## 1. Authentication Changes

### Frontend (New Implementation)
- **OAuth Login Flow**
  - `/app/auth/login/page.tsx` - OAuth provider selection (Gmail, Outlook)
  - `/app/auth/callback/page.tsx` - OAuth callback handler
  - `/lib/auth/oauth.ts` - OAuth configuration and helpers
  - Remove magic link authentication in favor of OAuth

### Backend Updates
- **Email Account Connection**
  - Update `email_account_connections` table to store OAuth tokens
  - Modify `src/services/email/oauth.py` to handle web-based OAuth flow
  - Create API endpoints for OAuth token refresh
  - Add webhook registration during OAuth flow

### Database Schema
- Add fields to `users` table:
  - `email_provider` (enum: gmail, outlook)
  - `oauth_refresh_token` (encrypted)
  - `oauth_access_token` (encrypted)
  - `oauth_expiry` (timestamp)

## 2. Web Application Structure

### New Pages/Routes
```
/app/
├── layout.tsx                 # Main layout with top nav
├── page.tsx                   # Loads table (homepage)
├── auth/
│   ├── login/page.tsx        # OAuth provider selection
│   └── callback/page.tsx     # OAuth callback handler
├── loads/
│   └── [id]/page.tsx         # Load-specific chat interface
├── dashboard/page.tsx         # KPI dashboard
├── settings/page.tsx          # Account & AI settings
└── api/
    ├── auth/                  # OAuth endpoints
    ├── loads/                 # Load management
    ├── chat/                  # Chat/AI interaction
    └── notifications/         # Real-time updates
```

### Components to Build
```
/components/
├── layout/
│   ├── TopNav.tsx            # Main navigation bar
│   └── NotificationBell.tsx  # Notification dropdown
├── loads/
│   ├── LoadsTable.tsx        # Main loads listing
│   ├── LoadRow.tsx           # Individual load row
│   └── LoadStatusBadge.tsx   # Status indicators
├── chat/
│   ├── ChatInterface.tsx     # Main chat container
│   ├── ChatMessage.tsx       # Individual messages
│   ├── ChatInput.tsx         # Message input box
│   ├── DocumentViewer.tsx    # Inline document display
│   └── ConfidenceIndicator.tsx # AI confidence display
├── timeline/
│   ├── LoadTimeline.tsx      # Milestone timeline
│   └── TimelineItem.tsx      # Individual milestones
├── dashboard/
│   ├── KPICard.tsx           # Metric display cards
│   ├── LoadChart.tsx         # Chart visualizations
│   └── PerformanceGauge.tsx  # Gauge components
└── settings/
    ├── EmailConnection.tsx    # Email account status
    ├── AIThresholds.tsx      # Confidence settings
    └── NotificationPrefs.tsx  # Alert preferences
```

## 3. Backend API Changes

### New API Endpoints
```python
# Load Management
GET    /api/loads              # List all loads
GET    /api/loads/:id          # Get load details
GET    /api/loads/:id/chat     # Get chat history
POST   /api/loads/:id/message  # Send message to AI

# AI Interaction
POST   /api/ai/command         # Process natural language command
GET    /api/ai/suggestions/:loadId  # Get AI suggestions
POST   /api/ai/feedback        # Provide feedback on AI decision

# Real-time
WS     /api/ws/loads           # WebSocket for load updates
WS     /api/ws/notifications   # WebSocket for notifications

# Dashboard
GET    /api/metrics/kpi        # Dashboard KPIs
GET    /api/metrics/trends     # Historical trends
```

### Database Schema Additions
```sql
-- Chat/conversation tracking
CREATE TABLE load_conversations (
    id UUID PRIMARY KEY,
    load_id UUID REFERENCES loads(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID REFERENCES load_conversations(id),
    sender_type ENUM('ai', 'broker', 'shipper', 'carrier', 'system'),
    sender_id TEXT,
    message TEXT,
    confidence_score FLOAT,
    requires_response BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI decision tracking
CREATE TABLE ai_decisions (
    id UUID PRIMARY KEY,
    load_id UUID REFERENCES loads(id),
    decision_type TEXT,
    confidence_score FLOAT,
    decision_data JSONB,
    human_override BOOLEAN DEFAULT FALSE,
    human_feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification tracking
CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    load_id UUID REFERENCES loads(id),
    type TEXT,
    message TEXT,
    read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 4. AI Agent Updates

### Conversation Agent (New)
Create `src/agents/conversation/agent.py`:
- Process natural language commands
- Maintain conversation context
- Route to appropriate action agents
- Generate contextual responses

### Update Existing Agents
- Add conversation integration to all agents
- Include confidence scoring in all decisions
- Add human escalation logic
- Generate chat-friendly status updates

### Confidence Framework
Create `src/services/confidence/scorer.py`:
- Standardized confidence calculation
- Threshold management
- Escalation rules engine
- Learning from feedback

## 5. Real-time Infrastructure

### WebSocket Implementation
- Supabase Realtime for load updates
- Custom WebSocket server for chat
- Notification pub/sub system
- Presence indicators

### Event System
```python
# src/services/events/emitter.py
class EventEmitter:
    - emit_load_update()
    - emit_new_message()
    - emit_notification()
    - emit_ai_decision()
```

## 6. Frontend State Management

### React Query Setup
```typescript
// lib/queries/loads.ts
- useLoads() - List all loads
- useLoad(id) - Single load details
- useLoadChat(id) - Chat messages
- useLoadTimeline(id) - Milestones

// lib/mutations/chat.ts
- useSendMessage() - Send to AI
- useProvideFeedback() - AI feedback
```

### Real-time Subscriptions
```typescript
// lib/realtime/subscriptions.ts
- useLoadUpdates()
- useChatMessages()
- useNotifications()
```

## 7. UI/UX Implementation Details

### Chat Message Types
1. **AI Status Update** - Load progress notifications
2. **AI Question** - Requests for human input
3. **Broker Command** - Natural language instructions
4. **Communication Log** - Email/SMS/Call records
5. **Document Display** - Inline document viewing
6. **System Message** - Errors, confirmations

### Load Status Workflow
```
New → AI Processing → Quoted → Shipper Response → 
Booked → Dispatched → In Transit → Delivered → 
Invoiced → Paid → Complete
```

### Confidence Thresholds
- **High (>85%)**: Fully automated
- **Medium (60-85%)**: Notify broker, proceed
- **Low (<60%)**: Require approval

## 8. Development Priorities

### Phase 1: Core Chat Interface
1. OAuth authentication
2. Loads table
3. Basic chat interface
4. AI message integration

### Phase 2: Enhanced Features
1. Timeline component
2. Document viewer
3. Real-time updates
4. Notification system

### Phase 3: Dashboard & Settings
1. KPI dashboard
2. Settings pages
3. Confidence configuration
4. Performance optimization

## 9. Testing Requirements

### Frontend Tests
- OAuth flow testing
- Chat interaction tests
- Real-time update tests
- Component unit tests

### Backend Tests
- API endpoint tests
- WebSocket tests
- AI conversation tests
- Integration tests

### E2E Tests
- Full user journey
- Load lifecycle
- AI interaction flows
- Error scenarios

## 10. Migration Strategy

### Data Migration
- Migrate existing loads to new schema
- Create initial conversations for existing loads
- Generate chat history from email threads

### User Migration
- Email existing users about OAuth requirement
- Provide migration guide
- Grace period for transition

## 11. Documentation Updates

### Update Existing Docs
- **ARCHITECTURE.md** - Add chat-first architecture
- **DEV_PLAN.md** - Update Week 3 tasks
- **CLAUDE.md** - Add chat UI guidelines
- **PRD.md** - Already updated ✓

### New Documentation
- **CHAT_INTERFACE.md** - Detailed chat implementation
- **OAUTH_SETUP.md** - OAuth configuration guide
- **AI_CONVERSATION.md** - Conversation design patterns

## 12. Configuration Updates

### Environment Variables
```
# OAuth Configuration
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OUTLOOK_CLIENT_ID=
OUTLOOK_CLIENT_SECRET=
OAUTH_REDIRECT_URI=

# WebSocket Configuration
WS_PORT=3001
WS_ALLOWED_ORIGINS=

# AI Configuration
DEFAULT_CONFIDENCE_THRESHOLD=0.60
HIGH_CONFIDENCE_THRESHOLD=0.85
```

### Deployment Changes
- Add WebSocket support to hosting
- Configure OAuth redirect URLs
- Set up real-time infrastructure
- Add notification services

## Implementation Timeline

**Week 3 (Current):**
- Day 1-2: OAuth authentication setup
- Day 3: Loads table and basic navigation
- Day 4-5: Chat interface foundation

**Week 4:**
- Day 1-2: AI conversation integration
- Day 3: Timeline and document viewer
- Day 4: Real-time updates
- Day 5: Testing and polish

**Week 5:**
- Dashboard implementation
- Settings pages
- Performance optimization
- Production deployment

---

This plan ensures a smooth transition to the chat-first UI while maintaining all existing functionality and preparing for future enhancements.