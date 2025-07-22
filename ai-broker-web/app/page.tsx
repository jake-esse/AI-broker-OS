'use client'

import { LoadsTable } from '@/components/loads/LoadsTable'
import { useLoads } from '@/lib/queries/loads'
import { Loader2 } from 'lucide-react'

export default function HomePage() {
  const { data: loads, isLoading } = useLoads()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Loads</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your freight operations with AI assistance
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <LoadsTable loads={loads || []} />
      )}
    </div>
  )
}