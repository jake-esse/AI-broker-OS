import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    // Get broker info
    const broker = await prisma.broker.findFirst({
      where: { userId: user.id },
      select: { id: true }
    })

    return NextResponse.json({ 
      user: {
        ...user,
        broker_id: broker?.id
      }
    })
  } catch (error) {
    return NextResponse.json({ user: null }, { status: 401 })
  }
}