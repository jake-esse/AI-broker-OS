import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-char-encryption-key-here'
const IV_LENGTH = 16

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY, 'utf-8'),
    iv
  )
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
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
    const { email, password, host, port } = body

    // Validate IMAP connection (simplified - in production, actually test the connection)
    const imap = require('imap')
    const connection = new imap({
      user: email,
      password: password,
      host: host,
      port: port,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    })

    // Test connection
    await new Promise((resolve, reject) => {
      connection.once('ready', () => {
        connection.end()
        resolve(true)
      })
      connection.once('error', (err: any) => {
        reject(err)
      })
      connection.connect()
    })

    // Encrypt credentials
    const encryptedPassword = encrypt(password)

    // Store email connection in database
    const { error: insertError } = await supabase
      .from('email_connections')
      .upsert({
        user_id: user.id,
        email: email,
        provider: 'imap',
        imap_host: host,
        imap_port: port,
        encrypted_password: encryptedPassword,
        is_active: true,
      })

    if (insertError) {
      throw insertError
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('IMAP connection error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to connect IMAP account' },
      { status: 500 }
    )
  }
}