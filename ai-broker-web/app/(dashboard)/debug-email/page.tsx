'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

export default function DebugEmailPage() {
  const [debugData, setDebugData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => {
    loadDebugData()
  }, [])

  const loadDebugData = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/debug/email-processing')
      const data = await response.json()
      setDebugData(data)
    } catch (error) {
      console.error('Error loading debug data:', error)
    } finally {
      setLoading(false)
    }
  }

  const testEmailProcessing = async () => {
    try {
      const response = await fetch('/api/debug/email-processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testEmail: {
            subject: 'Load Request - Chicago to NYC',
            content: `
Hi,

I need a quote for the following shipment:
Pickup: Chicago, IL 60601
Delivery: New York, NY 10001
Weight: 25,000 lbs
Commodity: General Freight
Pickup Date: Tomorrow

Please send your best rate.

Thanks
            `
          }
        })
      })
      const result = await response.json()
      setTestResult(result)
      // Reload debug data
      await loadDebugData()
    } catch (error) {
      console.error('Error testing email:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Email Processing Debug</h1>
        <p className="mt-1 text-sm text-gray-500">
          Debug information for email intake and load creation
        </p>
      </div>

      {/* Test Email Button */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Test Email Processing</h2>
        <button
          onClick={testEmailProcessing}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Create & Process Test Email
        </button>
        
        {testResult && (
          <div className="mt-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <h3 className="font-medium mb-2">LLM Processing Result:</h3>
              <pre className="text-xs overflow-auto">
                {JSON.stringify(testResult.processingResult, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Broker Info */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Broker Information</h2>
        <div className="space-y-2 text-sm">
          <div><strong>ID:</strong> {debugData?.broker?.id}</div>
          <div><strong>Email:</strong> {debugData?.broker?.email}</div>
          <div><strong>Company:</strong> {debugData?.broker?.companyName}</div>
          <div><strong>Total Emails:</strong> {debugData?.emailCount}</div>
          <div><strong>Total Loads:</strong> {debugData?.loadCount}</div>
        </div>
      </div>

      {/* Email Processing Results */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Email Processing Results</h2>
        <div className="space-y-4">
          {debugData?.emailProcessingResults?.map((result: any, index: number) => (
            <div key={result.emailId} className="border-t pt-4 first:border-t-0 first:pt-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium">Email {index + 1}</h3>
                  <div className="text-sm space-y-1 mt-2">
                    <div><strong>From:</strong> {result.from}</div>
                    <div><strong>Subject:</strong> {result.subject}</div>
                    <div><strong>Received:</strong> {new Date(result.receivedAt).toLocaleString()}</div>
                    <div><strong>Status:</strong> {result.status}</div>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium">LLM Processing Result</h3>
                  <div className="text-sm space-y-1 mt-2">
                    <div><strong>Action:</strong> {result.processingResult.action}</div>
                    <div><strong>Confidence:</strong> {result.processingResult.confidence}%</div>
                    {result.processingResult.reason && (
                      <div><strong>Reason:</strong> {result.processingResult.reason}</div>
                    )}
                    {result.processingResult.extracted_data && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-blue-600">Extracted Data</summary>
                        <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-auto">
                          {JSON.stringify(result.processingResult.extracted_data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
              {result.contentPreview && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-blue-600 text-sm">Email Content Preview</summary>
                  <pre className="mt-1 text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap">
                    {result.contentPreview}...
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Loads */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Loads</h2>
        <div className="space-y-2">
          {debugData?.recentLoads?.map((load: any) => (
            <div key={load.id} className="text-sm border-b pb-2">
              <div><strong>ID:</strong> {load.id}</div>
              <div><strong>Status:</strong> {load.status}</div>
              <div><strong>Route:</strong> {load.originZip} → {load.destZip}</div>
              <div><strong>Created:</strong> {new Date(load.createdAt).toLocaleString()}</div>
              <div><strong>Source:</strong> {load.sourceType}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}