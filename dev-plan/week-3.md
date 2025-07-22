# Week 3: Web Application Foundation - Chat-First UI

**Status**: COMPLETED - 2025-07-22
**IMAP Authentication Added**: 2025-07-23

## Day 1-2: OAuth Authentication Setup

### Project Initialization

```bash
# Create Next.js project (COMPLETED)
npx create-next-app@latest ai-broker-web --typescript --tailwind --app

# Install dependencies (COMPLETED)
npm install @supabase/supabase-js @supabase/ssr
npm install @radix-ui/react-dialog @radix-ui/react-tabs
npm install react-hook-form zod @hookform/resolvers
npm install @tanstack/react-query axios
npm install framer-motion
```

### OAuth Login Implementation

```typescript
// app/auth/login/page.tsx
'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<'google' | 'azure' | null>(null)
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleOAuthLogin = async (provider: 'google' | 'azure') => {
    setLoading(true)
    setProvider(provider)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider === 'azure' ? 'azure' : 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: provider === 'google' 
          ? 'email profile https://www.googleapis.com/auth/gmail.readonly'
          : 'email profile offline_access https://graph.microsoft.com/Mail.Read',
      },
    })

    if (error) {
      alert('Error: ' + error.message)
      setLoading(false)
      setProvider(null)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Welcome to AI-Broker</h2>
          <p className="mt-2 text-gray-600">
            Sign in with your email provider to connect your freight operations
          </p>
        </div>
        
        <div className="space-y-4">
          <button
            onClick={() => handleOAuthLogin('google')}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <img src="/google-logo.svg" alt="Google" className="h-5 w-5" />
            {loading && provider === 'google' ? 'Connecting...' : 'Continue with Gmail'}
          </button>
          
          <button
            onClick={() => handleOAuthLogin('azure')}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <img src="/outlook-logo.svg" alt="Outlook" className="h-5 w-5" />
            {loading && provider === 'azure' ? 'Connecting...' : 'Continue with Outlook'}
          </button>
        </div>
        
        <p className="text-center text-sm text-gray-500">
          By signing in, you'll connect your email account to automatically process freight quotes
        </p>
      </div>
    </div>
  )
}
```

### OAuth Callback Handler

```typescript
// app/auth/callback/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function AuthCallbackPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const handleCallback = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Auth error:', error)
        router.push('/auth/login')
        return
      }

      if (session) {
        // Store email connection details
        await fetch('/api/auth/connect-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: session.user.app_metadata.provider,
            access_token: session.provider_token,
            refresh_token: session.provider_refresh_token,
          }),
        })

        router.push('/')
      }
    }

    handleCallback()
  }, [router, supabase])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Connecting your account...</h2>
        <p className="mt-2 text-gray-600">Please wait while we set up your workspace</p>
      </div>
    </div>
  )
}
```

## Day 3: Loads Table & Navigation

### Main Layout with Top Navigation

```typescript
// app/layout.tsx
import { TopNav } from '@/components/layout/TopNav'
import { Providers } from '@/components/providers/Providers'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen bg-gray-50">
            <TopNav />
            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
```

### Loads Table (Homepage)

```typescript
// app/page.tsx
'use client'

import { LoadsTable } from '@/components/loads/LoadsTable'
import { useLoads } from '@/lib/queries/loads'

export default function HomePage() {
  const { data: loads, isLoading } = useLoads()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Loads</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your freight operations with AI assistance
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="text-gray-500">Loading...</div>
        </div>
      ) : (
        <LoadsTable loads={loads || []} />
      )}
    </div>
  )
}
```

### Loads Table Component

```typescript
// components/loads/LoadsTable.tsx
import { useRouter } from 'next/navigation'
import { LoadStatusBadge } from './LoadStatusBadge'
import { formatDistanceToNow } from 'date-fns'

interface Load {
  id: string
  shipper_name: string
  status: string
  created_at: string
  notifications_count: number
  requires_action: boolean
}

export function LoadsTable({ loads }: { loads: Load[] }) {
  const router = useRouter()

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Shipper
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Time Received
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Notifications
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {loads.map((load) => (
            <tr
              key={load.id}
              onClick={() => router.push(`/loads/${load.id}`)}
              className="cursor-pointer hover:bg-gray-50"
            >
              <td className="whitespace-nowrap px-6 py-4">
                <div className="text-sm font-medium text-gray-900">
                  {load.shipper_name}
                </div>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <LoadStatusBadge status={load.status} />
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                {formatDistanceToNow(new Date(load.created_at), { addSuffix: true })}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                {load.notifications_count > 0 && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                    {load.notifications_count}
                  </span>
                )}
                {load.requires_action && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                    Action Required
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

## Day 4-5: Chat Interface & Timeline

### Load Chat Page

```typescript
// app/loads/[id]/page.tsx
'use client'

import { useParams, useRouter } from 'next/navigation'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { LoadTimeline } from '@/components/timeline/LoadTimeline'
import { useLoad } from '@/lib/queries/loads'
import { ArrowLeft } from 'lucide-react'

export default function LoadChatPage() {
  const params = useParams()
  const router = useRouter()
  const loadId = params.id as string
  const { data: load, isLoading } = useLoad(loadId)

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500">Loading load details...</div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4">
      {/* Back Button and Chat */}
      <div className="flex flex-1 flex-col">
        <div className="mb-4">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Loads
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <ChatInterface loadId={loadId} load={load} />
        </div>
      </div>

      {/* Timeline */}
      <div className="w-80">
        <LoadTimeline loadId={loadId} />
      </div>
    </div>
  )
}
```

### Chat Interface Component

```typescript
// components/chat/ChatInterface.tsx
import { useState, useEffect, useRef } from 'react'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { useChatMessages, useSendMessage } from '@/lib/queries/chat'
import { useSupabaseRealtime } from '@/lib/realtime/supabase'

export function ChatInterface({ loadId, load }: { loadId: string; load: any }) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { data: messages = [], refetch } = useChatMessages(loadId)
  const sendMessage = useSendMessage()
  
  // Subscribe to real-time updates
  useSupabaseRealtime(`chat:${loadId}`, () => {
    refetch()
  })

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async (text: string) => {
    await sendMessage.mutateAsync({
      loadId,
      message: text,
    })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Load #{load?.reference_number} - {load?.shipper_name}
        </h2>
        <p className="text-sm text-gray-500">
          {load?.origin_city}, {load?.origin_state} → {load?.dest_city}, {load?.dest_state}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 px-6 py-4">
        <ChatInput onSend={handleSendMessage} />
      </div>
    </div>
  )
}
```

### Chat Message Component

```typescript
// components/chat/ChatMessage.tsx
import { formatDistanceToNow } from 'date-fns'
import { Bot, User, Mail, Phone, FileText, AlertCircle } from 'lucide-react'
import { ConfidenceIndicator } from './ConfidenceIndicator'
import { DocumentViewer } from './DocumentViewer'

interface ChatMessage {
  id: string
  sender_type: 'ai' | 'broker' | 'shipper' | 'carrier' | 'system'
  message: string
  confidence_score?: number
  requires_response?: boolean
  metadata?: any
  created_at: string
}

export function ChatMessage({ message }: { message: ChatMessage }) {
  const getIcon = () => {
    switch (message.sender_type) {
      case 'ai':
        return <Bot className="h-5 w-5 text-blue-600" />
      case 'broker':
        return <User className="h-5 w-5 text-gray-600" />
      default:
        return <Mail className="h-5 w-5 text-gray-400" />
    }
  }

  const getSenderName = () => {
    switch (message.sender_type) {
      case 'ai':
        return 'AI Assistant'
      case 'broker':
        return 'You'
      case 'shipper':
        return message.metadata?.sender_name || 'Shipper'
      case 'carrier':
        return message.metadata?.sender_name || 'Carrier'
      default:
        return 'System'
    }
  }

  return (
    <div className={`flex gap-3 ${message.sender_type === 'broker' ? 'flex-row-reverse' : ''}`}>
      <div className="flex-shrink-0">{getIcon()}</div>
      
      <div className={`flex-1 ${message.sender_type === 'broker' ? 'text-right' : ''}`}>
        <div className="mb-1 flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-900">{getSenderName()}</span>
          <span className="text-gray-500">
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
          </span>
          {message.confidence_score && (
            <ConfidenceIndicator score={message.confidence_score} />
          )}
        </div>
        
        <div className={`inline-block rounded-lg px-4 py-2 ${
          message.sender_type === 'broker' 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-100 text-gray-900'
        }`}>
          <p className="whitespace-pre-wrap">{message.message}</p>
        </div>

        {message.requires_response && (
          <div className="mt-2 flex items-center gap-2 text-sm text-amber-600">
            <AlertCircle className="h-4 w-4" />
            <span>Response required</span>
          </div>
        )}

        {message.metadata?.documents && (
          <div className="mt-2">
            <DocumentViewer documents={message.metadata.documents} />
          </div>
        )}
      </div>
    </div>
  )
}
```

### Timeline Component

```typescript
// components/timeline/LoadTimeline.tsx
import { useLoadTimeline } from '@/lib/queries/loads'
import { CheckCircle, Circle, AlertCircle } from 'lucide-react'

export function LoadTimeline({ loadId }: { loadId: string }) {
  const { data: milestones = [] } = useLoadTimeline(loadId)

  const scrollToMessage = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">Load Timeline</h3>
      
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 h-full w-0.5 bg-gray-200" />
        
        <div className="space-y-6">
          {milestones.map((milestone, index) => (
            <div
              key={milestone.id}
              className="relative flex cursor-pointer items-start gap-4"
              onClick={() => scrollToMessage(milestone.chat_message_id)}
            >
              <div className="relative z-10">
                {milestone.completed ? (
                  <CheckCircle className="h-8 w-8 text-green-600" />
                ) : milestone.is_current ? (
                  <AlertCircle className="h-8 w-8 text-amber-600" />
                ) : (
                  <Circle className="h-8 w-8 text-gray-300" />
                )}
              </div>
              
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">{milestone.title}</h4>
                <p className="text-sm text-gray-500">{milestone.description}</p>
                {milestone.timestamp && (
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(milestone.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

## Key Deliverables

### OAuth Authentication
- Gmail and Outlook OAuth integration
- Automatic email account connection
- Secure token storage
- Email webhook registration

### Loads Table Interface
- Clean, sortable table view
- Real-time status updates
- Notification indicators
- Click-to-chat navigation

### Chat-First AI Interface
- Load-specific conversations
- Natural language commands
- Confidence indicators
- Human-in-the-loop requests
- Inline document viewing
- Communication history display

### Timeline Navigation
- Visual load progress
- Clickable milestones
- Current status highlighting
- Planned vs actual timing

### Supporting Components
- Top navigation bar
- Notification system
- Status badges
- Document viewer
- Confidence indicators

## Technical Stack
- **Framework**: Next.js 14 with App Router
- **Authentication**: Supabase OAuth
- **UI Components**: Tailwind CSS + Radix UI
- **State Management**: React Query
- **Real-time**: Supabase Realtime
- **Icons**: Lucide React
- **Date Handling**: date-fns

## Next Steps (Week 4)
- Dashboard implementation
- Settings page
- AI conversation backend
- WebSocket integration
- Notification system
- Production deployment