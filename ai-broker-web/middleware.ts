import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')
  const pathname = request.nextUrl.pathname

  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/login',
    '/api/auth/direct',
    '/api/auth/callback',
    '/api/auth/signout',
  ]
  
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  
  // If no token and trying to access protected route
  if (!token && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  
  // If has token, verify it's not expired (basic check)
  if (token) {
    try {
      // For now, just check if token exists
      // In production, you'd verify the JWT properly
      const hasValidToken = token.value && token.value.length > 0
      
      if (!hasValidToken) {
        // Invalid token, clear it and redirect to login
        const response = NextResponse.redirect(new URL('/login', request.url))
        response.cookies.delete('auth-token')
        return response
      }
    } catch (error) {
      // Error verifying token
      const response = NextResponse.redirect(new URL('/login', request.url))
      response.cookies.delete('auth-token')
      return response
    }
    
    // If user is trying to access login page while logged in
    if (pathname === '/login' && hasValidToken) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     * - api routes we want to exclude
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}