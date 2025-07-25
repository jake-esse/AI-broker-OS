import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import prisma from '@/lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const COOKIE_NAME = 'auth-token'

export interface User {
  id: string
  email: string
  name?: string | null
}

export function generateSessionToken(userId: string): string {
  return jwt.sign(
    { 
      userId, 
      iat: Date.now() / 1000,
      exp: Date.now() / 1000 + (30 * 24 * 60 * 60) // 30 days
    },
    JWT_SECRET
  )
}

export function verifySessionToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      return null
    }
    return { userId: decoded.userId }
  } catch (error) {
    return null
  }
}

export async function setSession(userId: string) {
  const token = generateSessionToken(userId)
  const cookieStore = await cookies()
  
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/'
  })
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  
  if (!token) {
    return null
  }
  
  const payload = verifySessionToken(token)
  if (!payload) {
    return null
  }
  
  try {
    if (!prisma || !prisma.user) {
      console.error('Prisma client not initialized properly')
      return null
    }
    
    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    })
    
    if (!user) {
      return null
    }
    
    return {
      id: user.id,
      email: user.email,
      name: user.name
    }
  } catch (error) {
    console.error('Error fetching user:', error)
    return null
  }
}

export async function createOrUpdateUser({
  email,
  name,
  provider
}: {
  email: string
  name?: string
  provider: string
}): Promise<User> {
  try {
    if (!prisma || !prisma.user) {
      console.error('Prisma client not initialized properly in createOrUpdateUser')
      throw new Error('Database connection not available')
    }
    
    // Try to find existing user
    const existingUser = await prisma.user.findFirst({
      where: { email }
    })
    
    if (existingUser) {
      // Update last login info
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          lastLogin: new Date(),
          lastProvider: provider,
          name: name || existingUser.name
        }
      })
      
      return {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name
      }
    }
    
    // Create new user
    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        provider,
        lastProvider: provider,
        lastLogin: new Date()
      }
    })
    
    // Also create a broker record
    await prisma.broker.create({
      data: {
        userId: newUser.id,
        email: newUser.email,
        companyName: name || 'My Company'
      }
    })
    
    return {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name
    }
  } catch (error) {
    console.error('Error creating/updating user:', error)
    throw error
  }
}