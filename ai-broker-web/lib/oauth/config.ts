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
  redirectUri: `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/microsoft`,
  scopes: [
    'https://graph.microsoft.com/mail.read',
    'https://graph.microsoft.com/mail.readwrite',
    'offline_access',
  ],
  authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
}

// Helper to generate OAuth URLs
export function generateOAuthUrl(provider: 'google' | 'microsoft', state: string): string {
  const config = provider === 'google' ? GOOGLE_OAUTH_CONFIG : MICROSOFT_OAUTH_CONFIG
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    access_type: provider === 'google' ? 'offline' : '',
    prompt: provider === 'google' ? 'consent' : '',
  })

  return `${config.authUrl}?${params.toString()}`
}