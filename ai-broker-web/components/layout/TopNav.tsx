'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { NotificationBell } from './NotificationBell'
import { Package, BarChart3, Settings, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getCurrentUserClient, signOut } from '@/lib/auth/client'

const navigation = [
  { name: 'Loads', href: '/', icon: Package },
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

interface User {
  id: string
  email: string
  name?: string | null
}

export function TopNav() {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const currentUser = await getCurrentUserClient()
      setUser(currentUser)
      setLoading(false)
    }

    getUser()
  }, [])

  if (pathname.startsWith('/auth')) {
    return null
  }

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-gray-900">AI-Broker</h1>
            </div>
            <div className="ml-10 flex items-baseline space-x-4">
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      pathname === item.href
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            ) : user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">{user.email}</span>
                <button
                  onClick={signOut}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  )
}