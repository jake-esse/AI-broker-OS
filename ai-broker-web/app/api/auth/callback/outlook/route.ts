import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForToken } from '@/lib/oauth/microsoft'
import { createOrUpdateUser, setSession } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/auth/login?error=${encodeURIComponent(
        errorDescription || error || 'OAuth authorization failed'
      )}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/auth/login?error=${encodeURIComponent(
        'Missing authorization code'
      )}`
    )
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForToken(code)
    
    if (!tokens) {
      throw new Error('Failed to exchange authorization code')
    }

    // Get user profile from Microsoft Graph
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    })
    
    if (!userResponse.ok) {
      throw new Error('Failed to get user profile')
    }
    
    const profile = await userResponse.json()
    const emailAddress = profile.mail || profile.userPrincipalName
    
    if (!emailAddress) {
      throw new Error('No email found in Microsoft profile')
    }

    // Create or update user
    const user = await createOrUpdateUser({
      email: emailAddress,
      name: profile.displayName || undefined,
      provider: 'outlook'
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
          email: emailAddress,
          companyName: profile.displayName || emailAddress.split('@')[0],
          subscriptionTier: 'trial'
        }
      })
    }

    // Store email connection with OAuth tokens
    await prisma.emailConnection.upsert({
      where: {
        userId_provider_email: {
          userId: user.id,
          provider: 'outlook',
          email: emailAddress
        }
      },
      update: {
        oauthAccessToken: tokens.access_token,
        oauthRefreshToken: tokens.refresh_token,
        oauthTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        status: 'active',
        lastChecked: new Date(),
        errorMessage: null
      },
      create: {
        userId: user.id,
        brokerId: broker.id,
        provider: 'outlook',
        email: emailAddress,
        oauthAccessToken: tokens.access_token,
        oauthRefreshToken: tokens.refresh_token,
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

    // Redirect to dashboard
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/`)
  } catch (error) {
    console.error('Microsoft OAuth error:', error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/auth/login?error=${encodeURIComponent('Authentication failed')}`
    )
  }
}