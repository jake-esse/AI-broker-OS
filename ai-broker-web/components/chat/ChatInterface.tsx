'use client'

import { useState, useEffect, useRef } from 'react'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { useChatMessages, useSendMessage } from '@/lib/queries/chat'
import { Loader2 } from 'lucide-react'

interface ChatInterfaceProps {
  loadId: string
  load: any
}

export function ChatInterface({ loadId, load }: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { data: messages = [], isLoading, refetch } = useChatMessages(loadId)
  const sendMessage = useSendMessage()

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
    refetch()
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
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-gray-500">No messages yet. Start a conversation about this load.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 px-6 py-4">
        <ChatInput 
          onSend={handleSendMessage} 
          disabled={sendMessage.isPending}
        />
      </div>
    </div>
  )
}