import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

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
}

export function useLoads() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['loads'],
    queryFn: async () => {
      // For now, return mock data
      // TODO: Replace with actual Supabase query
      const mockLoads: Load[] = [
        {
          id: 'load-123',
          shipper_name: 'ABC Manufacturing',
          status: 'quoted',
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          notifications_count: 1,
          requires_action: true,
          origin_city: 'Chicago',
          origin_state: 'IL',
          dest_city: 'Atlanta',
          dest_state: 'GA',
          reference_number: 'REF-001',
        },
        {
          id: 'load-456',
          shipper_name: 'XYZ Corp',
          status: 'in_transit',
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          notifications_count: 0,
          requires_action: false,
          origin_city: 'Dallas',
          origin_state: 'TX',
          dest_city: 'Miami',
          dest_state: 'FL',
          reference_number: 'REF-002',
        },
        {
          id: 'load-789',
          shipper_name: 'Global Logistics',
          status: 'new',
          created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
          notifications_count: 0,
          requires_action: false,
          origin_city: 'Los Angeles',
          origin_state: 'CA',
          dest_city: 'Seattle',
          dest_state: 'WA',
          reference_number: 'REF-003',
        },
      ]

      return mockLoads

      // Real implementation would be:
      // const { data, error } = await supabase
      //   .from('loads')
      //   .select('*')
      //   .order('created_at', { ascending: false })
      // 
      // if (error) throw error
      // return data
    },
  })
}

export function useLoad(id: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['load', id],
    queryFn: async () => {
      // For now, return mock data
      // TODO: Replace with actual Supabase query
      const mockLoad: Load = {
        id,
        shipper_name: 'ABC Manufacturing',
        status: 'quoted',
        created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        notifications_count: 1,
        requires_action: true,
        origin_city: 'Chicago',
        origin_state: 'IL',
        dest_city: 'Atlanta',
        dest_state: 'GA',
        reference_number: 'REF-001',
      }

      return mockLoad

      // Real implementation would be:
      // const { data, error } = await supabase
      //   .from('loads')
      //   .select('*')
      //   .eq('id', id)
      //   .single()
      // 
      // if (error) throw error
      // return data
    },
  })
}

export function useLoadTimeline(loadId: string) {
  return useQuery({
    queryKey: ['load-timeline', loadId],
    queryFn: async () => {
      // Mock timeline data
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