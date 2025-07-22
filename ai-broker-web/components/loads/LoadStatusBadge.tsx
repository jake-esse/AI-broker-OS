import { cn } from '@/lib/utils/cn'

const statusConfig = {
  new: {
    label: 'New',
    className: 'bg-blue-100 text-blue-800',
  },
  quoted: {
    label: 'Quoted',
    className: 'bg-purple-100 text-purple-800',
  },
  booked: {
    label: 'Booked',
    className: 'bg-green-100 text-green-800',
  },
  in_transit: {
    label: 'In Transit',
    className: 'bg-yellow-100 text-yellow-800',
  },
  delivered: {
    label: 'Delivered',
    className: 'bg-gray-100 text-gray-800',
  },
  complete: {
    label: 'Complete',
    className: 'bg-emerald-100 text-emerald-800',
  },
  action_required: {
    label: 'Action Required',
    className: 'bg-red-100 text-red-800',
  },
}

interface LoadStatusBadgeProps {
  status: string
}

export function LoadStatusBadge({ status }: LoadStatusBadgeProps) {
  const config = statusConfig[status as keyof typeof statusConfig] || {
    label: status,
    className: 'bg-gray-100 text-gray-800',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.className
      )}
    >
      {config.label}
    </span>
  )
}