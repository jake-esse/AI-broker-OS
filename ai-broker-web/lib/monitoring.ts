import * as Sentry from '@sentry/nextjs'
import posthog from 'posthog-js'

// Initialize monitoring services
export function initializeMonitoring() {
  // Initialize PostHog
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_API_KEY) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_API_KEY, {
      api_host: 'https://app.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
    })
  }
}

// Track quote generation events
export function trackQuoteGenerated(quoteData: {
  origin_state: string
  dest_state: string
  distance_miles: number
  quoted_rate: number
  confidence_score: number
  load_id: string
}) {
  // Send to PostHog
  if (typeof window !== 'undefined') {
    posthog.capture('quote_generated', {
      origin_state: quoteData.origin_state,
      dest_state: quoteData.dest_state,
      distance: quoteData.distance_miles,
      rate: quoteData.quoted_rate,
      confidence: quoteData.confidence_score,
      load_id: quoteData.load_id,
    })
    
    // Track revenue opportunity
    posthog.capture('revenue_opportunity', {
      amount: quoteData.quoted_rate * 0.20, // Estimated 20% margin
      load_id: quoteData.load_id,
    })
  }
}

// Track load creation
export function trackLoadCreated(loadData: {
  channel: string
  shipper_name: string
  origin_state: string
  dest_state: string
  weight_lbs: number
}) {
  if (typeof window !== 'undefined') {
    posthog.capture('load_created', {
      channel: loadData.channel,
      shipper: loadData.shipper_name,
      lane: `${loadData.origin_state}-${loadData.dest_state}`,
      weight: loadData.weight_lbs,
    })
  }
}

// Track email processing
export function trackEmailProcessed(emailData: {
  provider: string
  action: string
  load_created: boolean
}) {
  if (typeof window !== 'undefined') {
    posthog.capture('email_processed', {
      provider: emailData.provider,
      action: emailData.action,
      load_created: emailData.load_created,
    })
  }
}

// Track user actions
export function trackUserAction(action: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined') {
    posthog.capture(action, properties)
  }
}

// Identify user
export function identifyUser(userId: string, traits?: Record<string, any>) {
  if (typeof window !== 'undefined') {
    posthog.identify(userId, traits)
  }
}

// Track errors
export function trackError(error: Error, context?: Record<string, any>) {
  // Send to Sentry
  Sentry.captureException(error, {
    extra: context
  })
  
  // Also track in PostHog for analytics
  if (typeof window !== 'undefined') {
    posthog.capture('error_occurred', {
      error_message: error.message,
      error_name: error.name,
      ...context
    })
  }
}

// Performance monitoring
export function trackPerformance(metric: string, value: number, tags?: Record<string, string>) {
  if (typeof window !== 'undefined') {
    posthog.capture('performance_metric', {
      metric,
      value,
      ...tags
    })
  }
}

// Session recording control
export function startSessionRecording() {
  if (typeof window !== 'undefined') {
    posthog.startSessionRecording()
  }
}

export function stopSessionRecording() {
  if (typeof window !== 'undefined') {
    posthog.stopSessionRecording()
  }
}