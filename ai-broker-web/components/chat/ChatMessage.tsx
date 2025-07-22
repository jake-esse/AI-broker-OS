import { formatDistanceToNow } from 'date-fns'
import { Bot, User, Mail, Phone, FileText, AlertCircle } from 'lucide-react'
import { ConfidenceIndicator } from './ConfidenceIndicator'
import { DocumentViewer } from './DocumentViewer'
import { cn } from '@/lib/utils/cn'

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
      case 'shipper':
      case 'carrier':
        return <Mail className="h-5 w-5 text-gray-400" />
      case 'system':
        return <AlertCircle className="h-5 w-5 text-gray-400" />
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
      case 'system':
        return 'System'
      default:
        return 'Unknown'
    }
  }

  const isUserMessage = message.sender_type === 'broker'

  return (
    <div className={cn('flex gap-3', isUserMessage && 'flex-row-reverse')}>
      <div className="flex-shrink-0">{getIcon()}</div>
      
      <div className={cn('flex-1', isUserMessage && 'flex flex-col items-end')}>
        <div className={cn('mb-1 flex items-center gap-2 text-sm', isUserMessage && 'flex-row-reverse')}>
          <span className="font-medium text-gray-900">{getSenderName()}</span>
          <span className="text-gray-500">
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
          </span>
          {message.confidence_score !== undefined && (
            <ConfidenceIndicator score={message.confidence_score} />
          )}
        </div>
        
        <div className={cn(
          'inline-block rounded-lg px-4 py-2',
          isUserMessage 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-100 text-gray-900'
        )}>
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

        {/* Show email/communication content if present */}
        {message.metadata?.email_content && (
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="mb-1 text-xs font-medium text-gray-500">Email from {message.metadata.sender_name}</p>
            <p className="text-sm text-gray-700">{message.metadata.email_content}</p>
          </div>
        )}
      </div>
    </div>
  )
}