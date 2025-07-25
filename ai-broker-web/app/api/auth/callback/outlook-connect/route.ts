import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForToken } from '@/lib/oauth/microsoft'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import { cookies } from 'next/headers'
import { getBrokerByUserId, createEmailConnection } from '@/lib/database/operations'

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
    const broker = await getBrokerByUserId(currentUser.id)

    if (!broker) {
      throw new Error('Broker record not found')
    }

    // Store additional email connection
    const connectionData = {
      userId: currentUser.id,
      brokerId: broker.id,
      provider: 'oauth_outlook',
      email: emailAddress,
      oauthAccessToken: tokens.access_token,
      oauthRefreshToken: tokens.refresh_token,
      oauthTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      status: 'active',
      isPrimary: false, // Additional connections are not primary
    }
    
    console.log('Saving email connection:', connectionData)
    
    const savedConnection = await createEmailConnection(connectionData)
      
    console.log('Save result:', savedConnection)

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