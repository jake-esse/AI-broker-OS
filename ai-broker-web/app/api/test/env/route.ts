import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    hasDbUrl: !!process.env.DATABASE_URL,
    dbUrlLength: process.env.DATABASE_URL?.length || 0,
    nodeEnv: process.env.NODE_ENV,
    jwtSecret: !!process.env.JWT_SECRET,
    nextPublicUrl: process.env.NEXT_PUBLIC_URL
  })
}