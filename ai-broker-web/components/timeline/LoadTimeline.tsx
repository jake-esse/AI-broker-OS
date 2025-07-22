'use client'

import { useLoadTimeline } from '@/lib/queries/loads'
import { CheckCircle, Circle, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface LoadTimelineProps {
  loadId: string
}

export function LoadTimeline({ loadId }: LoadTimelineProps) {
  const { data: milestones = [], isLoading } = useLoadTimeline(loadId)

  const scrollToMessage = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Load Timeline</h3>
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
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
              className={cn(
                'relative flex items-start gap-4',
                milestone.chat_message_id && 'cursor-pointer hover:opacity-80'
              )}
              onClick={() => milestone.chat_message_id && scrollToMessage(milestone.chat_message_id)}
            >
              <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white">
                {milestone.completed ? (
                  <CheckCircle className="h-8 w-8 text-green-600" />
                ) : milestone.is_current ? (
                  <AlertCircle className="h-8 w-8 text-amber-600" />
                ) : (
                  <Circle className="h-8 w-8 text-gray-300" />
                )}
              </div>
              
              <div className="flex-1 pb-2">
                <h4 className={cn(
                  'font-medium',
                  milestone.completed ? 'text-gray-900' : 'text-gray-600'
                )}>
                  {milestone.title}
                </h4>
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