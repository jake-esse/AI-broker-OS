import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  // Clear the auth token cookie
  const cookieStore = await cookies()
  cookieStore.delete('auth-token')
  
  return NextResponse.json({ success: true })
}