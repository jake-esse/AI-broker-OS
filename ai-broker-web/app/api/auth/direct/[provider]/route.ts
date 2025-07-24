import { NextRequest, NextResponse } from 'next/server'
import { generateOAuthUrl } from '@/lib/oauth/config'
import { cookies } from 'next/headers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerParam } = await params
  const provider = providerParam as 'google' | 'microsoft'
  
  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  // Generate a simple state parameter for CSRF protection
  const state = Math.random().toString(36).substring(7)
  
  // Store state in a cookie for verification later
  const cookieStore = await cookies()
  cookieStore.set(`oauth-state-${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/'
  })

  // Generate OAuth URL and redirect
  const authUrl = generateOAuthUrl(provider, state)
  
  return NextResponse.redirect(authUrl)
}