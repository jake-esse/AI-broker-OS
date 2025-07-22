'use client'

import { useState } from 'react'
import { Save } from 'lucide-react'

export default function SettingsPage() {
  const [confidenceThresholds, setConfidenceThresholds] = useState({
    autoQuote: 85,
    autoCarrierSelect: 75,
    autoDispatch: 90,
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your AI assistant and account preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Account Settings */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-medium text-gray-900">Account Information</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email Connection</label>
              <p className="mt-1 text-sm text-gray-500">Connected via Gmail</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Company Name</label>
              <input
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="Your Company LLC"
              />
            </div>
          </div>
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

        {/* Notification Preferences */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-medium text-gray-900">Notification Preferences</h2>
          <div className="mt-4 space-y-4">
            <label className="flex items-start">
              <input type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600" defaultChecked />
              <span className="ml-3">
                <span className="block text-sm font-medium text-gray-700">Action Required</span>
                <span className="block text-sm text-gray-500">Notify when AI needs human input</span>
              </span>
            </label>
            
            <label className="flex items-start">
              <input type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600" defaultChecked />
              <span className="ml-3">
                <span className="block text-sm font-medium text-gray-700">Load Updates</span>
                <span className="block text-sm text-gray-500">Notify on major load status changes</span>
              </span>
            </label>
            
            <label className="flex items-start">
              <input type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600" />
              <span className="ml-3">
                <span className="block text-sm font-medium text-gray-700">Daily Summary</span>
                <span className="block text-sm text-gray-500">Receive daily performance summary</span>
              </span>
            </label>
          </div>
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