'use client'

import { useRouter } from 'next/navigation'
import { LoadStatusBadge } from './LoadStatusBadge'
import { formatDistanceToNow } from 'date-fns'
import { AlertCircle } from 'lucide-react'

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
}

export function LoadsTable({ loads }: { loads: Load[] }) {
  const router = useRouter()

  if (loads.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12">
        <div className="text-center">
          <p className="text-gray-500">No loads found. Loads will appear here as they are processed from your email.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Shipper
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Route
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Time Received
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Notifications
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {loads.map((load) => (
            <tr
              key={load.id}
              onClick={() => router.push(`/loads/${load.id}`)}
              className="cursor-pointer hover:bg-gray-50"
            >
              <td className="whitespace-nowrap px-6 py-4">
                <div className="text-sm font-medium text-gray-900">
                  {load.shipper_name}
                </div>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                {load.origin_city && load.dest_city ? (
                  <span>
                    {load.origin_city}, {load.origin_state} → {load.dest_city}, {load.dest_state}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <LoadStatusBadge status={load.status} />
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                {formatDistanceToNow(new Date(load.created_at), { addSuffix: true })}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <div className="flex items-center gap-2">
                  {load.notifications_count > 0 && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                      {load.notifications_count}
                    </span>
                  )}
                  {load.requires_action && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                      <AlertCircle className="h-3 w-3" />
                      Action Required
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}