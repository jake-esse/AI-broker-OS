import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateOAuthUrl } from '@/lib/oauth/config'
import { getCurrentUser } from '@/lib/auth/direct-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerParam } = await params
  const provider = providerParam as 'google' | 'microsoft'
  
  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  // Check if user is authenticated with our custom auth
  const user = await getCurrentUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const supabase = await createClient()

  // Generate a state parameter to prevent CSRF attacks
  const state = Buffer.from(JSON.stringify({
    userId: user.id,
    provider,
    timestamp: Date.now(),
  })).toString('base64')

  // For additional email connections, we don't need to store state
  // since the user is already authenticated

  // Generate OAuth URL and redirect
  const authUrl = generateOAuthUrl(provider, state)
  
  return NextResponse.redirect(authUrl)
}