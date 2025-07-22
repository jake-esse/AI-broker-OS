'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function AuthCallbackPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const handleCallback = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Auth error:', error)
        router.push('/auth/login')
        return
      }

      if (session) {
        // Store email connection details
        await fetch('/api/auth/connect-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: session.user.app_metadata.provider,
            access_token: session.provider_token,
            refresh_token: session.provider_refresh_token,
          }),
        })

        router.push('/')
      }
    }

    handleCallback()
  }, [router, supabase])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
        <h2 className="mt-4 text-2xl font-semibold">Connecting your account...</h2>
        <p className="mt-2 text-gray-600">Please wait while we set up your workspace</p>
      </div>
    </div>
  )
}