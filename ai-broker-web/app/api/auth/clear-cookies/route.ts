import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  
  // Clear all auth-related cookies
  cookieStore.delete('auth-token')
  cookieStore.delete('sb-gylxustweebxlnqaykec-auth-token-code-verifier')
  
  // Also try to clear with different path/domain combinations
  const response = NextResponse.json({ success: true, message: 'Cookies cleared' })
  
  // Set cookies to expire
  response.cookies.set('auth-token', '', {
    maxAge: 0,
    path: '/'
  })
  response.cookies.set('sb-gylxustweebxlnqaykec-auth-token-code-verifier', '', {
    maxAge: 0,
    path: '/'
  })
  
  return response
}