import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

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

interface ChatResponse {
  userMessage: ChatMessage
  aiMessage: ChatMessage
  requiresAction: boolean
}

export function useChatMessages(loadId: string) {
  return useQuery({
    queryKey: ['chat-messages', loadId],
    queryFn: async () => {
      const response = await fetch(`/api/chat/${loadId}/messages`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch messages')
      }
      
      const data = await response.json()
      return data.messages as ChatMessage[]
    },
    refetchInterval: 5000, // Poll for new messages every 5 seconds
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ loadId, message }: { loadId: string; message: string }) => {
      const response = await fetch(`/api/chat/${loadId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send message')
      }
      
      return response.json() as Promise<ChatResponse>
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch messages
      queryClient.invalidateQueries({ queryKey: ['chat-messages', variables.loadId] })
    },
  })
}

export function useChatSummary(loadId: string) {
  return useQuery({
    queryKey: ['chat-summary', loadId],
    queryFn: async () => {
      const response = await fetch(`/api/chat/${loadId}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch chat summary')
      }
      
      const data = await response.json()
      return data.summary
    },
  })
}