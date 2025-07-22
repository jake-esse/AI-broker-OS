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
      const { data, error } = await supabase
        .from('loads')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('Error fetching loads:', error)
        throw error
      }
      
      // Transform the data to match the expected format
      const transformedLoads: Load[] = (data || []).map(load => ({
        id: load.id,
        shipper_name: load.customer_name || load.customer_email || 'Unknown Shipper',
        status: load.status,
        created_at: load.created_at,
        notifications_count: 0, // TODO: Implement notification count
        requires_action: load.status === 'quoted' || load.status === 'pending_clarification',
        origin_city: load.pickup_location?.split(',')[0]?.trim(),
        origin_state: load.pickup_location?.split(',')[1]?.trim(),
        dest_city: load.delivery_location?.split(',')[0]?.trim(),
        dest_state: load.delivery_location?.split(',')[1]?.trim(),
        reference_number: load.reference_number,
      }))
      
      return transformedLoads
    },
  })
}

export function useLoad(id: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['load', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loads')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) {
        console.error('Error fetching load:', error)
        throw error
      }
      
      // Transform the data to match the expected format
      const transformedLoad: Load = {
        id: data.id,
        shipper_name: data.customer_name || data.customer_email || 'Unknown Shipper',
        status: data.status,
        created_at: data.created_at,
        notifications_count: 0, // TODO: Implement notification count
        requires_action: data.status === 'quoted' || data.status === 'pending_clarification',
        origin_city: data.pickup_location?.split(',')[0]?.trim(),
        origin_state: data.pickup_location?.split(',')[1]?.trim(),
        dest_city: data.delivery_location?.split(',')[0]?.trim(),
        dest_state: data.delivery_location?.split(',')[1]?.trim(),
        reference_number: data.reference_number,
      }
      
      return transformedLoad
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