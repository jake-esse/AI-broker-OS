'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Mail, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [provider, setProvider] = useState<'google' | 'azure' | 'imap' | null>(null)
  const [showImapForm, setShowImapForm] = useState(false)
  const [imapCredentials, setImapCredentials] = useState({
    email: '',
    password: '',
    host: '',
    port: '993',
  })
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

  const handleImapLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setProvider('imap')

    try {
      // First, sign up/in with Supabase using email
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: imapCredentials.email,
        password: imapCredentials.password,
      })

      if (authError && authError.message.includes('Invalid login credentials')) {
        // If user doesn't exist, create account
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: imapCredentials.email,
          password: imapCredentials.password,
        })

        if (signUpError) {
          throw signUpError
        }
      } else if (authError) {
        throw authError
      }

      // Store IMAP credentials securely
      const response = await fetch('/api/auth/connect-imap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: imapCredentials.email,
          password: imapCredentials.password,
          host: imapCredentials.host,
          port: parseInt(imapCredentials.port),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to connect IMAP account')
      }

      router.push('/')
    } catch (error: any) {
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
        
        {!showImapForm ? (
          <>
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

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-gray-500">Or</span>
                </div>
              </div>

              <button
                onClick={() => setShowImapForm(true)}
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Mail className="h-5 w-5" />
                Continue with other email providers
              </button>
            </div>
            
            <p className="text-center text-sm text-gray-500">
              By signing in, you'll connect your email account to automatically process freight quotes
            </p>
          </>
        ) : (
          <>
            <form onSubmit={handleImapLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={imapCredentials.email}
                  onChange={(e) => setImapCredentials({ ...imapCredentials, email: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Email Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={imapCredentials.password}
                  onChange={(e) => setImapCredentials({ ...imapCredentials, password: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="Your email password"
                />
              </div>

              <div>
                <label htmlFor="host" className="block text-sm font-medium text-gray-700">
                  IMAP Server
                </label>
                <input
                  id="host"
                  type="text"
                  required
                  value={imapCredentials.host}
                  onChange={(e) => setImapCredentials({ ...imapCredentials, host: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="imap.example.com"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Common: imap.gmail.com, outlook.office365.com, imap.mail.yahoo.com
                </p>
              </div>

              <div>
                <label htmlFor="port" className="block text-sm font-medium text-gray-700">
                  Port
                </label>
                <input
                  id="port"
                  type="number"
                  required
                  value={imapCredentials.port}
                  onChange={(e) => setImapCredentials({ ...imapCredentials, port: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="993"
                />
                <p className="mt-1 text-xs text-gray-500">Usually 993 for SSL/TLS</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowImapForm(false)}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading && provider === 'imap' ? 'Connecting...' : 'Connect Account'}
                </button>
              </div>
            </form>

            <p className="text-center text-sm text-gray-500">
              We'll securely store your credentials to monitor incoming freight quotes
            </p>
          </>
        )}
      </div>
    </div>
  )
}