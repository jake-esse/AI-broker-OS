import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { Client } from '@microsoft/microsoft-graph-client'
import { createClient } from '@/lib/supabase/server'

export class EmailOAuthProcessor {
  private supabase: any

  constructor() {
    // Supabase will be initialized when needed
  }

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient()
    }
    return this.supabase
  }

  async processGmailMessages(accessToken: string, brokerId: string, isInitialCheck: boolean = false) {
    console.log('[processGmailMessages] Starting Gmail processing for broker:', brokerId)
    console.log('[processGmailMessages] Initial check:', isInitialCheck)
    try {
      const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/google`
      )
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
      
      // Calculate date filter - 1 hour for initial check, 5 minutes for regular checks
      const minutesBack = isInitialCheck ? 60 : 5
      const afterDate = new Date(Date.now() - minutesBack * 60 * 1000)
      const dateFilter = `after:${Math.floor(afterDate.getTime() / 1000)}`
      
      console.log(`[processGmailMessages] Fetching all messages from last ${minutesBack} minutes...`)
      // Get all messages (read and unread) with date filter and limit
      const messagesResponse = await gmail.users.messages.list({
        userId: 'me',
        q: dateFilter,
        maxResults: 50 // Limit to 50 messages max
      })
      
      const messages = messagesResponse.data.messages || []
      console.log(`[processGmailMessages] Found ${messages.length} messages from last ${minutesBack} minutes`)
      
      let processedCount = 0
      let quotesFound = 0
      
      for (const message of messages) {
        if (!message.id) continue
        
        console.log(`[processGmailMessages] Processing message ${processedCount + 1}/${messages.length} - ID: ${message.id}`)
        
        // Get message details to check if it's already read
        const messageDetails = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'minimal'
        })
        
        const isUnread = messageDetails.data.labelIds?.includes('UNREAD') || false
        console.log(`[processGmailMessages] Message ${message.id} is ${isUnread ? 'unread' : 'read'}`)
        
        const emailData = await this.extractGmailData(gmail, message.id)
        console.log(`[processGmailMessages] Extracted email data:`, {
          from: emailData.from,
          subject: emailData.subject,
          date: emailData.date,
          messageId: emailData.messageId
        })
        
        // Check if this email has already been processed
        const supabase = await this.getSupabase()
        const { data: existingEmail } = await supabase
          .from('emails')
          .select('id')
          .eq('message_id', emailData.messageId)
          .single()
        
        if (existingEmail) {
          console.log(`[processGmailMessages] Email already processed - skipping message ID: ${emailData.messageId}`)
          processedCount++
          continue
        }
        
        const result = await this.processEmailForLoad(emailData, brokerId, 'gmail')
        processedCount++
        
        if (result && result.action === 'proceed_to_quote') {
          quotesFound++
          console.log(`[processGmailMessages] Quote request found! Total quotes: ${quotesFound}`)
        }
      }
      
      console.log(`[processGmailMessages] Gmail processing complete. Processed: ${processedCount}, Quotes found: ${quotesFound}`)
      return { processed: processedCount, quotesFound }
    } catch (error: any) {
      console.error('[processGmailMessages] Error processing Gmail messages:', error)
      console.error('[processGmailMessages] Error details:', error.message, error.code)
      if (error.response) {
        console.error('[processGmailMessages] API Response:', error.response.data)
      }
      if (error.code === 403) {
        console.error('[processGmailMessages] Permission denied - check Gmail API scopes')
      }
      throw error
    }
  }
  
  async processMicrosoftMessages(accessToken: string, brokerId: string, isInitialCheck: boolean = false) {
    try {
      const graphClient = Client.init({
        authProvider: (done) => done(null, accessToken)
      })
      
      // Calculate date filter - 1 hour for initial check, 5 minutes for regular checks
      const minutesBack = isInitialCheck ? 60 : 5
      const afterDate = new Date(Date.now() - minutesBack * 60 * 1000)
      const dateFilter = afterDate.toISOString()
      
      console.log(`[processMicrosoftMessages] Fetching all messages from last ${minutesBack} minutes...`)
      // Get all messages (read and unread) with date filter
      const messages = await graphClient.api('/me/messages')
        .filter(`receivedDateTime ge ${dateFilter}`)
        .select('id,subject,from,toRecipients,receivedDateTime,body,hasAttachments,isRead')
        .top(50)
        .get()
      
      let processedCount = 0
      let quotesFound = 0
      
      for (const message of messages.value) {
        console.log(`[processMicrosoftMessages] Processing message ${processedCount + 1}/${messages.value.length}`)
        console.log(`[processMicrosoftMessages] Message ${message.id} is ${message.isRead ? 'read' : 'unread'}`)
        
        const emailData = await this.extractMicrosoftEmailData(message)
        console.log(`[processMicrosoftMessages] Extracted email data:`, {
          from: emailData.from,
          subject: emailData.subject,
          date: emailData.date,
          messageId: emailData.messageId
        })
        
        // Check if this email has already been processed
        const supabase = await this.getSupabase()
        const { data: existingEmail } = await supabase
          .from('emails')
          .select('id')
          .eq('message_id', emailData.messageId)
          .single()
        
        if (existingEmail) {
          console.log(`[processMicrosoftMessages] Email already processed - skipping message ID: ${emailData.messageId}`)
          processedCount++
          continue
        }
        
        const result = await this.processEmailForLoad(emailData, brokerId, 'outlook')
        processedCount++
        
        if (result && result.action === 'proceed_to_quote') {
          quotesFound++
          console.log(`[processMicrosoftMessages] Quote request found! Total quotes: ${quotesFound}`)
        }
      }
      
      console.log(`[processMicrosoftMessages] Outlook processing complete. Processed: ${processedCount}, Quotes found: ${quotesFound}`)
      return { processed: processedCount, quotesFound }
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
    
    // Extract to recipients
    const toAddresses = message.toRecipients?.map((recipient: any) => 
      recipient.emailAddress?.address
    ).filter(Boolean).join(', ') || ''
    
    return {
      from: message.from?.emailAddress?.address || '',
      to: toAddresses,
      subject: message.subject || '',
      content: message.body?.content || '',
      messageId: message.id,
      date: new Date(message.receivedDateTime),
      attachments
    }
  }
  
  private async processEmailForLoad(emailData: any, brokerId: string, provider: string) {
    try {
      console.log(`[OAuth] Processing email from ${emailData.from} for broker ${brokerId}`)
      console.log(`[OAuth] Subject: ${emailData.subject}`)
      console.log(`[OAuth] Provider: ${provider}`)
      
      // Store email in database
      const supabase = await this.getSupabase()
      const { data: email, error: emailError } = await supabase
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
        console.error('[OAuth] Error storing email:', emailError)
        return null
      }

      console.log(`[OAuth] Email stored with ID: ${email.id}`)

      // Process with intake agent
      const intakeUrl = `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/intake/process`
      console.log(`[OAuth] Calling intake API at: ${intakeUrl}`)
      
      const intakePayload = {
        email_id: email.id,
        broker_id: brokerId,
        channel: `oauth_${provider}`,
        content: emailData.content,
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        raw_data: emailData,
      }
      console.log('[OAuth] Intake payload:', JSON.stringify(intakePayload, null, 2))
      
      const response = await fetch(intakeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intakePayload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[OAuth] Intake API error:', response.status, errorText)
        return null
      }

      const result = await response.json()
      console.log('[OAuth] Intake result:', result)
      
      // Generate quote if complete
      if (result.action === 'proceed_to_quote') {
        console.log(`[OAuth] Proceeding to quote generation for load ${result.load_id}`)
        await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/quotes/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            load_id: result.load_id,
            broker_id: brokerId,
          }),
        })
      }
      
      return result
    } catch (error) {
      console.error('[OAuth] Error processing email for load:', error)
      return null
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
  console.log('[processOAuthAccounts] Starting OAuth processing...')
  
  try {
    const supabase = await createClient()
    const processor = new EmailOAuthProcessor()
    
    console.log('[processOAuthAccounts] Fetching email connections...')
    
    // Get all active OAuth connections
    const { data: connections, error } = await supabase
      .from('email_connections')
      .select('*')
      .in('provider', ['gmail', 'outlook'])
      .eq('status', 'active')
      .not('oauth_access_token', 'is', null)

    console.log('[processOAuthAccounts] Query result:', { connections, error })

    if (error) {
      console.error('[processOAuthAccounts] Error fetching OAuth connections:', error)
      return { processed: 0, error: error.message }
    }

    if (!connections || connections.length === 0) {
      console.log('[processOAuthAccounts] No OAuth connections found')
      return { processed: 0 }
    }

    console.log(`[processOAuthAccounts] Found ${connections.length} OAuth connections`)

    let totalProcessed = 0
    let totalQuotesFound = 0
    const results = []

    // Process each connection
    for (const connection of connections) {
      try {
          console.log(`Processing ${connection.provider} for ${connection.email}`)
        
        // Check if token is expired or will expire soon (within 5 minutes)
        const tokenExpiresAt = connection.oauth_token_expires_at ? new Date(connection.oauth_token_expires_at) : null
        const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)
        
        if (tokenExpiresAt && tokenExpiresAt < fiveMinutesFromNow) {
          console.log(`Token expired or expiring soon for ${connection.email}, refreshing...`)
          const newToken = await refreshAccessToken(connection)
          if (!newToken) {
            console.error(`Failed to refresh token for ${connection.email}`)
            results.push({ email: connection.email, error: 'Token refresh failed' })
            continue
          }
          connection.oauth_access_token = newToken
          console.log(`Token refreshed successfully for ${connection.email}`)
        }
        
        // Check if this is the first time processing (no last_checked timestamp)
        const isInitialCheck = !connection.last_checked
        
        let result
        if (connection.provider === 'gmail') {
          result = await processor.processGmailMessages(connection.oauth_access_token, connection.broker_id, isInitialCheck)
        } else if (connection.provider === 'outlook') {
          result = await processor.processMicrosoftMessages(connection.oauth_access_token, connection.broker_id, isInitialCheck)
        }

        if (result) {
          totalProcessed += result.processed
          totalQuotesFound += result.quotesFound
          results.push({ 
            email: connection.email, 
            provider: connection.provider,
            processed: result.processed, 
            quotesFound: result.quotesFound 
          })
        }

        // Update last checked time
        await supabase
          .from('email_connections')
          .update({ last_checked: new Date().toISOString() })
          .eq('id', connection.id)

      } catch (error: any) {
        console.error(`Error processing OAuth for ${connection.email}:`, error)
        results.push({ email: connection.email, error: error.message })
        
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

    return { 
      processed: totalProcessed, 
      quotesFound: totalQuotesFound,
      connections: results.length,
      details: results
    }
  } catch (error: any) {
    console.error('[processOAuthAccounts] Unexpected error:', error)
    return { processed: 0, error: error.message }
  }
}

async function refreshAccessToken(connection: any): Promise<string | null> {
  console.log(`[refreshAccessToken] Refreshing token for ${connection.email} (${connection.provider})`)
  
  try {
    if (connection.provider === 'gmail') {
      const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/google`
      )
      
      oauth2Client.setCredentials({
        refresh_token: connection.oauth_refresh_token
      })
      
      const { credentials } = await oauth2Client.refreshAccessToken()
      console.log('[refreshAccessToken] Google token refreshed successfully')
      
      // Update the stored tokens
      const supabase = await createClient()
      const expiresAt = credentials.expiry_date 
        ? new Date(credentials.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString() // Default 1 hour
        
      await supabase
        .from('email_connections')
        .update({
          oauth_access_token: credentials.access_token,
          oauth_token_expires_at: expiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', connection.id)
      
      return credentials.access_token
    } else if (connection.provider === 'outlook') {
      // Microsoft token refresh
      const tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
      const params = new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: connection.oauth_refresh_token,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/Mail.Read offline_access'
      })
      
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString()
      })
      
      if (!response.ok) {
        const error = await response.text()
        console.error('[refreshAccessToken] Microsoft token refresh failed:', error)
        return null
      }
      
      const tokens = await response.json()
      console.log('[refreshAccessToken] Microsoft token refreshed successfully')
      
      // Update the stored tokens
      const supabase = await createClient()
      await supabase
        .from('email_connections')
        .update({
          oauth_access_token: tokens.access_token,
          oauth_refresh_token: tokens.refresh_token || connection.oauth_refresh_token,
          oauth_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', connection.id)
      
      return tokens.access_token
    }
    
    return null
  } catch (error: any) {
    console.error(`[refreshAccessToken] Error refreshing token for ${connection.email}:`, error)
    
    // Update connection status to indicate refresh failure
    const supabase = await createClient()
    const errorMessage = error.message || 'Unknown error'
    
    // Check if it's a refresh token issue
    const isRefreshTokenInvalid = 
      errorMessage.includes('invalid_grant') || 
      errorMessage.includes('refresh_token') ||
      error.code === 'invalid_grant'
    
    await supabase
      .from('email_connections')
      .update({
        status: isRefreshTokenInvalid ? 'reconnect_required' : 'error',
        error_message: isRefreshTokenInvalid 
          ? 'Email connection expired. Please reconnect your email account.'
          : `Token refresh failed: ${errorMessage}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id)
    
    return null
  }
}