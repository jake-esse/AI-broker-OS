import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { GOOGLE_OAUTH_CONFIG } from '@/lib/oauth/config'
import { createOrUpdateUser, setSession } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'

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
    let broker = await prisma.broker.findFirst({
      where: { userId: user.id }
    })

    if (!broker) {
      // Create broker record if it doesn't exist
      broker = await prisma.broker.create({
        data: {
          userId: user.id,
          email: profile.email,
          companyName: profile.name || profile.email.split('@')[0],
          subscriptionTier: 'trial'
        }
      })
    }

    // Store email connection with OAuth tokens
    await prisma.emailConnection.upsert({
      where: {
        userId_provider_email: {
          userId: user.id,
          provider: 'gmail',
          email: profile.email
        }
      },
      update: {
        oauthAccessToken: tokens.access_token || '',
        oauthRefreshToken: tokens.refresh_token || '',
        oauthTokenExpiresAt: tokens.expiry_date 
          ? new Date(tokens.expiry_date)
          : new Date(Date.now() + 3600 * 1000),
        status: 'active',
        lastChecked: new Date(),
        errorMessage: null
      },
      create: {
        userId: user.id,
        brokerId: broker.id,
        provider: 'gmail',
        email: profile.email,
        oauthAccessToken: tokens.access_token || '',
        oauthRefreshToken: tokens.refresh_token || '',
        oauthTokenExpiresAt: tokens.expiry_date 
          ? new Date(tokens.expiry_date)
          : new Date(Date.now() + 3600 * 1000),
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
    console.error('Google OAuth error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/auth/login?error=${encodeURIComponent('Authentication failed')}`
    )
  }
}