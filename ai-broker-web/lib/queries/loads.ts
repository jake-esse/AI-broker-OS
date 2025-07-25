import { useQuery } from '@tanstack/react-query'

interface Load {
  id: string
  shipper_name: string
  status: string
  created_at: string
  notifications_count: number
  requires_action: boolean
  origin_city?: string
  origin_state?: string
  dest_city?: string
  dest_state?: string
  reference_number?: string
  equipment?: string
  weight?: number
  pickup_date?: string
  commodity?: string
  rate_per_mile?: number
}

export function useLoads() {
  return useQuery({
    queryKey: ['loads'],
    queryFn: async () => {
      const response = await fetch('/api/loads')
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/'
          return []
        }
        throw new Error('Failed to fetch loads')
      }
      const data = await response.json()
      return data.loads as Load[]
    },
  })
}

export function useLoad(id: string) {
  return useQuery({
    queryKey: ['load', id],
    queryFn: async () => {
      const response = await fetch(`/api/loads/${id}`)
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/'
          return null
        }
        throw new Error('Failed to fetch load')
      }
      const data = await response.json()
      return data.load as Load
    },
  })
}

export function useLoadTimeline(loadId: string) {
  return useQuery({
    queryKey: ['load-timeline', loadId],
    queryFn: async () => {
      // Mock timeline data for now
      return [
        {
          id: '1',
          title: 'Load Created',
          description: 'Quote request received from shipper',
          completed: true,
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          chat_message_id: 'msg-1',
        },
        {
          id: '2',
          title: 'Quote Generated',
          description: 'AI generated quote: $2,500',
          completed: true,
          timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          chat_message_id: 'msg-3',
        },
        {
          id: '3',
          title: 'Carrier Selection',
          description: 'Waiting for broker approval',
          completed: false,
          is_current: true,
          chat_message_id: 'msg-5',
        },
        {
          id: '4',
          title: 'Dispatch',
          description: 'Send to carrier',
          completed: false,
        },
        {
          id: '5',
          title: 'In Transit',
          description: 'Track shipment',
          completed: false,
        },
        {
          id: '6',
          title: 'Delivered',
          description: 'Collect POD',
          completed: false,
        },
      ]
    },
  })
}