import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import * as db from '@/lib/database/operations'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { company_name, mc_number, phone } = body

    // Update user profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        company_name,
        mc_number,
        phone,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      })

    if (profileError) {
      throw profileError
    }

    // Create initial settings
    const { error: settingsError } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        confidence_thresholds: {
          auto_quote: 85,
          auto_carrier_select: 75,
          auto_dispatch: 90,
        },
        notifications: {
          action_required: true,
          load_updates: true,
          daily_summary: false,
        },
      })

    if (settingsError) {
      throw settingsError
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Onboarding completion error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to complete onboarding' },
      { status: 500 }
    )
  }
}