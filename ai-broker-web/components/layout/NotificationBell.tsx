'use client'

import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import * as Dialog from '@radix-ui/react-dialog'

interface Notification {
  id: string
  load_id: string
  type: string
  message: string
  read: boolean
  created_at: string
}

// Mock notifications for now
const mockNotifications: Notification[] = [
  {
    id: '1',
    load_id: 'load-123',
    type: 'action_required',
    message: 'AI needs confirmation on carrier selection',
    read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: '2',
    load_id: 'load-456',
    type: 'update',
    message: 'Load delivered successfully',
    read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
]

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const unreadCount = mockNotifications.filter(n => !n.read).length

  const handleNotificationClick = (notification: Notification) => {
    router.push(`/loads/${notification.load_id}`)
    setOpen(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="relative rounded-full p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-xs font-medium text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0" onClick={() => setOpen(false)} />
        <Dialog.Content className="fixed right-4 top-16 w-96 rounded-lg bg-white p-4 shadow-lg">
          <Dialog.Title className="mb-4 text-lg font-semibold">Notifications</Dialog.Title>
          
          <div className="max-h-96 overflow-y-auto">
            {mockNotifications.length === 0 ? (
              <p className="text-center text-gray-500">No notifications</p>
            ) : (
              <div className="space-y-2">
                {mockNotifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      'w-full rounded-lg p-3 text-left hover:bg-gray-50',
                      notification.read ? 'bg-white' : 'bg-blue-50'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className={cn(
                          'text-sm',
                          notification.read ? 'text-gray-700' : 'font-medium text-gray-900'
                        )}>
                          {notification.message}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="ml-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-600" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}