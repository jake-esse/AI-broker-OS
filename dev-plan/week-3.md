# Week 3: Web Application Foundation

**Status**: TODO

## Day 1-3: Next.js Setup & Authentication

### Project Initialization

```bash
# Create Next.js project
npx create-next-app@latest ai-broker-web --typescript --tailwind --app

# Install dependencies
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install @radix-ui/react-dialog @radix-ui/react-tabs
npm install react-hook-form zod @hookform/resolvers
npm install @tanstack/react-query axios
npm install framer-motion
```

### Authentication Setup

```typescript
// app/auth/login/page.tsx
'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (error) {
      alert('Error: ' + error.message)
    } else {
      alert('Check your email for the login link!')
    }
    
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="text-3xl font-bold">Sign in to AI-Broker</h2>
          <p className="mt-2 text-gray-600">
            Enter your email to receive a magic link
          </p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-4 py-3"
            required
          />
          
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

## Day 4-5: Quote Request Interface

### Quote Request Form

```typescript
// app/dashboard/new-quote/page.tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

const quoteSchema = z.object({
  origin_city: z.string().min(2),
  origin_state: z.string().length(2),
  origin_zip: z.string().regex(/^\d{5}$/),
  dest_city: z.string().min(2),
  dest_state: z.string().length(2),
  dest_zip: z.string().regex(/^\d{5}$/),
  pickup_date: z.string(),
  delivery_date: z.string().optional(),
  commodity: z.string().min(3),
  weight_lbs: z.number().min(1).max(48000),
  special_requirements: z.string().optional(),
})

type QuoteFormData = z.infer<typeof quoteSchema>

export default function NewQuotePage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [generatedQuote, setGeneratedQuote] = useState(null)
  const router = useRouter()
  const supabase = createClientComponentClient()
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<QuoteFormData>({
    resolver: zodResolver(quoteSchema),
  })

  const onSubmit = async (data: QuoteFormData) => {
    setIsSubmitting(true)
    
    try {
      // Call your quote generation API
      const response = await fetch('/api/quotes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      
      const quote = await response.json()
      setGeneratedQuote(quote)
      
    } catch (error) {
      console.error('Error generating quote:', error)
      alert('Failed to generate quote')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (generatedQuote) {
    return <QuoteDisplay quote={generatedQuote} />
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-8 text-3xl font-bold">Generate FTL Quote</h1>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Origin Section */}
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Origin</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium">City</label>
              <input
                {...register('origin_city')}
                className="mt-1 w-full rounded border px-3 py-2"
                placeholder="Los Angeles"
              />
              {errors.origin_city && (
                <p className="text-sm text-red-600">{errors.origin_city.message}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium">State</label>
              <input
                {...register('origin_state')}
                className="mt-1 w-full rounded border px-3 py-2"
                placeholder="CA"
                maxLength={2}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium">ZIP</label>
              <input
                {...register('origin_zip')}
                className="mt-1 w-full rounded border px-3 py-2"
                placeholder="90001"
              />
            </div>
          </div>
        </div>

        {/* Destination Section */}
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Destination</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium">City</label>
              <input
                {...register('dest_city')}
                className="mt-1 w-full rounded border px-3 py-2"
                placeholder="Dallas"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium">State</label>
              <input
                {...register('dest_state')}
                className="mt-1 w-full rounded border px-3 py-2"
                placeholder="TX"
                maxLength={2}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium">ZIP</label>
              <input
                {...register('dest_zip')}
                className="mt-1 w-full rounded border px-3 py-2"
                placeholder="75201"
              />
            </div>
          </div>
        </div>

        {/* Load Details */}
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Load Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Pickup Date</label>
              <input
                {...register('pickup_date')}
                type="date"
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium">Delivery Date (Optional)</label>
              <input
                {...register('delivery_date')}
                type="date"
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium">Commodity</label>
              <input
                {...register('commodity')}
                className="mt-1 w-full rounded border px-3 py-2"
                placeholder="General Freight"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium">Weight (lbs)</label>
              <input
                {...register('weight_lbs', { valueAsNumber: true })}
                type="number"
                className="mt-1 w-full rounded border px-3 py-2"
                placeholder="35000"
              />
            </div>
          </div>
          
          <div className="mt-4">
            <label className="block text-sm font-medium">Special Requirements</label>
            <textarea
              {...register('special_requirements')}
              className="mt-1 w-full rounded border px-3 py-2"
              rows={3}
              placeholder="Any special handling, equipment needs, etc."
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Generating Quote...' : 'Generate Quote'}
        </button>
      </form>
    </div>
  )
}

// Quote Display Component
function QuoteDisplay({ quote }: { quote: any }) {
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="rounded-lg bg-green-50 p-6">
        <h2 className="text-2xl font-bold text-green-800">Quote Generated!</h2>
        <div className="mt-4 space-y-2">
          <p className="text-3xl font-bold">${quote.quoted_rate.toLocaleString()}</p>
          <p className="text-gray-600">
            {quote.distance_miles} miles • Valid for 24 hours
          </p>
          <p className="text-sm text-gray-600">
            Market Rate: ${quote.market_rate.toLocaleString()} • 
            Confidence: {(quote.confidence_score * 100).toFixed(0)}%
          </p>
        </div>
        
        <div className="mt-6 flex gap-4">
          <button className="rounded bg-blue-600 px-6 py-2 text-white">
            Send to Customer
          </button>
          <button className="rounded border px-6 py-2">
            Adjust Quote
          </button>
        </div>
      </div>
    </div>
  )
}
```

## Key Deliverables
- Next.js application setup with TypeScript
- Supabase authentication integration
- Magic link login system
- Comprehensive quote request form
- Real-time form validation
- Quote display component
- Responsive UI with Tailwind CSS

## Technical Stack
- **Framework**: Next.js 14 with App Router
- **Authentication**: Supabase Auth
- **Forms**: React Hook Form + Zod
- **UI**: Tailwind CSS + Radix UI
- **State**: React Query
- **Validation**: Zod schemas

## Next Steps
- API route implementation
- Dashboard layout
- Quote history view
- User settings page
- Email notification templates