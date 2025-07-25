import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import * as db from '@/lib/database/operations'
import { getCurrentUser } from '@/lib/auth/direct-auth-prisma'
import { Resend } from 'resend'
import * as db from '@/lib/database/operations'

const resend = new Resend(process.env.RESEND_API_KEY || '')

export async function POST(request: NextRequest) {
  console.log('Email send endpoint called')
  console.log('RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY)
  
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
    const { to, subject, html, replyTo } = body
    
    console.log('Sending email to:', to || user.email)

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to: to || user.email || '',
      subject: subject || 'AI-Broker Notification',
      html: html || '<p>This is a notification from AI-Broker.</p>',
      reply_to: replyTo || user.email,
    })

    if (error) {
      console.error('Resend error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      return NextResponse.json(
        { error: error.message || 'Failed to send email' },
        { status: 500 }
      )
    }

    console.log('Email sent successfully:', data)

    return NextResponse.json({ 
      success: true,
      data,
      message: 'Email sent successfully'
    })
  } catch (error: any) {
    console.error('Email send error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}