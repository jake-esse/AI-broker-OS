import { NextRequest, NextResponse } from 'next/server'
import * as db from '@/lib/database/operations'
import { MICROSOFT_OAUTH_CONFIG } from '@/lib/oauth/config'
import * as db from '@/lib/database/operations'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const supabase = await createClient()

  // Handle OAuth errors
  if (error) {
    console.error('Microsoft OAuth error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?error=oauth_failed`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?error=invalid_request`)
  }

  try {
    // Verify state to prevent CSRF
    const { data: stateData } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .single()

    if (!stateData || new Date(stateData.expires_at) < new Date()) {
      throw new Error('Invalid or expired state')
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(MICROSOFT_OAUTH_CONFIG.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: MICROSOFT_OAUTH_CONFIG.clientId,
        client_secret: MICROSOFT_OAUTH_CONFIG.clientSecret,
        redirect_uri: MICROSOFT_OAUTH_CONFIG.redirectUri,
        grant_type: 'authorization_code',
        scope: MICROSOFT_OAUTH_CONFIG.scopes.join(' '),
      }),
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error('Token exchange failed:', error)
      throw new Error('Failed to exchange code for tokens')
    }

    const tokens = await tokenResponse.json()

    // Get user email from token
    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info')
    }

    const userInfo = await userInfoResponse.json()

    // Store or update email connection
    const { error: upsertError } = await supabase
      .from('email_connections')
      .upsert({
        broker_id: stateData.user_id,
        email: userInfo.mail || userInfo.userPrincipalName,
        provider: 'outlook',
        status: 'active',
        oauth_access_token: tokens.access_token,
        oauth_refresh_token: tokens.refresh_token,
        oauth_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        last_checked: new Date().toISOString(),
      }, {
        onConflict: 'broker_id,email,provider',
      })

    if (upsertError) {
      console.error('Failed to store email connection:', upsertError)
      throw new Error('Failed to save email connection')
    }

    // Clean up state
    await supabase
      .from('oauth_states')
      .delete()
      .eq('state', state)

    // Redirect to settings with success message
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?success=microsoft_connected`)
  } catch (error: any) {
    console.error('Microsoft OAuth callback error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?error=connection_failed`)
  }
}