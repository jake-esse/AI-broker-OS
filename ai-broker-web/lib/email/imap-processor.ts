import crypto from 'crypto'
import * as db from '@/lib/database/operations'
const Imap = require('imap')
const { simpleParser } = require('mailparser')

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-char-encryption-key-here'
const IV_LENGTH = 16

function decrypt(text: string): string {
  const textParts = text.split(':')
  const iv = Buffer.from(textParts.shift()!, 'hex')
  const encryptedText = Buffer.from(textParts.join(':'), 'hex')
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY, 'utf-8'),
    iv
  )
  let decrypted = decipher.update(encryptedText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString()
}

export class ImapEmailProcessor {
  private imap: any
  private supabase: any

  constructor(private connectionDetails: {
    email: string
    password: string
    host: string
    port: number
    brokerId: string
  }) {
    this.supabase = createClient()
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap = new Imap({
        user: this.connectionDetails.email,
        password: this.connectionDetails.password,
        host: this.connectionDetails.host,
        port: this.connectionDetails.port,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
      })

      this.imap.once('ready', () => {
        console.log('IMAP connection ready')
        resolve()
      })

      this.imap.once('error', (err: any) => {
        console.error('IMAP error:', err)
        reject(err)
      })

      this.imap.connect()
    })
  }

  async processUnreadEmails(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.openBox('INBOX', false, (err: any, box: any) => {
        if (err) {
          reject(err)
          return
        }

        // Search for unread emails
        this.imap.search(['UNSEEN'], async (err: any, results: any) => {
          if (err) {
            reject(err)
            return
          }

          if (results.length === 0) {
            console.log('No unread emails')
            resolve()
            return
          }

          const fetch = this.imap.fetch(results, { bodies: '', markSeen: true })

          fetch.on('message', (msg: any) => {
            msg.on('body', (stream: any) => {
              simpleParser(stream, async (err: any, parsed: any) => {
                if (err) {
                  console.error('Parse error:', err)
                  return
                }

                await this.processEmail(parsed)
              })
            })
          })

          fetch.once('error', (err: any) => {
            console.error('Fetch error:', err)
            reject(err)
          })

          fetch.once('end', () => {
            console.log('Done fetching messages')
            resolve()
          })
        })
      })
    })
  }

  private async processEmail(parsedEmail: any): Promise<void> {
    try {
      const emailData = {
        from: parsedEmail.from?.text || '',
        to: parsedEmail.to?.text || '',
        subject: parsedEmail.subject || '',
        content: parsedEmail.text || parsedEmail.html || '',
        messageId: parsedEmail.messageId || '',
        date: parsedEmail.date || new Date(),
        attachments: parsedEmail.attachments || []
      }

      // Store email in database
      const { data: email, error: emailError } = await this.supabase
        .from('emails')
        .insert({
          broker_id: this.connectionDetails.brokerId,
          from_address: emailData.from,
          to_address: emailData.to,
          subject: emailData.subject,
          content: emailData.content,
          message_id: emailData.messageId,
          received_at: emailData.date,
          status: 'received'
        })
        .select()
        .single()

      if (emailError) {
        console.error('Error storing email:', emailError)
        return
      }

      // Process with intake agent
      const response = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/intake/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_id: email.id,
          broker_id: this.connectionDetails.brokerId,
          channel: 'imap_email',
          content: emailData.content,
          raw_data: emailData,
        }),
      })

      if (!response.ok) {
        console.error('Error processing email with intake agent')
      }

      // Process attachments if any
      for (const attachment of emailData.attachments) {
        await this.processAttachment(email.id, attachment)
      }

    } catch (error) {
      console.error('Error processing email:', error)
    }
  }

  private async processAttachment(emailId: string, attachment: any): Promise<void> {
    try {
      // Store attachment metadata
      await this.supabase
        .from('email_attachments')
        .insert({
          email_id: emailId,
          filename: attachment.filename,
          content_type: attachment.contentType,
          size: attachment.size,
          content: attachment.content.toString('base64')
        })
    } catch (error) {
      console.error('Error processing attachment:', error)
    }
  }

  async disconnect(): Promise<void> {
    if (this.imap) {
      this.imap.end()
    }
  }
}

// Worker function to process IMAP accounts
export async function processImapAccounts() {
  const supabase = await createClient()
  
  // Get all active IMAP connections
  const { data: connections, error } = await supabase
    .from('email_connections')
    .select('*')
    .eq('provider', 'imap')
    .eq('status', 'active')

  if (error || !connections) {
    console.error('Error fetching IMAP connections:', error)
    return
  }

  // Process each connection
  for (const connection of connections) {
    try {
      const processor = new ImapEmailProcessor({
        email: connection.email,
        password: decrypt(connection.imap_password_encrypted),
        host: connection.imap_host,
        port: connection.imap_port,
        brokerId: connection.broker_id
      })

      await processor.connect()
      await processor.processUnreadEmails()
      await processor.disconnect()

      // Update last checked time
      await supabase
        .from('email_connections')
        .update({ last_checked: new Date().toISOString() })
        .eq('id', connection.id)

    } catch (error) {
      console.error(`Error processing IMAP for ${connection.email}:`, error)
      
      // Update connection status if failed
      await supabase
        .from('email_connections')
        .update({ 
          is_active: false,
          error_message: error.message 
        })
        .eq('id', connection.id)
    }
  }
}