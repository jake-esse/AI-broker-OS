'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Clock, CheckCircle, AlertCircle } from 'lucide-react'

interface ClarificationStats {
  statistics: {
    total: number
    pending: number
    responded: number
    converted: number
    conversionRate: string
    averageResponseTimeMinutes: number | null
  }
  recentRequests: Array<{
    id: string
    shipperEmail: string
    freightType: string
    missingFields: string[]
    responseReceived: boolean
    loadCreated: boolean
    responseTime: number | null
    createdAt: string
  }>
}

export function ClarificationStats() {
  const [stats, setStats] = useState<ClarificationStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const response = await fetch('/api/clarifications/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error loading clarification stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const { statistics } = stats

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Clarification Requests
        </h3>
        <button
          onClick={loadStats}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="text-center">
          <div className="text-2xl font-semibold text-gray-900">
            {statistics.total}
          </div>
          <div className="text-xs text-gray-500">Total Sent</div>
        </div>
        
        <div className="text-center">
          <div className="text-2xl font-semibold text-yellow-600">
            {statistics.pending}
          </div>
          <div className="text-xs text-gray-500">Awaiting Response</div>
        </div>
        
        <div className="text-center">
          <div className="text-2xl font-semibold text-green-600">
            {statistics.converted}
          </div>
          <div className="text-xs text-gray-500">Loads Created</div>
        </div>
        
        <div className="text-center">
          <div className="text-2xl font-semibold text-blue-600">
            {statistics.conversionRate}
          </div>
          <div className="text-xs text-gray-500">Conversion Rate</div>
        </div>
      </div>

      {statistics.averageResponseTimeMinutes && (
        <div className="mb-6 p-3 bg-gray-50 rounded-lg flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-600">
            Average response time: {statistics.averageResponseTimeMinutes} minutes
          </span>
        </div>
      )}

      {stats.recentRequests.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Recent Requests</h4>
          <div className="space-y-2">
            {stats.recentRequests.slice(0, 5).map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
              >
                <div className="flex items-center gap-2">
                  {request.loadCreated ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : request.responseReceived ? (
                    <Clock className="h-4 w-4 text-blue-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                  )}
                  <span className="text-gray-700">{request.shipperEmail}</span>
                  <span className="text-gray-500">({request.freightType})</span>
                </div>
                <div className="text-xs text-gray-500">
                  {request.responseTime ? `${request.responseTime}m` : 'Pending'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}