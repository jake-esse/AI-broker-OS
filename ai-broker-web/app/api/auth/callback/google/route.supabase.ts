import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { GOOGLE_OAUTH_CONFIG } from '@/lib/oauth/config'
import { createOrUpdateUser, setSession } from '@/lib/auth/direct-auth'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/auth/login?error=${encodeURIComponent(error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/auth/login?error=${encodeURIComponent('Missing code')}`
    )
  }

  try {
    // Exchange code for tokens
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_OAUTH_CONFIG.clientId,
      GOOGLE_OAUTH_CONFIG.clientSecret,
      GOOGLE_OAUTH_CONFIG.redirectUri
    )

    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: profile } = await oauth2.userinfo.get()

    if (!profile.email) {
      throw new Error('No email found in Google profile')
    }

    // Create or update user
    const user = await createOrUpdateUser({
      email: profile.email,
      name: profile.name || undefined,
      provider: 'google'
    })

    // Set session
    await setSession(user.id)

    // Get broker record or create if it doesn't exist
    const supabase = await createClient()
    let { data: broker } = await supabase
      .from('brokers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!broker) {
      // Create broker record if it doesn't exist
      const { data: newBroker, error: brokerError } = await supabase
        .from('brokers')
        .insert({
          user_id: user.id,
          email: profile.email,
          company_name: profile.name || profile.email.split('@')[0],
          subscription_tier: 'trial',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()
      
      if (brokerError) {
        console.error('Failed to create broker record:', brokerError)
        throw new Error('Failed to create broker profile')
      }
      
      broker = newBroker
    }

    // Store email connection with OAuth tokens
    const { error: connectionError } = await supabase
      .from('email_connections')
      .upsert({
        user_id: user.id,
        broker_id: broker.id,
        provider: 'gmail',
        email: profile.email,
        oauth_access_token: tokens.access_token || '',
        oauth_refresh_token: tokens.refresh_token || '',
        oauth_token_expires_at: tokens.expiry_date 
          ? new Date(tokens.expiry_date).toISOString()
          : new Date(Date.now() + 3600 * 1000).toISOString(),
        status: 'connected',
        is_primary: true, // First connection is primary
        last_check: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider,email'
      })
    
    if (connectionError) {
      console.error('Failed to store email connection:', connectionError)
      // Continue anyway since the user is authenticated
    }

    // Trigger initial email check
    try {
      await fetch(`${process.env.NEXT_PUBLIC_URL}/api/emails/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker_id: broker.id,
          is_initial: true
        })
      })
    } catch (error) {
      console.error('Failed to trigger initial email check:', error)
    }

    // Redirect to dashboard
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/`)
  } catch (error) {
    console.error('Google OAuth error:', error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/auth/login?error=${encodeURIComponent('Authentication failed')}`
    )
  }
}