'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const handleCallback = async () => {
      console.log('Starting callback...')
      
      // Get the code from URL params
      const code = searchParams.get('code')
      console.log('Auth code:', code)
      
      if (code) {
        try {
          // Exchange the code for a session
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          console.log('Exchange result:', data, 'Error:', error)
          
          if (error) {
            console.error('Exchange error:', error)
            router.push('/auth/login')
            return
          }
          
          if (data?.session) {
            console.log('Session established, redirecting to home...')
            // Small delay to ensure session is saved
            setTimeout(() => {
              router.push('/')
            }, 100)
          } else {
            console.log('No session after exchange')
            router.push('/auth/login')
          }
        } catch (err) {
          console.error('Callback error:', err)
          router.push('/auth/login')
        }
      } else {
        // No code in URL, check if user is already logged in
        const { data: { session }, error } = await supabase.auth.getSession()
        console.log('Checking existing session:', session, 'Error:', error)
        
        if (session) {
          console.log('Already logged in, redirecting to home...')
          // Don't try to exchange code again
          router.push('/')
        } else {
          console.log('No code and no session, redirecting to login...')
          router.push('/auth/login')
        }
      }
    }

    handleCallback()
  }, [router, supabase, searchParams])

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