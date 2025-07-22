import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateOAuthUrl } from '@/lib/oauth/config'

export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider as 'google' | 'microsoft'
  
  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  const supabase = await createClient()
  
  // Check if user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Generate a state parameter to prevent CSRF attacks
  const state = Buffer.from(JSON.stringify({
    userId: user.id,
    provider,
    timestamp: Date.now(),
  })).toString('base64')

  // Store state in session for verification
  const { error: stateError } = await supabase
    .from('oauth_states')
    .insert({
      state,
      user_id: user.id,
      provider,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
    })

  if (stateError) {
    console.error('Failed to store OAuth state:', stateError)
    return NextResponse.json({ error: 'Failed to initiate OAuth' }, { status: 500 })
  }

  // Generate OAuth URL and redirect
  const authUrl = generateOAuthUrl(provider, state)
  
  return NextResponse.redirect(authUrl)
}