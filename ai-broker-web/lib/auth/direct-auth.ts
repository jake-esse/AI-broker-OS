import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import jwt from 'jsonwebtoken'

// Generate a secure session token
export function generateSessionToken(userId: string): string {
  const secret = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-secret'
  return jwt.sign(
    { 
      userId, 
      iat: Date.now() / 1000,
      exp: Date.now() / 1000 + (30 * 24 * 60 * 60) // 30 days
    },
    secret
  )
}

// Verify session token
export function verifySessionToken(token: string): { userId: string } | null {
  try {
    const secret = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-secret'
    const decoded = jwt.verify(token, secret) as any
    return { userId: decoded.userId }
  } catch (error) {
    return null
  }
}

// Set session cookie
export async function setSession(userId: string) {
  const token = generateSessionToken(userId)
  const cookieStore = await cookies()
  
  cookieStore.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/'
  })
}

// Get current user from session
export async function getCurrentUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth-token')
  
  if (!token) return null
  
  const session = verifySessionToken(token.value)
  if (!session) return null
  
  // Get user details from Supabase
  const supabase = await createClient()
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.userId)
    .single()
    
  return user
}

// Clear session
export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete('auth-token')
}

// Create or update user after OAuth
export async function createOrUpdateUser(profile: {
  email: string
  name?: string
  provider: 'google' | 'outlook'
}) {
  const supabase = await createClient()
  
  // Check if user exists
  let { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('email', profile.email)
    .single()
  
  if (existingUser) {
    // Update last login
    await supabase
      .from('users')
      .update({ 
        last_login: new Date().toISOString(),
        last_provider: profile.provider 
      })
      .eq('id', existingUser.id)
      
    return existingUser
  }
  
  // Create new user
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      provider: profile.provider,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      last_provider: profile.provider
    })
    .select()
    .single()
  
  if (error) throw error
  
  // Create associated broker record
  const { error: brokerError } = await supabase
    .from('brokers')
    .insert({
      user_id: newUser.id,
      email: profile.email,
      company_name: profile.name || profile.email.split('@')[0],
      subscription_tier: 'trial',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  
  if (brokerError) {
    console.error('Failed to create broker record:', brokerError)
  }
  
  return newUser
}