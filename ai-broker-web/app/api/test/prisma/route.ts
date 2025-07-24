import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    // Test database connection
    await prisma.$connect()
    
    // Count records
    const userCount = await prisma.user.count()
    const brokerCount = await prisma.broker.count()
    
    return NextResponse.json({
      success: true,
      database: 'connected',
      counts: {
        users: userCount,
        brokers: brokerCount
      }
    })
  } catch (error) {
    console.error('Prisma test error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}