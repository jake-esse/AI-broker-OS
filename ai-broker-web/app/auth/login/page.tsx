'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Mail, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<'google' | 'azure' | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleOAuthLogin = async (provider: 'google' | 'azure') => {
    setLoading(true)
    setProvider(provider)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider === 'azure' ? 'azure' : 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: provider === 'google' 
          ? 'email profile https://www.googleapis.com/auth/gmail.readonly'
          : 'email profile offline_access https://graph.microsoft.com/Mail.Read',
      },
    })

    if (error) {
      alert('Error: ' + error.message)
      setLoading(false)
      setProvider(null)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <Mail className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Welcome to AI-Broker</h2>
          <p className="mt-2 text-gray-600">
            Sign in with your email provider to connect your freight operations
          </p>
        </div>
        
        <div className="space-y-4">
          <button
            onClick={() => handleOAuthLogin('google')}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading && provider === 'google' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <img src="/google-logo.svg" alt="Google" className="h-5 w-5" />
            )}
            {loading && provider === 'google' ? 'Connecting...' : 'Continue with Gmail'}
          </button>
          
          <button
            onClick={() => handleOAuthLogin('azure')}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading && provider === 'azure' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <img src="/outlook-logo.svg" alt="Outlook" className="h-5 w-5" />
            )}
            {loading && provider === 'azure' ? 'Connecting...' : 'Continue with Outlook'}
          </button>
        </div>
        
        <p className="text-center text-sm text-gray-500">
          By signing in, you'll connect your email account to automatically process freight quotes
        </p>
      </div>
    </div>
  )
}