/**
 * OAuth Email Sender
 * 
 * Sends emails using Gmail or Outlook APIs with existing OAuth tokens
 * Maintains threading and ensures emails appear in sent folders
 */

import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { Client } from '@microsoft/microsoft-graph-client'
import prisma from '@/lib/prisma'

export interface EmailMessage {
  to: string | string[]
  subject: string
  htmlContent: string
  textContent: string
  replyTo?: string
  inReplyTo?: string // For threading
  references?: string // For threading
}

export class OAuthEmailSender {
  /**
   * Send email using the broker's connected email account
   */
  async sendEmail(brokerId: string, message: EmailMessage): Promise<{
    success: boolean
    messageId?: string
    error?: string
    provider?: string
  }> {
    try {
      // Get the broker's primary email connection
      const emailConnection = await prisma.emailConnection.findFirst({
        where: {
          brokerId,
          status: 'active',
          isPrimary: true
        }
      })

      if (!emailConnection) {
        // Try any active connection
        const anyConnection = await prisma.emailConnection.findFirst({
          where: {
            brokerId,
            status: 'active'
          }
        })
        
        if (!anyConnection) {
          return {
            success: false,
            error: 'No active email connection found'
          }
        }
        
        return this.sendViaProvider(anyConnection, message)
      }

      return this.sendViaProvider(emailConnection, message)
    } catch (error: any) {
      console.error('Error sending email:', error)
      return {
        success: false,
        error: error.message || 'Failed to send email'
      }
    }
  }

  private async sendViaProvider(connection: any, message: EmailMessage) {
    if (connection.provider === 'oauth_google') {
      return this.sendViaGmail(connection, message)
    } else if (connection.provider === 'oauth_outlook') {
      return this.sendViaOutlook(connection, message)
    } else {
      return {
        success: false,
        error: `Unsupported provider: ${connection.provider}`
      }
    }
  }

  /**
   * Send email via Gmail API
   */
  private async sendViaGmail(connection: any, message: EmailMessage): Promise<any> {
    try {
      const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/google`
      )

      // Check if token needs refresh
      if (connection.oauthTokenExpiresAt && new Date(connection.oauthTokenExpiresAt) <= new Date()) {
        const refreshed = await this.refreshGoogleToken(connection)
        if (!refreshed) {
          return {
            success: false,
            error: 'Failed to refresh Google token'
          }
        }
        // Re-fetch connection with updated tokens
        connection = await prisma.emailConnection.findUnique({
          where: { id: connection.id }
        })
      }

      oauth2Client.setCredentials({
        access_token: connection.oauthAccessToken,
        refresh_token: connection.oauthRefreshToken
      })

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

      // Build the email
      const to = Array.isArray(message.to) ? message.to.join(', ') : message.to
      const boundary = `boundary_${Date.now()}`
      
      let emailContent = [
        `To: ${to}`,
        `From: ${connection.email}`,
        `Subject: ${message.subject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`
      ]

      // Add threading headers if provided
      if (message.inReplyTo) {
        emailContent.push(`In-Reply-To: ${message.inReplyTo}`)
      }
      if (message.references) {
        emailContent.push(`References: ${message.references}`)
      }

      emailContent.push('', '') // Empty lines before body

      // Add text part
      emailContent.push(
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        message.textContent,
        ''
      )

      // Add HTML part
      emailContent.push(
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        message.htmlContent,
        '',
        `--${boundary}--`
      )

      const encodedEmail = Buffer.from(emailContent.join('\r\n'))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
          threadId: message.inReplyTo ? undefined : undefined // Gmail handles threading automatically with headers
        }
      })

      console.log('Gmail send result:', result.data)

      return {
        success: true,
        messageId: result.data.id,
        provider: 'gmail'
      }
    } catch (error: any) {
      console.error('Gmail send error:', error)
      return {
        success: false,
        error: error.message || 'Failed to send via Gmail'
      }
    }
  }

  /**
   * Send email via Outlook API
   */
  private async sendViaOutlook(connection: any, message: EmailMessage): Promise<any> {
    try {
      // Check if token needs refresh
      if (connection.oauthTokenExpiresAt && new Date(connection.oauthTokenExpiresAt) <= new Date()) {
        const refreshed = await this.refreshOutlookToken(connection)
        if (!refreshed) {
          return {
            success: false,
            error: 'Failed to refresh Outlook token'
          }
        }
        // Re-fetch connection with updated tokens
        connection = await prisma.emailConnection.findUnique({
          where: { id: connection.id }
        })
      }

      const client = Client.init({
        authProvider: (done) => {
          done(null, connection.oauthAccessToken)
        }
      })

      const toRecipients = Array.isArray(message.to) ? message.to : [message.to]
      
      const mailData: any = {
        subject: message.subject,
        importance: 'normal',
        body: {
          contentType: 'html',
          content: message.htmlContent
        },
        toRecipients: toRecipients.map(email => ({
          emailAddress: { address: email }
        }))
      }

      // Add threading headers if provided
      if (message.inReplyTo || message.references) {
        mailData.internetMessageHeaders = []
        if (message.inReplyTo) {
          mailData.internetMessageHeaders.push({
            name: 'In-Reply-To',
            value: message.inReplyTo
          })
        }
        if (message.references) {
          mailData.internetMessageHeaders.push({
            name: 'References',
            value: message.references
          })
        }
      }

      const result = await client
        .api('/me/sendMail')
        .post({
          message: mailData,
          saveToSentItems: true
        })

      console.log('Outlook send complete')

      return {
        success: true,
        messageId: result?.id || 'sent',
        provider: 'outlook'
      }
    } catch (error: any) {
      console.error('Outlook send error:', error)
      return {
        success: false,
        error: error.message || 'Failed to send via Outlook'
      }
    }
  }

  /**
   * Refresh Google OAuth token
   */
  private async refreshGoogleToken(connection: any): Promise<boolean> {
    try {
      const oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/google`
      )
      
      oauth2Client.setCredentials({
        refresh_token: connection.oauthRefreshToken
      })
      
      const { credentials } = await oauth2Client.refreshAccessToken()
      
      // Update tokens in database
      await prisma.emailConnection.update({
        where: { id: connection.id },
        data: {
          oauthAccessToken: credentials.access_token || '',
          oauthTokenExpiresAt: credentials.expiry_date 
            ? new Date(credentials.expiry_date)
            : new Date(Date.now() + 3600 * 1000),
          status: 'active',
          errorMessage: null
        }
      })
      
      return true
    } catch (error) {
      console.error('Failed to refresh Google token:', error)
      
      // Mark connection as needing reconnection
      await prisma.emailConnection.update({
        where: { id: connection.id },
        data: {
          status: 'reconnect_required',
          errorMessage: 'Token refresh failed - please reconnect'
        }
      })
      
      return false
    }
  }

  /**
   * Refresh Outlook OAuth token
   */
  private async refreshOutlookToken(connection: any): Promise<boolean> {
    try {
      const tokenEndpoint = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/oauth2/v2.0/token`
      
      const params = new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: connection.oauthRefreshToken,
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
      
      // Update tokens in database
      await prisma.emailConnection.update({
        where: { id: connection.id },
        data: {
          oauthAccessToken: tokens.access_token,
          oauthRefreshToken: tokens.refresh_token || connection.oauthRefreshToken,
          oauthTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          status: 'active',
          errorMessage: null
        }
      })
      
      return true
    } catch (error) {
      console.error('Failed to refresh Outlook token:', error)
      
      // Mark connection as needing reconnection
      await prisma.emailConnection.update({
        where: { id: connection.id },
        data: {
          status: 'reconnect_required',
          errorMessage: 'Token refresh failed - please reconnect'
        }
      })
      
      return false
    }
  }

  /**
   * Extract message ID from email headers for threading
   */
  static extractMessageId(emailHeaders: any): string | undefined {
    if (!emailHeaders) return undefined
    
    // For Gmail
    if (emailHeaders.payload?.headers) {
      const messageIdHeader = emailHeaders.payload.headers.find(
        (h: any) => h.name.toLowerCase() === 'message-id'
      )
      return messageIdHeader?.value
    }
    
    // For Outlook
    if (emailHeaders.internetMessageHeaders) {
      const messageIdHeader = emailHeaders.internetMessageHeaders.find(
        (h: any) => h.name.toLowerCase() === 'message-id'
      )
      return messageIdHeader?.value
    }
    
    return undefined
  }
}