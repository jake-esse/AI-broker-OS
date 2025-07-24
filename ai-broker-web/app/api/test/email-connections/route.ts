import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' })
    }

    // Get ALL email connections for this user
    const connections = await prisma.emailConnection.findMany({
      where: { userId: user.id }
    })

    return NextResponse.json({ 
      user_id: user.id,
      connections: connections || [],
      count: connections?.length || 0
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message })
  }
}