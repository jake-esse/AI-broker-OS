import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check environment variables
  const envCheck = {
    OPENAI_API_KEY: {
      present: !!process.env.OPENAI_API_KEY,
      prefix: process.env.OPENAI_API_KEY?.substring(0, 7) + '...' || 'NOT SET'
    },
    NEXT_PUBLIC_URL: {
      present: !!process.env.NEXT_PUBLIC_URL,
      value: process.env.NEXT_PUBLIC_URL || 'NOT SET'
    },
    DATABASE_URL: {
      present: !!process.env.DATABASE_URL,
      prefix: process.env.DATABASE_URL?.substring(0, 20) + '...' || 'NOT SET'
    },
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV || 'local'
  }

  // Try to initialize the intake agent
  let intakeAgentStatus = 'Not tested'
  try {
    const { IntakeAgentLLMEnhanced } = await import('@/lib/agents/intake-llm-enhanced')
    const agent = new IntakeAgentLLMEnhanced()
    intakeAgentStatus = 'Successfully initialized'
  } catch (error: any) {
    intakeAgentStatus = `Failed: ${error.message}`
  }

  return NextResponse.json({
    envCheck,
    intakeAgentStatus,
    timestamp: new Date().toISOString()
  })
}