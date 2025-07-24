# AI-Broker Deployment Guide

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **PostgreSQL Database**: Production PostgreSQL instance with pgvector extension
3. **Domain Name**: Purchase from your preferred registrar
4. **OAuth Apps**: Google Cloud Console and Azure AD app registrations

## Step 1: Database Setup

### 1.1 Production PostgreSQL

You have several options for production PostgreSQL with pgvector:

**Option A: Managed Services**
- [Neon](https://neon.tech) - Serverless PostgreSQL with pgvector
- [Supabase](https://supabase.com) - PostgreSQL with pgvector support
- [Railway](https://railway.app) - Simple PostgreSQL deployment
- [DigitalOcean](https://www.digitalocean.com/products/managed-databases-postgresql) - Managed PostgreSQL

**Option B: Self-Hosted**
- AWS RDS PostgreSQL with pgvector
- Google Cloud SQL PostgreSQL
- Azure Database for PostgreSQL

### 1.2 Database Migration

```bash
# Set production database URL
export DATABASE_URL="postgresql://user:password@host:5432/dbname"

# Run Prisma migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

### 1.3 Verify Database Schema

```bash
# Connect to production database
npx prisma studio

# Verify all tables are created correctly
```

## Step 2: OAuth Application Setup

### 2.1 Google Cloud Console
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs:
     - `https://your-domain.com/api/auth/callback/google`
     - `https://your-domain.com/api/auth/callback/google-connect`

### 2.2 Azure AD
1. Go to [portal.azure.com](https://portal.azure.com)
2. Register a new application
3. Add redirect URIs:
   - `https://your-domain.com/api/auth/callback/microsoft`
   - `https://your-domain.com/api/auth/callback/outlook-connect`
4. Create client secret
5. Add API permissions:
   - Microsoft Graph > Mail.Read
   - Microsoft Graph > Mail.Send

## Step 3: Vercel Deployment

### 3.1 Deploy to Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from ai-broker-web directory
cd ai-broker-web
vercel

# Follow prompts to link to your Vercel account
```

### 3.2 Configure Environment Variables
In Vercel Dashboard > Settings > Environment Variables, add:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Application
NEXT_PUBLIC_URL=https://your-domain.com

# JWT Secret (generate a secure random string)
JWT_SECRET=your-super-secret-jwt-key-minimum-32-chars

# OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_TENANT_ID=common

# AI Services
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
REDUCTO_API_KEY=your_reducto_key
LLM_MODEL=gpt-4o-mini

# Email Service
RESEND_API_KEY=your_resend_key
EMAIL_FROM=quotes@your-domain.com

# Monitoring (optional)
SENTRY_DSN=your_sentry_dsn
POSTHOG_API_KEY=your_posthog_key

# Cron Job Security
CRON_SECRET=generate-secure-random-string
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

### 4.2 Generate JWT Secret
Generate a secure JWT secret:
```bash
openssl rand -base64 32
```

## Step 5: Post-Deployment Setup

### 5.1 Test Authentication
1. Visit `https://your-domain.com/auth/login`
2. Test each OAuth provider
3. Verify user creation in database

### 5.2 Test Email Processing
1. Connect email account in Settings
2. Send a test email with a quote request
3. Check logs in Vercel Dashboard
4. Verify load creation in database

### 5.3 Monitor Performance
1. Set up Sentry alerts for errors
2. Configure PostHog dashboards for analytics
3. Monitor Vercel Analytics for performance

## Step 6: Security Checklist

- [ ] All environment variables are set in Vercel (not in code)
- [ ] JWT_SECRET is unique and secure
- [ ] Database connection uses SSL
- [ ] API routes check authentication via middleware
- [ ] CORS configured properly
- [ ] Rate limiting enabled (Vercel Edge functions)
- [ ] SSL certificate active
- [ ] Security headers configured

## Troubleshooting

### OAuth Issues
- Verify redirect URIs match exactly
- Check OAuth app is not in test mode
- Ensure scopes are correctly configured
- Check JWT_SECRET is set correctly

### Email Processing Issues
- Check cron job logs in Vercel
- Verify OAuth tokens are valid
- Check email connection status in database
- Verify email processing API endpoints

### Database Issues
- Check DATABASE_URL is correct
- Verify SSL mode if required
- Check Prisma client generation
- Monitor database connection limits

## Maintenance

### Regular Tasks
- Monitor error logs weekly
- Review analytics monthly
- Update dependencies quarterly
- Rotate API keys annually
- Backup database regularly

### Scaling Considerations
- Use connection pooling for database
- Enable Vercel Edge functions for global performance
- Consider dedicated email processing service at scale
- Implement caching for frequent queries

## Migration from Development

### Database Migration
```bash
# Export data from local database
pg_dump -h localhost -U postgres -d aibroker > backup.sql

# Import to production (be careful!)
psql -h production-host -U user -d dbname < backup.sql
```

### Environment Variables
1. Update all OAuth redirect URIs to production domain
2. Generate new JWT_SECRET for production
3. Use production API keys for all services

## Support

For issues:
1. Check Vercel function logs
2. Monitor database logs
3. Review Sentry for errors
4. Check browser console for client errors
5. Verify all environment variables are set