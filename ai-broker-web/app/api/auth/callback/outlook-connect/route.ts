import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForToken } from '@/lib/oauth/microsoft'
import { getCurrentUser } from '@/lib/auth/direct-auth'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (error) {
    console.error('OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/settings?error=${encodeURIComponent(
        errorDescription || error || 'OAuth authorization failed'
      )}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/settings?error=${encodeURIComponent(
        'Missing authorization code or state'
      )}`
    )
  }

  try {
    // Verify state
    const cookieStore = await cookies()
    const storedState = cookieStore.get('oauth-state-connect-microsoft')
    
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

    // Exchange code for tokens (update the redirect URI)
    console.log('Exchanging code for tokens...')
    const tokens = await exchangeCodeForToken(code, 'outlook-connect')
    
    if (!tokens) {
      console.error('Token exchange returned null')
      throw new Error('Failed to exchange authorization code')
    }
    console.log('Successfully got tokens')

    // Get user profile from Microsoft Graph
    console.log('Fetching user profile from Microsoft Graph...')
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    })
    
    if (!userResponse.ok) {
      const errorText = await userResponse.text()
      console.error('Failed to get user profile:', userResponse.status, errorText)
      throw new Error('Failed to get user profile')
    }
    
    const profile = await userResponse.json()
    const emailAddress = profile.mail || profile.userPrincipalName
    
    if (!emailAddress) {
      throw new Error('No email found in Microsoft profile')
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
    const connectionData = {
      user_id: currentUser.id,
      broker_id: broker.id,
      provider: 'outlook',
      email: emailAddress,
      oauth_access_token: tokens.access_token,
      oauth_refresh_token: tokens.refresh_token,
      oauth_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      status: 'active',
      is_primary: false, // Additional connections are not primary
      last_checked: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    console.log('Saving email connection:', connectionData)
    
    const { data: savedConnection, error: saveError } = await supabase
      .from('email_connections')
      .upsert(connectionData, {
        onConflict: 'user_id,provider,email'
      })
      .select()
      
    console.log('Save result:', { savedConnection, saveError })
    
    if (saveError) {
      throw saveError
    }

    // Clear state cookie
    cookieStore.delete('oauth-state-connect-microsoft')

    // Redirect to settings with success
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/settings?success=${encodeURIComponent('Outlook account connected successfully')}`
    )
  } catch (error: any) {
    console.error('Microsoft Connect OAuth error:', error)
    const errorMessage = error?.message || 'Failed to connect Outlook account'
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/settings?error=${encodeURIComponent(errorMessage)}`
    )
  }
}