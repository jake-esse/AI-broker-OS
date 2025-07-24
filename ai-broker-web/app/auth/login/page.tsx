'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<'google' | 'outlook' | null>(null)
  const router = useRouter()

  const handleOAuthLogin = async (provider: 'google' | 'outlook') => {
    setLoading(true)
    setProvider(provider)

    try {
      // Redirect to our OAuth endpoint
      const authProvider = provider === 'outlook' ? 'microsoft' : 'google'
      window.location.href = `/api/auth/direct/${authProvider}`
    } catch (error: any) {
      alert('Error: ' + (error.message || 'Failed to start authentication'))
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
            onClick={() => handleOAuthLogin('outlook')}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading && provider === 'outlook' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <img src="/outlook-logo.svg" alt="Outlook" className="h-5 w-5" />
            )}
            {loading && provider === 'outlook' ? 'Connecting...' : 'Continue with Outlook'}
          </button>
        </div>
        
        <p className="text-center text-sm text-gray-500">
          By signing in, you'll connect your email account to automatically process freight quotes
        </p>
      </div>
    </div>
  )
}