import { NextRequest, NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth/direct-auth-prisma'

export async function POST(request: NextRequest) {
  try {
    // Clear the session
    const response = await clearSession()
    
    // Return success response
    return NextResponse.json(
      { message: 'Successfully signed out' },
      { 
        status: 200,
        headers: response.headers 
      }
    )
  } catch (error) {
    console.error('Signout error:', error)
    
    return NextResponse.json(
      { error: 'Failed to sign out' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Also support GET requests for signout
  return POST(request)
}