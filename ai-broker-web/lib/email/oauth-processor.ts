import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { Client } from '@microsoft/microsoft-graph-client'
import { createClient } from '@/lib/supabase/server'

export class EmailOAuthProcessor {
  private supabase: any

  constructor() {
    this.supabase = createClient()
  }

  async processGmailMessages(accessToken: string, brokerId: string) {
    try {
      const oauth2Client = new OAuth2Client()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
      
      // Get unread messages
      const messagesResponse = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread category:primary'
      })
      
      const messages = messagesResponse.data.messages || []
      
      for (const message of messages) {
        if (!message.id) continue
        
        const emailData = await this.extractGmailData(gmail, message.id)
        await this.processEmailForLoad(emailData, brokerId, 'gmail')
        
        // Mark as read
        await gmail.users.messages.modify({
          userId: 'me',
          id: message.id,
          requestBody: {
            removeLabelIds: ['UNREAD']
          }
        })
      }
    } catch (error) {
      console.error('Error processing Gmail messages:', error)
      throw error
    }
  }
  
  async processMicrosoftMessages(accessToken: string, brokerId: string) {
    try {
      const graphClient = Client.init({
        authProvider: (done) => done(null, accessToken)
      })
      
      // Get unread messages
      const messages = await graphClient.api('/me/messages')
        .filter('isRead eq false')
        .select('id,subject,from,receivedDateTime,body,hasAttachments')
        .top(50)
        .get()
      
      for (const message of messages.value) {
        const emailData = await this.extractMicrosoftEmailData(message)
        await this.processEmailForLoad(emailData, brokerId, 'outlook')
        
        // Mark as read
        await graphClient.api(`/me/messages/${message.id}`)
          .update({ isRead: true })
      }
    } catch (error) {
      console.error('Error processing Microsoft messages:', error)
      throw error
    }
  }
  
  private async extractGmailData(gmail: any, messageId: string) {
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    })
    
    const headers = message.data.payload.headers || []
    const from = this.getHeaderValue(headers, 'From')
    const to = this.getHeaderValue(headers, 'To')
    const subject = this.getHeaderValue(headers, 'Subject')
    const date = this.getHeaderValue(headers, 'Date')
    
    // Extract body
    const body = this.extractGmailBody(message.data.payload)
    
    // Extract attachments
    const attachments = await this.extractGmailAttachments(gmail, messageId, message.data.payload)
    
    return {
      from,
      to,
      subject,
      content: body,
      messageId: message.data.id,
      date: new Date(date),
      attachments
    }
  }
  
  private async extractMicrosoftEmailData(message: any) {
    const attachments = []
    
    if (message.hasAttachments) {
      // Fetch attachments separately if needed
      // This would require an additional API call
    }
    
    return {
      from: message.from?.emailAddress?.address || '',
      to: '', // Would need to fetch this separately
      subject: message.subject || '',
      content: message.body?.content || '',
      messageId: message.id,
      date: new Date(message.receivedDateTime),
      attachments
    }
  }
  
  private async processEmailForLoad(emailData: any, brokerId: string, provider: string) {
    try {
      // Store email in database
      const { data: email, error: emailError } = await this.supabase
        .from('emails')
        .insert({
          broker_id: brokerId,
          from_address: emailData.from,
          to_address: emailData.to,
          subject: emailData.subject,
          content: emailData.content,
          message_id: emailData.messageId,
          received_at: emailData.date,
          provider: provider,
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
          broker_id: brokerId,
          channel: `oauth_${provider}`,
          content: emailData.content,
          raw_data: emailData,
        }),
      })

      const result = await response.json()
      
      // Generate quote if complete
      if (result.action === 'proceed_to_quote') {
        await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/quotes/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            load_id: result.load_id,
            broker_id: brokerId,
          }),
        })
      }
    } catch (error) {
      console.error('Error processing email for load:', error)
    }
  }
  
  private getHeaderValue(headers: any[], name: string): string {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase())
    return header ? header.value : ''
  }
  
  private extractGmailBody(payload: any): string {
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body.data) {
          return Buffer.from(part.body.data, 'base64').toString()
        }
      }
      // If no plain text, try HTML
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body.data) {
          return Buffer.from(part.body.data, 'base64').toString()
        }
      }
    } else if (payload.body.data) {
      return Buffer.from(payload.body.data, 'base64').toString()
    }
    return ''
  }
  
  private async extractGmailAttachments(gmail: any, messageId: string, payload: any): Promise<any[]> {
    const attachments = []
    
    const findAttachments = (parts: any[]) => {
      for (const part of parts) {
        if (part.filename && part.body.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            attachmentId: part.body.attachmentId,
            size: part.body.size
          })
        }
        if (part.parts) {
          findAttachments(part.parts)
        }
      }
    }
    
    if (payload.parts) {
      findAttachments(payload.parts)
    }
    
    // Fetch attachment data if needed
    for (const attachment of attachments) {
      try {
        const attachmentData = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: messageId,
          id: attachment.attachmentId
        })
        attachment.data = attachmentData.data.data
      } catch (error) {
        console.error('Error fetching attachment:', error)
      }
    }
    
    return attachments
  }
}

// Worker function to process OAuth email accounts
export async function processOAuthAccounts() {
  const supabase = createClient()
  const processor = new EmailOAuthProcessor()
  
  // Get all active OAuth connections
  const { data: connections, error } = await supabase
    .from('email_connections')
    .select('*')
    .in('provider', ['gmail', 'outlook'])
    .eq('status', 'active')
    .not('oauth_access_token', 'is', null)

  if (error || !connections) {
    console.error('Error fetching OAuth connections:', error)
    return { processed: 0, error: error?.message }
  }

  if (connections.length === 0) {
    console.log('No OAuth connections found')
    return { processed: 0 }
  }

  let totalProcessed = 0

  // Process each connection
  for (const connection of connections) {
    try {
      console.log(`Processing ${connection.provider} for ${connection.email}`)
      
      // Check if token is expired
      if (connection.oauth_token_expires_at && 
          new Date(connection.oauth_token_expires_at) < new Date()) {
        // TODO: Implement token refresh
        console.log(`Token expired for ${connection.email}, needs refresh`)
        const newToken = await refreshAccessToken(connection)
        if (!newToken) {
          console.error(`Failed to refresh token for ${connection.email}`)
          continue
        }
        connection.oauth_access_token = newToken
      }
      
      if (connection.provider === 'gmail') {
        await processor.processGmailMessages(connection.oauth_access_token, connection.broker_id)
      } else if (connection.provider === 'outlook') {
        await processor.processMicrosoftMessages(connection.oauth_access_token, connection.broker_id)
      }

      // Update last checked time
      await supabase
        .from('email_connections')
        .update({ last_checked: new Date().toISOString() })
        .eq('id', connection.id)

      totalProcessed++
    } catch (error: any) {
      console.error(`Error processing OAuth for ${connection.email}:`, error)
      
      // Update connection status if failed
      await supabase
        .from('email_connections')
        .update({ 
          status: 'error',
          error_message: error.message 
        })
        .eq('id', connection.id)
    }
  }

  return { processed: totalProcessed }
}

async function refreshAccessToken(connection: any): Promise<string | null> {
  // TODO: Implement token refresh logic for each provider
  // For now, return null if token needs refresh
  return null
}