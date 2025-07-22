import { FileText, Download, ExternalLink } from 'lucide-react'

interface Document {
  id: string
  name: string
  type: string
  url?: string
  size?: number
}

interface DocumentViewerProps {
  documents: Document[]
}

export function DocumentViewer({ documents }: DocumentViewerProps) {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900">{doc.name}</p>
              {doc.size && (
                <p className="text-xs text-gray-500">{formatFileSize(doc.size)}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {doc.url && (
              <>
                <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  <Download className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}