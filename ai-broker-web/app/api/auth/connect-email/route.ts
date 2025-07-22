import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { provider, access_token, refresh_token } = body

  try {
    // Get the user's email from their session
    const userEmail = user.email || ''
    
    // Check if connection already exists
    const { data: existingConnection } = await supabase
      .from('email_connections')
      .select('id')
      .eq('broker_id', user.id)
      .eq('email', userEmail)
      .eq('provider', provider)
      .single()

    const connectionData = {
      broker_id: user.id,
      email: userEmail,
      provider,
      status: 'active',
      last_checked: new Date().toISOString(),
      // OAuth tokens should be encrypted in production
      oauth_access_token: access_token,
      oauth_refresh_token: refresh_token,
    }

    if (existingConnection) {
      // Update existing connection
      const { error: updateError } = await supabase
        .from('email_connections')
        .update(connectionData)
        .eq('id', existingConnection.id)

      if (updateError) throw updateError
    } else {
      // Create new connection
      const { error: insertError } = await supabase
        .from('email_connections')
        .insert(connectionData)

      if (insertError) throw insertError
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to store email connection:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to store email connection' },
      { status: 500 }
    )
  }
}