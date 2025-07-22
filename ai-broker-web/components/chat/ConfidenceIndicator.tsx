import { cn } from '@/lib/utils/cn'

interface ConfidenceIndicatorProps {
  score: number
}

export function ConfidenceIndicator({ score }: ConfidenceIndicatorProps) {
  const percentage = Math.round(score * 100)
  
  const getColor = () => {
    if (score >= 0.85) return 'text-green-600 bg-green-100'
    if (score >= 0.60) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getLabel = () => {
    if (score >= 0.85) return 'High'
    if (score >= 0.60) return 'Medium'
    return 'Low'
  }

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
      getColor()
    )}>
      <span>{getLabel()}</span>
      <span className="text-[10px]">({percentage}%)</span>
    </span>
  )
}