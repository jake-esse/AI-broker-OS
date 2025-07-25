export default function DashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Key performance indicators and analytics
        </p>
      </div>

      {/* Placeholder for KPI cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">Load Win Rate</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">24%</p>
          <p className="mt-1 text-sm text-green-600">+3% from last week</p>
        </div>
        
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">Loads per Day</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">12.5</p>
          <p className="mt-1 text-sm text-gray-500">Average this week</p>
        </div>
        
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">Average Margin</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">18.2%</p>
          <p className="mt-1 text-sm text-red-600">-1.5% from last week</p>
        </div>
        
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">Response Time</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">4.2m</p>
          <p className="mt-1 text-sm text-green-600">-30s from last week</p>
        </div>
      </div>

      {/* Placeholder for charts */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-medium text-gray-900">Load Volume Trend</h3>
          <div className="mt-4 h-64 bg-gray-50 rounded flex items-center justify-center text-gray-400">
            Chart placeholder
          </div>
        </div>
        
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-medium text-gray-900">Revenue by Lane</h3>
          <div className="mt-4 h-64 bg-gray-50 rounded flex items-center justify-center text-gray-400">
            Chart placeholder
          </div>
        </div>
      </div>
    </div>
  )
}