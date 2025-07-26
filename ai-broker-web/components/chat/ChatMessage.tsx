import { formatDistanceToNow } from 'date-fns'
import { Bot, User, Mail, Phone, FileText, AlertCircle, Wrench } from 'lucide-react'
import { ConfidenceIndicator } from './ConfidenceIndicator'
import { DocumentViewer } from './DocumentViewer'
import { cn } from '@/lib/utils/cn'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  metadata?: any
  confidence?: number
  toolCalls?: any[]
  suggestedActions?: any[]
}

export function ChatMessage({ message }: { message: ChatMessage }) {
  const getIcon = () => {
    switch (message.role) {
      case 'assistant':
        return <Bot className="h-5 w-5 text-blue-600" />
      case 'user':
        return <User className="h-5 w-5 text-gray-600" />
      case 'system':
        return <AlertCircle className="h-5 w-5 text-gray-400" />
      default:
        return <Mail className="h-5 w-5 text-gray-400" />
    }
  }

  const getSenderName = () => {
    switch (message.role) {
      case 'assistant':
        return 'AI Assistant'
      case 'user':
        return 'You'
      case 'system':
        return 'System'
      default:
        return 'Unknown'
    }
  }

  const isUserMessage = message.role === 'user'
  const requiresResponse = message.confidence !== undefined && message.confidence < 0.85

  return (
    <div className={cn('flex gap-3', isUserMessage && 'flex-row-reverse')}>
      <div className="flex-shrink-0">{getIcon()}</div>
      
      <div className={cn('flex-1', isUserMessage && 'flex flex-col items-end')}>
        <div className={cn('mb-1 flex items-center gap-2 text-sm', isUserMessage && 'flex-row-reverse')}>
          <span className="font-medium text-gray-900">{getSenderName()}</span>
          <span className="text-gray-500">
            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          </span>
          {message.confidence !== undefined && (
            <ConfidenceIndicator score={message.confidence} />
          )}
        </div>
        
        <div className={cn(
          'inline-block rounded-lg px-4 py-2',
          isUserMessage 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-100 text-gray-900'
        )}>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {requiresResponse && (
          <div className="mt-2 flex items-center gap-2 text-sm text-amber-600">
            <AlertCircle className="h-4 w-4" />
            <span>Response required - Low confidence ({Math.round(message.confidence! * 100)}%)</span>
          </div>
        )}

        {/* Show tool calls if present */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((toolCall: any, index: number) => (
              <div key={index} className="flex items-center gap-2 text-xs text-gray-500">
                <Wrench className="h-3 w-3" />
                <span>Used: {toolCall.tool}</span>
              </div>
            ))}
          </div>
        )}

        {/* Show suggested actions */}
        {message.suggestedActions && message.suggestedActions.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-xs font-medium text-gray-500">Suggested actions:</p>
            {message.suggestedActions.map((action: any, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <button className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-600 hover:bg-blue-100">
                  {action.description}
                </button>
              </div>
            ))}
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