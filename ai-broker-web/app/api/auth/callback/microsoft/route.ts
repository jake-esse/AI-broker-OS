import { NextRequest, NextResponse } from 'next/server'
import { MICROSOFT_OAUTH_CONFIG } from '@/lib/oauth/config'
import { createOrUpdateUser, setSession } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/login?error=${encodeURIComponent(error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/login?error=${encodeURIComponent('Missing code')}`
    )
  }

  try {
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

    // Get user info
    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info')
    }

    const userInfo = await userInfoResponse.json()
    const email = userInfo.mail || userInfo.userPrincipalName

    if (!email) {
      throw new Error('No email found in Microsoft profile')
    }

    // Create or update user
    const user = await createOrUpdateUser({
      email,
      name: userInfo.displayName || undefined,
      provider: 'microsoft'
    })

    // Set session
    await setSession(user.id)

    // Get broker record or create if it doesn't exist
    let broker = await prisma.broker.findFirst({
      where: { userId: user.id }
    })

    if (!broker) {
      // Create broker record if it doesn't exist
      broker = await prisma.broker.create({
        data: {
          userId: user.id,
          email,
          companyName: userInfo.displayName || email.split('@')[0],
          subscriptionTier: 'trial'
        }
      })
    }

    // Store email connection with OAuth tokens
    await prisma.emailConnection.upsert({
      where: {
        userId_provider_email: {
          userId: user.id,
          provider: 'oauth_outlook',
          email
        }
      },
      update: {
        oauthAccessToken: tokens.access_token || '',
        oauthRefreshToken: tokens.refresh_token || '',
        oauthTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        status: 'active',
        lastChecked: new Date(),
        errorMessage: null
      },
      create: {
        userId: user.id,
        brokerId: broker.id,
        provider: 'oauth_outlook',
        email,
        oauthAccessToken: tokens.access_token || '',
        oauthRefreshToken: tokens.refresh_token || '',
        oauthTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        status: 'active',
        isPrimary: true, // First connection is primary
        lastChecked: new Date()
      }
    })

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

    // Redirect to loads page
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/loads`)
  } catch (error) {
    console.error('Microsoft OAuth error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/login?error=${encodeURIComponent('Authentication failed')}`
    )
  }
}