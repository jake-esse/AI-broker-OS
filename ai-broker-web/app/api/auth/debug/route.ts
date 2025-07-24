import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const authToken = cookieStore.get('auth-token')
  
  const allCookies = cookieStore.getAll().map(c => ({
    name: c.name,
    hasValue: !!c.value,
    length: c.value?.length || 0
  }))
  
  return NextResponse.json({
    hasAuthToken: !!authToken,
    authTokenLength: authToken?.value?.length || 0,
    allCookies,
    headers: {
      cookie: request.headers.get('cookie'),
    }
  })
}