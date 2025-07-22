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
    console.log('Manual email check triggered by user:', user.email)
    
    // Process emails from all sources in parallel
    const results = await Promise.allSettled([
      processImapAccounts(),
      processOAuthAccounts(),
    ])

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