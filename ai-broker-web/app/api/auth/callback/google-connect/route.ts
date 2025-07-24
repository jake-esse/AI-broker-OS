import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { GOOGLE_OAUTH_CONFIG } from '@/lib/oauth/config'
import { getCurrentUser } from '@/lib/auth/direct-auth'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/settings?error=${encodeURIComponent(error)}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/settings?error=${encodeURIComponent('Missing code or state')}`
    )
  }

  try {
    // Verify state
    const cookieStore = await cookies()
    const storedState = cookieStore.get('oauth-state-connect-google')
    
    if (!storedState || storedState.value !== state) {
      throw new Error('Invalid state parameter')
    }
    
    // Parse state to get user info
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    
    // Verify current user matches the state
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.id !== stateData.userId) {
      throw new Error('User mismatch')
    }

    // Exchange code for tokens
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_OAUTH_CONFIG.clientId,
      GOOGLE_OAUTH_CONFIG.clientSecret,
      `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/google-connect`
    )

    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: profile } = await oauth2.userinfo.get()

    if (!profile.email) {
      throw new Error('No email found in Google profile')
    }

    // Get broker record
    const supabase = await createClient()
    const { data: broker } = await supabase
      .from('brokers')
      .select('id')
      .eq('user_id', currentUser.id)
      .single()

    if (!broker) {
      throw new Error('Broker record not found')
    }

    // Store additional email connection
    await supabase
      .from('email_connections')
      .upsert({
        user_id: currentUser.id,
        broker_id: broker.id,
        provider: 'gmail',
        email: profile.email,
        oauth_access_token: tokens.access_token || '',
        oauth_refresh_token: tokens.refresh_token || '',
        oauth_token_expires_at: tokens.expiry_date 
          ? new Date(tokens.expiry_date).toISOString()
          : new Date(Date.now() + 3600 * 1000).toISOString(),
        status: 'active',
        is_primary: false, // Additional connections are not primary
        last_checked: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider,email'
      })

    // Clear state cookie
    cookieStore.delete('oauth-state-connect-google')

    // Redirect to settings with success
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/settings?success=${encodeURIComponent('Gmail account connected successfully')}`
    )
  } catch (error) {
    console.error('Google Connect OAuth error:', error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/settings?error=${encodeURIComponent('Failed to connect Gmail account')}`
    )
  }
}