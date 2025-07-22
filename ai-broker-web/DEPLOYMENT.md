# AI-Broker Deployment Guide

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Supabase Project**: Create at [supabase.com](https://supabase.com)
3. **Domain Name**: Purchase from your preferred registrar
4. **OAuth Apps**: Google Cloud Console and Azure AD app registrations

## Step 1: Supabase Setup

### 1.1 Create Supabase Project
1. Go to [app.supabase.com](https://app.supabase.com)
2. Create a new project
3. Save your project URL and API keys

### 1.2 Run Database Migrations
```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### 1.3 Configure Authentication
1. Go to Authentication > Providers in Supabase Dashboard
2. Enable Email provider
3. Configure Google OAuth:
   - Client ID: From Google Cloud Console
   - Client Secret: From Google Cloud Console
   - Redirect URL: `https://your-project.supabase.co/auth/v1/callback`
4. Configure Azure OAuth:
   - Client ID: From Azure AD
   - Client Secret: From Azure AD
   - Redirect URL: `https://your-project.supabase.co/auth/v1/callback`

### 1.4 Enable Row Level Security
Run these SQL commands in Supabase SQL Editor:
```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;
```

## Step 2: OAuth Application Setup

### 2.1 Google Cloud Console
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs:
     - `https://your-project.supabase.co/auth/v1/callback`
     - `https://your-domain.com/auth/callback`

### 2.2 Azure AD
1. Go to [portal.azure.com](https://portal.azure.com)
2. Register a new application
3. Add redirect URIs:
   - `https://your-project.supabase.co/auth/v1/callback`
   - `https://your-domain.com/auth/callback`
4. Create client secret
5. Add API permissions:
   - Microsoft Graph > Mail.Read

## Step 3: Vercel Deployment

### 3.1 Deploy to Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow prompts to link to your Vercel account
```

### 3.2 Configure Environment Variables
In Vercel Dashboard > Settings > Environment Variables, add:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Application
NEXT_PUBLIC_URL=https://your-domain.com
ENCRYPTION_KEY=generate-32-char-random-string
CRON_SECRET=generate-secure-random-string

# AI Services (obtain from providers)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
REDUCTO_API_KEY=your_reducto_key

# Email Service (optional)
RESEND_API_KEY=your_resend_key
EMAIL_FROM=quotes@your-domain.com

# Monitoring (optional)
SENTRY_DSN=your_sentry_dsn
POSTHOG_API_KEY=your_posthog_key
```

### 3.3 Configure Domain
1. In Vercel Dashboard > Settings > Domains
2. Add your custom domain
3. Update DNS records at your registrar

### 3.4 Enable Cron Jobs
The cron job is already configured in `vercel.json`. It will run every 5 minutes to check emails.

## Step 4: Email Configuration

### 4.1 Email Domain Setup (if using Resend)
1. Sign up at [resend.com](https://resend.com)
2. Add and verify your domain
3. Configure DNS records:
   - SPF: `v=spf1 include:amazonses.com ~all`
   - DKIM: Add provided DKIM records
   - DMARC: `v=DMARC1; p=none;`

### 4.2 IMAP Encryption Key
Generate a secure 32-character encryption key:
```bash
openssl rand -hex 16
```

## Step 5: Post-Deployment Setup

### 5.1 Test Authentication
1. Visit `https://your-domain.com/auth/login`
2. Test each OAuth provider
3. Verify email connections are stored

### 5.2 Test Email Processing
1. Send a test email with a quote request
2. Check logs in Vercel Dashboard
3. Verify load creation in database

### 5.3 Monitor Performance
1. Set up Sentry alerts for errors
2. Configure PostHog dashboards for analytics
3. Monitor Vercel Analytics for performance

## Step 6: Security Checklist

- [ ] All environment variables are set in Vercel (not in code)
- [ ] Row Level Security enabled on all tables
- [ ] API routes check authentication
- [ ] CORS configured properly
- [ ] Rate limiting enabled (Vercel Edge functions)
- [ ] SSL certificate active
- [ ] Security headers configured

## Troubleshooting

### OAuth Issues
- Verify redirect URIs match exactly
- Check OAuth app is not in test mode
- Ensure scopes are correctly configured

### Email Processing Issues
- Check cron job logs in Vercel
- Verify IMAP credentials are correct
- Check email connection status in database

### Database Issues
- Verify RLS policies are correct
- Check service role key has proper permissions
- Monitor Supabase logs for errors

## Maintenance

### Regular Tasks
- Monitor error logs weekly
- Review analytics monthly
- Update dependencies quarterly
- Rotate API keys annually

### Scaling Considerations
- Upgrade Supabase plan for more connections
- Enable Vercel Edge functions for global performance
- Consider dedicated email processing service at scale

## Support

For issues:
1. Check Vercel function logs
2. Review Supabase logs
3. Monitor Sentry for errors
4. Contact support with error details