#!/usr/bin/env node

/**
 * Test script for Microsoft Outlook OAuth
 * Run this after setting up your OAuth connection to verify it's working
 */

require('dotenv').config({ path: '.env.local' })

async function testOutlookOAuth() {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  
  console.log('Microsoft OAuth Configuration:')
  console.log('-----------------------------')
  console.log(`Client ID: ${clientId ? '✓ Set' : '✗ Missing'}`)
  console.log(`Client Secret: ${clientSecret ? '✓ Set' : '✗ Missing'}`)
  console.log(`Redirect URI: http://localhost:3000/api/auth/callback/outlook`)
  console.log('')
  
  if (!clientId || !clientSecret) {
    console.error('ERROR: Missing required environment variables!')
    console.error('Please ensure MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are set in .env.local')
    process.exit(1)
  }
  
  console.log('OAuth Authorization URL:')
  console.log('------------------------')
  const scopes = [
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.ReadBasic',
    'offline_access'
  ]
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
    `client_id=${clientId}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent('http://localhost:3000/api/auth/callback/outlook')}&` +
    `scope=${encodeURIComponent(scopes.join(' '))}&` +
    `response_mode=query`
  
  console.log('Visit this URL to start OAuth flow:')
  console.log(authUrl)
  console.log('')
  
  console.log('Testing Steps:')
  console.log('-------------')
  console.log('1. Start your dev server: npm run dev')
  console.log('2. Go to Settings: http://localhost:3000/settings')
  console.log('3. Click "Connect Microsoft Outlook"')
  console.log('4. Sign in with your Microsoft account')
  console.log('5. Grant the requested permissions')
  console.log('6. You should be redirected back to settings')
  console.log('')
  
  console.log('Required Azure AD App Permissions:')
  console.log('---------------------------------')
  console.log('- Mail.Read')
  console.log('- Mail.ReadBasic')
  console.log('- offline_access (for refresh tokens)')
  console.log('')
  
  console.log('Test Email Format:')
  console.log('-----------------')
  console.log('Subject: Quote Request - [Origin] to [Destination]')
  console.log('Body should include:')
  console.log('- Pickup location and date')
  console.log('- Delivery location and date')
  console.log('- Commodity and weight')
  console.log('- Equipment type (e.g., Dry van)')
}

testOutlookOAuth()