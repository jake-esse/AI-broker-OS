export const GOOGLE_OAUTH_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/google`,
  scopes: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
}

export const MICROSOFT_OAUTH_CONFIG = {
  clientId: process.env.MICROSOFT_CLIENT_ID || '',
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
  redirectUri: `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/outlook`,
  scopes: [
    'https://graph.microsoft.com/User.Read',  // Required for reading user profile
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.ReadBasic',
    'offline_access',
  ],
  authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
}

// Helper to generate OAuth URLs
export function generateOAuthUrl(provider: 'google' | 'microsoft', state: string, isAdditional?: boolean): string {
  const config = provider === 'google' ? GOOGLE_OAUTH_CONFIG : MICROSOFT_OAUTH_CONFIG
  
  // Parse state to check if it's an additional connection
  let redirectUri = config.redirectUri
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    if (stateData.isAdditional) {
      redirectUri = redirectUri.replace('/callback/', '/callback/')
        .replace('/google', '/google-connect')
        .replace('/outlook', '/outlook-connect')
    }
  } catch (e) {
    // State might not be base64 encoded JSON, use default
  }
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
  })

  // Add provider-specific parameters
  if (provider === 'google') {
    params.set('access_type', 'offline')
    params.set('prompt', 'consent')
  } else if (provider === 'microsoft') {
    params.set('response_mode', 'query')
    params.set('prompt', 'select_account')
  }

  return `${config.authUrl}?${params.toString()}`
}