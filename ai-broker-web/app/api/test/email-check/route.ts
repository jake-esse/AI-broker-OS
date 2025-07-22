import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processImapAccounts } from '@/lib/email/imap-processor'
import { processOAuthAccounts } from '@/lib/email/oauth-processor'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  // Check if user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    console.log('=== Manual email check triggered ===')
    console.log('User:', user.email)
    console.log('User ID:', user.id)
    console.log('Timestamp:', new Date().toISOString())
    
    // Process emails from all sources in parallel
    console.log('Starting email processing...')
    const results = await Promise.allSettled([
      processImapAccounts().catch(err => {
        console.error('IMAP processing error:', err)
        throw err
      }),
      processOAuthAccounts().catch(err => {
        console.error('OAuth processing error:', err)
        throw err
      }),
    ])

    console.log('Processing results:', results)

    const summary = {
      imap: results[0].status === 'fulfilled' ? results[0].value : { error: results[0].reason?.message || 'Failed' },
      oauth: results[1].status === 'fulfilled' ? results[1].value : { error: results[1].reason?.message || 'Failed' },
      timestamp: new Date().toISOString(),
      triggeredBy: user.email,
    }

    // Log any errors
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Email processing failed for ${index === 0 ? 'IMAP' : 'OAuth'}:`, result.reason)
      } else {
        console.log(`Email processing succeeded for ${index === 0 ? 'IMAP' : 'OAuth'}:`, result.value)
      }
    })

    console.log('=== Email check complete ===')
    console.log('Summary:', JSON.stringify(summary, null, 2))

    return NextResponse.json({
      success: true,
      summary,
    })
  } catch (error: any) {
    console.error('Manual email check error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process emails' },
      { status: 500 }
    )
  }
}