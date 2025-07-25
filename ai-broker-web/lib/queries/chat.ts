import { useQuery, useMutation } from '@tanstack/react-query'

interface ChatMessage {
  id: string
  sender_type: 'ai' | 'broker' | 'shipper' | 'carrier' | 'system'
  message: string
  confidence_score?: number
  requires_response?: boolean
  metadata?: any
  created_at: string
}

export function useChatMessages(loadId: string) {
  return useQuery({
    queryKey: ['chat-messages', loadId],
    queryFn: async () => {
      // Mock chat messages for demonstration
      const mockMessages: ChatMessage[] = [
        {
          id: 'msg-1',
          sender_type: 'system',
          message: 'Load created from email request',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        },
        {
          id: 'msg-2',
          sender_type: 'ai',
          message: 'I received a quote request from ABC Manufacturing for a shipment from Chicago, IL to Atlanta, GA. The load details are:\n\n• Weight: 42,000 lbs\n• Equipment: Dry Van\n• Pickup: Tomorrow at 8:00 AM\n• Commodity: General Freight\n\nI\'ll generate a quote for this shipment.',
          confidence_score: 0.95,
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 2 + 1000).toISOString(),
        },
        {
          id: 'msg-3',
          sender_type: 'ai',
          message: 'Based on current market rates for this lane and equipment type, I recommend quoting $2,500 for this load. This includes:\n\n• Base rate: $2,300\n• Fuel surcharge: $200\n• Profit margin: 18%\n\nShall I send this quote to the shipper?',
          confidence_score: 0.88,
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        },
        {
          id: 'msg-4',
          sender_type: 'broker',
          message: 'Yes, send the quote',
          created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        },
        {
          id: 'msg-5',
          sender_type: 'ai',
          message: 'Quote sent successfully to ABC Manufacturing. I\'ve found 3 potential carriers for this load:\n\n1. **Swift Transportation** - Safety: 92%, On-time: 94%, Rate: $2,050\n2. **Knight Transportation** - Safety: 88%, On-time: 91%, Rate: $2,100\n3. **Werner Enterprises** - Safety: 85%, On-time: 89%, Rate: $1,950\n\nI recommend Swift Transportation based on their excellent safety record and reliability. However, I need your approval to proceed with the carrier selection.',
          confidence_score: 0.72,
          requires_response: true,
          created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        },
        {
          id: 'msg-6',
          sender_type: 'shipper',
          message: 'We accept your quote of $2,500. Please proceed with booking.',
          metadata: {
            sender_name: 'John Smith',
            email_content: 'Hi, We accept your quote of $2,500 for the Chicago to Atlanta load. Please proceed with booking a carrier. We need pickup tomorrow at 8 AM sharp. Thanks, John',
          },
          created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        },
      ]

      return mockMessages

      // Real implementation would be:
      // const { data, error } = await supabase
      //   .from('chat_messages')
      //   .select('*')
      //   .eq('load_id', loadId)
      //   .order('created_at', { ascending: true })
      // 
      // if (error) throw error
      // return data
    },
  })
}

export function useSendMessage() {
  return useMutation({
    mutationFn: async ({ loadId, message }: { loadId: string; message: string }) => {
      // Mock implementation - just log for now
      console.log('Sending message:', { loadId, message })
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Real implementation would be:
      // const { data, error } = await supabase
      //   .from('chat_messages')
      //   .insert({
      //     load_id: loadId,
      //     sender_type: 'broker',
      //     message,
      //   })
      //   .select()
      //   .single()
      // 
      // if (error) throw error
      // 
      // // Trigger AI response
      // await fetch('/api/chat/ai-response', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ loadId, message }),
      // })
      // 
      // return data
    },
  })
}