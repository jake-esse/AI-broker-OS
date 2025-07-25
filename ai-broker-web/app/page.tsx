'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUserClient } from '@/lib/auth/client'
import { Loader2 } from 'lucide-react'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    async function checkAuth() {
      const user = await getCurrentUserClient()
      if (user) {
        router.push('/dashboard')
      } else {
        router.push('/login')
      }
    }
    
    checkAuth()
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  )
}