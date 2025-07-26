import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    const user = await getCurrentUser()
    console.log('Email connections API - user:', user)
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get email connections for this user
    const connections = await prisma.emailConnection.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    })
    
    console.log('Found connections:', connections.length)

    // Transform to match expected format
    const transformedConnections = connections.map(conn => ({
      id: conn.id,
      email: conn.email,
      provider: conn.provider,
      status: conn.status,
      lastChecked: conn.lastChecked?.toISOString() || null,
      errorMessage: conn.errorMessage,
      hasTokens: conn.provider.startsWith('oauth') ? !!conn.oauthAccessToken : true,
      tokenExpiresAt: conn.oauthTokenExpiresAt?.toISOString() || null
    }))

    return NextResponse.json({ connections: transformedConnections })
  } catch (error) {
    console.error('Error fetching email connections:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch connections',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}