import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    // Check auth token
    const cookieStore = await cookies()
    const authToken = cookieStore.get('auth-token')
    
    // Get current user
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ 
        authenticated: false,
        hasToken: !!authToken,
        tokenValue: authToken?.value ? 'exists' : 'missing'
      })
    }

    // Get broker info
    const supabase = await createClient()
    const { data: broker } = await supabase
      .from('brokers')
      .select('*')
      .eq('user_id', user.id)
      .single()
      
    // Get email connections
    const { data: connections } = await supabase
      .from('email_connections')
      .select('*')
      .eq('user_id', user.id)

    return NextResponse.json({ 
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider
      },
      broker: broker ? {
        id: broker.id,
        email: broker.email,
        company_name: broker.company_name
      } : null,
      connections: connections?.map(c => ({
        id: c.id,
        email: c.email,
        provider: c.provider,
        status: c.status,
        is_primary: c.is_primary
      })) || []
    })
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      authenticated: false 
    }, { status: 500 })
  }
}