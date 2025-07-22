'use client'

import { useState } from 'react'
import { Loader2, Mail, CheckCircle, XCircle } from 'lucide-react'

export default function TestEmailPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string>('')

  const triggerEmailCheck = async () => {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/test/email-check')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check emails')
      }

      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold">Email Monitoring Test</h1>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Test Email Processing
          </h2>

          <div className="mb-6 rounded-lg bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              <strong>Instructions:</strong>
            </p>
            <ol className="mt-2 list-decimal list-inside space-y-1 text-sm text-blue-700">
              <li>Send a quote request email to your registered email address</li>
              <li>Wait a moment for the email to arrive</li>
              <li>Click "Check Emails Now" to manually trigger processing</li>
              <li>Check your dashboard to see if a new load was created</li>
            </ol>
          </div>

          <div className="mb-6 rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-700">
              <strong>Example Quote Request:</strong>
            </p>
            <p className="mt-2 text-sm font-mono text-gray-600">
              Subject: Quote Request - Los Angeles to Chicago<br />
              <br />
              Hi, I need a quote for:<br />
              - Pickup: Los Angeles, CA<br />
              - Delivery: Chicago, IL<br />
              - Weight: 42,000 lbs<br />
              - Commodity: General Freight<br />
              - Pickup Date: Next Monday<br />
              <br />
              Please send quote ASAP.
            </p>
          </div>

          <button
            onClick={triggerEmailCheck}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking Emails...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                Check Emails Now
              </>
            )}
          </button>

          {result && (
            <div className="mt-6 rounded-lg bg-green-50 p-4">
              <h3 className="font-semibold text-green-900 flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Email Check Complete
              </h3>
              <pre className="mt-2 text-sm text-green-700 overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-lg bg-red-50 p-4">
              <h3 className="font-semibold text-red-900 flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Error
              </h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="mt-8 rounded-lg bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> For Gmail/Outlook OAuth authentication through Supabase, 
            direct email access requires additional setup. For now, you may need to use IMAP 
            authentication for email monitoring to work properly.
          </p>
        </div>
      </div>
    </div>
  )
}