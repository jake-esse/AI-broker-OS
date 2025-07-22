'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mail, Plus, Trash2, CheckCircle, XCircle, AlertCircle, RefreshCw, Save } from 'lucide-react'

interface EmailConnection {
  id: string
  email: string
  provider: string
  status: string
  last_checked: string
  error_message?: string
}

export default function SettingsPage() {
  const [connections, setConnections] = useState<EmailConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [confidenceThresholds, setConfidenceThresholds] = useState({
    autoQuote: 85,
    autoCarrierSelect: 75,
    autoDispatch: 90,
  })
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Check for success/error messages from OAuth callbacks
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'google_connected') {
      alert('Gmail account connected successfully!')
    } else if (success === 'microsoft_connected') {
      alert('Outlook account connected successfully!')
    } else if (error === 'oauth_failed') {
      alert('OAuth authentication failed. Please try again.')
    } else if (error === 'connection_failed') {
      alert('Failed to save email connection. Please try again.')
    }

    // Clear URL params
    if (success || error) {
      router.replace('/settings')
    }
  }, [searchParams, router])

  useEffect(() => {
    loadConnections()
  }, [])

  const loadConnections = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('email_connections')
        .select('*')
        .eq('broker_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setConnections(data || [])
    } catch (error) {
      console.error('Error loading connections:', error)
    } finally {
      setLoading(false)
    }
  }

  const connectEmail = (provider: 'google' | 'microsoft') => {
    window.location.href = `/api/auth/email/${provider}`
  }

  const deleteConnection = async (id: string) => {
    if (!confirm('Are you sure you want to remove this email connection?')) return

    try {
      const { error } = await supabase
        .from('email_connections')
        .delete()
        .eq('id', id)

      if (error) throw error
      await loadConnections()
    } catch (error) {
      console.error('Error deleting connection:', error)
      alert('Failed to delete connection')
    }
  }

  const checkEmails = async (connectionId: string) => {
    setRefreshing(connectionId)
    try {
      const response = await fetch('/api/test/email-check')
      const data = await response.json()
      
      if (data.success) {
        alert('Email check completed. Check your dashboard for new loads.')
        await loadConnections()
      } else {
        alert('Email check failed: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error checking emails:', error)
      alert('Failed to check emails')
    } finally {
      setRefreshing(null)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'reconnect_required':
        return <AlertCircle className="h-5 w-5 text-orange-600" />
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-600" />
    }
  }

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'gmail':
        return 'Gmail'
      case 'outlook':
        return 'Outlook'
      case 'imap':
        return 'IMAP'
      default:
        return provider
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your AI assistant and account preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Email Connections */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Connections
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => connectEmail('google')}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Connect Gmail
              </button>
              <button
                onClick={() => connectEmail('microsoft')}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Connect Outlook
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading connections...</div>
          ) : connections.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No email connections yet</p>
              <p className="text-sm text-gray-400">
                Connect your Gmail or Outlook account to start monitoring emails for quote requests
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-4">
                    {getStatusIcon(connection.status)}
                    <div>
                      <div className="font-medium">{connection.email}</div>
                      <div className="text-sm text-gray-500">
                        {getProviderName(connection.provider)} • Last checked: {
                          connection.last_checked 
                            ? new Date(connection.last_checked).toLocaleString()
                            : 'Never'
                        }
                      </div>
                      {connection.error_message && (
                        <div className="text-sm text-red-600 mt-1">
                          {connection.error_message}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {connection.status === 'reconnect_required' ? (
                      <button
                        onClick={() => connectOAuth(connection.provider as 'gmail' | 'outlook')}
                        className="rounded-lg bg-orange-600 px-3 py-1 text-sm text-white hover:bg-orange-700"
                      >
                        Reconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => checkEmails(connection.id)}
                        disabled={refreshing === connection.id || connection.status === 'error'}
                        className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
                      >
                        {refreshing === connection.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          'Check Now'
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => deleteConnection(connection.id)}
                      className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Configuration */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-medium text-gray-900">AI Configuration</h2>
          <p className="mt-1 text-sm text-gray-500">
            Set confidence thresholds for automated actions (0-100%)
          </p>
          
          <div className="mt-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Auto-generate quotes
              </label>
              <p className="text-sm text-gray-500">
                Automatically send quotes when confidence is above this threshold
              </p>
              <div className="mt-2 flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={confidenceThresholds.autoQuote}
                  onChange={(e) => setConfidenceThresholds({
                    ...confidenceThresholds,
                    autoQuote: parseInt(e.target.value)
                  })}
                  className="flex-1"
                />
                <span className="w-12 text-sm font-medium">{confidenceThresholds.autoQuote}%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Auto-select carriers
              </label>
              <p className="text-sm text-gray-500">
                Automatically book carriers when confidence is above this threshold
              </p>
              <div className="mt-2 flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={confidenceThresholds.autoCarrierSelect}
                  onChange={(e) => setConfidenceThresholds({
                    ...confidenceThresholds,
                    autoCarrierSelect: parseInt(e.target.value)
                  })}
                  className="flex-1"
                />
                <span className="w-12 text-sm font-medium">{confidenceThresholds.autoCarrierSelect}%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Auto-dispatch loads
              </label>
              <p className="text-sm text-gray-500">
                Automatically dispatch to carriers when confidence is above this threshold
              </p>
              <div className="mt-2 flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={confidenceThresholds.autoDispatch}
                  onChange={(e) => setConfidenceThresholds({
                    ...confidenceThresholds,
                    autoDispatch: parseInt(e.target.value)
                  })}
                  className="flex-1"
                />
                <span className="w-12 text-sm font-medium">{confidenceThresholds.autoDispatch}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* OAuth Setup Instructions */}
        <div className="rounded-lg bg-yellow-50 p-4">
          <h3 className="font-semibold text-yellow-900 mb-2">Setup Instructions</h3>
          <p className="text-sm text-yellow-800 mb-3">
            To enable email monitoring:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-yellow-700">
            <li>
              <strong className="text-red-700">IMPORTANT:</strong> Run the loads table migration in Supabase SQL Editor:
              <pre className="mt-2 bg-yellow-100 p-2 rounded text-xs overflow-x-auto">
{`-- Copy contents of /supabase/migrations/create_loads_tables.sql`}
              </pre>
            </li>
            <li>
              <strong>For Gmail:</strong> OAuth is already configured ✓
            </li>
            <li>
              <strong>For Outlook:</strong> Configure OAuth in{' '}
              <a
                href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Azure Portal
              </a>
            </li>
          </ol>
        </div>

        <div className="flex justify-end">
          <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            <Save className="h-4 w-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}