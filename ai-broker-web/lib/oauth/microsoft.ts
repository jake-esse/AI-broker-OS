export async function exchangeCodeForToken(code: string, callbackType: 'outlook' | 'outlook-connect' = 'outlook') {
  const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
  
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    code: code,
    redirect_uri: `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/${callbackType}`,
    grant_type: 'authorization_code',
    scope: 'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadBasic offline_access'
  })

  console.log('Microsoft token exchange - redirect URI:', params.get('redirect_uri'))
  
  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Token exchange failed:', response.status, error)
      console.error('Request params:', Object.fromEntries(params))
      return null
    }

    const tokens = await response.json()
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
    }
  } catch (error) {
    console.error('Token exchange error:', error)
    return null
  }
}

export async function refreshAccessToken(refreshToken: string) {
  const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
  
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadBasic offline_access'
  })

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Token refresh failed:', error)
      return null
    }

    const tokens = await response.json()
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
    }
  } catch (error) {
    console.error('Token refresh error:', error)
    return null
  }
}