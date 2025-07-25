import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { Client } from '@microsoft/microsoft-graph-client'
import prisma from '@/lib/prisma'
import * as db from '@/lib/database/operations'
import { v4 as uuidv4 } from 'uuid'

export class EmailOAuthProcessor {
  constructor() {
    // No initialization needed for Prisma
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
      
      // For initial check, only get unread emails
      // For periodic checks, get emails from the last 2 hours
      let query = 'in:inbox'
      if (isInitialCheck) {
        query += ' is:unread'
      } else {
        // Get emails from last 2 hours
        const twoHoursAgo = Math.floor(Date.now() / 1000) - (2 * 60 * 60)
        query += ` after:${twoHoursAgo}`
      }
      
      console.log('[processGmailMessages] Search query:', query)
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: isInitialCheck ? 20 : 10
      })
      
      const messages = response.data.messages || []
      console.log('[processGmailMessages] Found messages:', messages.length)
      const processedCount = { tender: 0, quote: 0, other: 0 }
      
      for (const message of messages) {
        try {
          console.log('[processGmailMessages] Processing message:', message.id)
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!
          })
          
          const emailData = this.parseGmailMessage(fullMessage.data)
          console.log('[processGmailMessages] Parsed email data:', {
            from: emailData.from,
            subject: emailData.subject,
            messageId: emailData.messageId
          })
          
          // Check if email already exists
          const existingEmail = await prisma.email.findUnique({
            where: { messageId: emailData.messageId }
          })
          
          if (existingEmail) {
            console.log('[processGmailMessages] Email already processed, skipping:', emailData.messageId)
            continue
          }
          
          // Store in database
          const stored = await this.storeEmail(emailData, brokerId, 'oauth_google')
          if (stored) {
            processedCount.tender++
          }
          
        } catch (error) {
          console.error('[processGmailMessages] Error processing message:', message.id, error)
        }
      }
      
      console.log('[processGmailMessages] Processing complete. Counts:', processedCount)
      return processedCount
      
    } catch (error: any) {
      console.error('[processGmailMessages] Fatal error:', error)
      if (error.code === 401 || error.message?.includes('invalid_grant')) {
        throw new Error('Gmail authentication expired. Please reconnect your account.')
      }
      throw error
    }
  }

  async processOutlookMessages(accessToken: string, brokerId: string, isInitialCheck: boolean = false) {
    console.log('[processOutlookMessages] Starting Outlook processing for broker:', brokerId)
    console.log('[processOutlookMessages] Initial check:', isInitialCheck)
    try {
      const client = Client.init({
        authProvider: (done) => {
          done(null, accessToken)
        }
      })
      
      let filter = ''
      if (isInitialCheck) {
        filter = '&$filter=isRead eq false'
      } else {
        // Get emails from last 2 hours
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        filter = `&$filter=receivedDateTime ge ${twoHoursAgo}`
      }
      
      console.log('[processOutlookMessages] Filter:', filter)
      
      const messages = await client
        .api('/me/mailFolders/inbox/messages')
        .query(`$top=${isInitialCheck ? 20 : 10}${filter}&$orderby=receivedDateTime desc`)
        .get()
      
      console.log('[processOutlookMessages] Found messages:', messages.value.length)
      const processedCount = { tender: 0, quote: 0, other: 0 }
      
      for (const message of messages.value) {
        try {
          console.log('[processOutlookMessages] Processing message:', message.id)
          const emailData = this.parseOutlookMessage(message)
          console.log('[processOutlookMessages] Parsed email data:', {
            from: emailData.from,
            subject: emailData.subject,
            messageId: emailData.messageId
          })
          
          // Check if email already exists
          const existingEmail = await prisma.email.findUnique({
            where: { messageId: emailData.messageId }
          })
          
          if (existingEmail) {
            console.log('[processOutlookMessages] Email already processed, skipping:', emailData.messageId)
            continue
          }
          
          // Store in database
          const stored = await this.storeEmail(emailData, brokerId, 'oauth_outlook')
          if (stored) {
            processedCount.tender++
          }
          
        } catch (error) {
          console.error('[processOutlookMessages] Error processing message:', message.id, error)
        }
      }
      
      console.log('[processOutlookMessages] Processing complete. Counts:', processedCount)
      return processedCount
      
    } catch (error: any) {
      console.error('[processOutlookMessages] Fatal error:', error)
      if (error.statusCode === 401 || error.code === 'InvalidAuthenticationToken') {
        throw new Error('Outlook authentication expired. Please reconnect your account.')
      }
      throw error
    }
  }

  private parseGmailMessage(message: any): any {
    const headers = message.payload?.headers || []
    const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || ''
    
    let body = ''
    if (message.payload?.parts) {
      const textPart = message.payload.parts.find((p: any) => p.mimeType === 'text/plain')
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString()
      }
    } else if (message.payload?.body?.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString()
    }
    
    return {
      messageId: getHeader('Message-ID') || message.id,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      body: body,
      raw: message
    }
  }

  private parseOutlookMessage(message: any): any {
    return {
      messageId: message.internetMessageId || message.id,
      from: message.from?.emailAddress?.address || '',
      to: message.toRecipients?.[0]?.emailAddress?.address || '',
      subject: message.subject || '',
      date: message.receivedDateTime || '',
      body: message.body?.content || '',
      raw: message
    }
  }

  private async storeEmail(emailData: any, brokerId: string, provider: string): Promise<boolean> {
    try {
      console.log('[storeEmail] Storing email for broker:', brokerId)
      console.log('[storeEmail] Email data:', {
        from: emailData.from,
        subject: emailData.subject,
        messageId: emailData.messageId
      })
      
      const email = await prisma.email.create({
        data: {
          brokerId: brokerId,
          fromAddress: emailData.from,
          toAddress: emailData.to,
          subject: emailData.subject,
          content: emailData.body,
          messageId: emailData.messageId,
          provider: provider,
          receivedAt: emailData.date ? new Date(emailData.date) : new Date(),
          rawData: emailData.raw,
          status: 'received'
        }
      })
      
      console.log('[storeEmail] Email stored successfully:', email.id)
      
      // Trigger processing for load quote requests
      await this.processEmail(email, brokerId)
      
      return true
    } catch (error) {
      console.error('[storeEmail] Error storing email:', error)
      return false
    }
  }

  private async processEmail(email: any, brokerId: string): Promise<void> {
    try {
      console.log('[processEmail] Processing email:', email.id)
      
      // Call the intake processing API
      const response = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/intake/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email_id: email.id,
          broker_id: brokerId,
          channel: 'email',
          content: email.content,
          from: email.fromAddress,
          to: email.toAddress,
          subject: email.subject,
          raw_data: email.rawData
        })
      })
      
      if (!response.ok) {
        const error = await response.text()
        console.error('[processEmail] Intake processing failed:', error)
      } else {
        const result = await response.json()
        console.log('[processEmail] Intake processing result:', result)
      }
    } catch (error) {
      console.error('[processEmail] Error processing email:', error)
    }
  }

  async refreshGoogleToken(refreshToken: string): Promise<any> {
    try {
      const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/google`
      )
      
      oauth2Client.setCredentials({
        refresh_token: refreshToken
      })
      
      const { credentials } = await oauth2Client.refreshAccessToken()
      return credentials
    } catch (error) {
      console.error('Failed to refresh Google token:', error)
      throw error
    }
  }

  async refreshOutlookToken(refreshToken: string): Promise<any> {
    try {
      const tokenEndpoint = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/oauth2/v2.0/token`
      
      const params = new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/.default offline_access'
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
        throw new Error(`Token refresh failed: ${error}`)
      }
      
      const tokens = await response.json()
      return tokens
    } catch (error) {
      console.error('Failed to refresh Outlook token:', error)
      throw error
    }
  }
}

// Main processing function
export async function processOAuthAccounts() {
  console.log('[processOAuthAccounts] Starting OAuth email processing...')
  try {
    const processor = new EmailOAuthProcessor()
    
    console.log('[processOAuthAccounts] Fetching email connections...')
    
    // Get all active OAuth connections
    const connections = await db.getActiveEmailConnections()
    
    console.log(`[processOAuthAccounts] Found ${connections.length} active OAuth connections`)
    
    const results = {
      processed: 0,
      errors: 0,
      tokenRefreshes: 0
    }
    
    for (const connection of connections) {
      console.log(`[processOAuthAccounts] Processing connection: ${connection.email} (${connection.provider})`)
      
      try {
        let accessToken = connection.oauthAccessToken
        
        // Check if token needs refresh
        if (connection.oauthTokenExpiresAt && new Date(connection.oauthTokenExpiresAt) < new Date()) {
          console.log('[processOAuthAccounts] Token expired, refreshing...')
          
          if (!connection.oauthRefreshToken) {
            throw new Error('No refresh token available')
          }
          
          try {
            let newTokens: any
            if (connection.provider === 'oauth_google') {
              newTokens = await processor.refreshGoogleToken(connection.oauthRefreshToken)
              accessToken = newTokens.access_token
              
              const expiresAt = newTokens.expiry_date 
                ? new Date(newTokens.expiry_date)
                : new Date(Date.now() + 3600 * 1000) // Default 1 hour
                
              await db.updateEmailConnection(connection.id, {
                oauthAccessToken: newTokens.access_token,
                oauthTokenExpiresAt: expiresAt
              })
            } else if (connection.provider === 'oauth_outlook') {
              newTokens = await processor.refreshOutlookToken(connection.oauthRefreshToken)
              accessToken = newTokens.access_token
              
              await db.updateEmailConnection(connection.id, {
                oauthAccessToken: newTokens.access_token,
                oauthRefreshToken: newTokens.refresh_token || connection.oauthRefreshToken,
                oauthTokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000)
              })
            }
            
            results.tokenRefreshes++
            console.log('[processOAuthAccounts] Token refreshed successfully')
          } catch (refreshError: any) {
            console.error('[processOAuthAccounts] Token refresh failed:', refreshError)
            await handleTokenRefreshError(connection, refreshError)
            results.errors++
            continue
          }
        }
        
        // Process emails
        if (connection.provider === 'oauth_google' && accessToken) {
          await processor.processGmailMessages(accessToken, connection.brokerId)
        } else if (connection.provider === 'oauth_outlook' && accessToken) {
          await processor.processOutlookMessages(accessToken, connection.brokerId)
        }
        
        // Update last checked time
        await db.updateEmailConnection(connection.id, {
          lastChecked: new Date()
        })
        
        results.processed++
        
      } catch (error: any) {
        console.error(`Error processing OAuth for ${connection.email}:`, error)
        results.errors++
        
        // Update connection status if failed
        await db.updateEmailConnection(connection.id, {
          status: 'error',
          errorMessage: error.message
        })
      }
    }
    
    console.log('[processOAuthAccounts] OAuth processing complete:', results)
    return results
    
  } catch (error) {
    console.error('[processOAuthAccounts] Fatal error:', error)
    throw error
  }
}

async function handleTokenRefreshError(connection: any, error: any) {
  const errorMessage = error.message || 'Unknown error'
  
  // Check if it's a refresh token issue
  const isRefreshTokenInvalid = 
    errorMessage.includes('invalid_grant') || 
    errorMessage.includes('Token has been expired or revoked') ||
    errorMessage.includes('Refresh token revoked')
  
  await db.updateEmailConnection(connection.id, {
    status: isRefreshTokenInvalid ? 'reconnect_required' : 'error',
    errorMessage: isRefreshTokenInvalid 
      ? 'Email connection expired. Please reconnect your email account.'
      : `Token refresh failed: ${errorMessage}`
  })
}