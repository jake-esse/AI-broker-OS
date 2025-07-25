'use client'

import { useParams, useRouter } from 'next/navigation'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { LoadTimeline } from '@/components/timeline/LoadTimeline'
import { useLoad } from '@/lib/queries/loads'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function LoadChatPage() {
  const params = useParams()
  const router = useRouter()
  const loadId = params.id as string
  const { data: load, isLoading } = useLoad(loadId)

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!load) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Load not found</p>
          <button
            onClick={() => router.push('/loads')}
            className="mt-4 text-blue-600 hover:text-blue-700"
          >
            Return to loads
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Back Button and Chat */}
      <div className="flex flex-1 flex-col">
        <div className="mb-4">
          <button
            onClick={() => router.push('/loads')}
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