import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { processImapAccounts } from '@/lib/email/imap-processor'
import { processOAuthAccounts } from '@/lib/email/oauth-processor'

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const headersList = await headers()
  const authHeader = headersList.get('authorization')
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // Process emails from all sources in parallel
    const results = await Promise.allSettled([
      processImapAccounts(),
      processOAuthAccounts(),
    ])

    const summary = {
      imap: results[0].status === 'fulfilled' ? 'success' : 'failed',
      oauth: results[1].status === 'fulfilled' ? 'success' : 'failed',
      timestamp: new Date().toISOString(),
    }

    // Log any errors
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Email processing failed for ${index === 0 ? 'IMAP' : 'OAuth'}:`, result.reason)
      }
    })

    return NextResponse.json({
      success: true,
      summary,
    })
  } catch (error: any) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process emails' },
      { status: 500 }
    )
  }
}

// For Vercel Cron, also support POST
export async function POST(request: NextRequest) {
  return GET(request)
}