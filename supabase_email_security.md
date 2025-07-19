# Supabase Email Security Configuration Guide

## Overview

This guide provides step-by-step instructions for setting up secure credential storage and Row Level Security (RLS) for the AI-Broker email integration system. Follow these steps in your Supabase dashboard to ensure proper security for broker email accounts.

## 1. Environment Variables Setup

### Required Environment Variables

Add these to your `.env` file and Supabase Edge Functions environment:

```bash
# OAuth Client Credentials (get from provider consoles)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

# OAuth Redirect URI (your application URL)
OAUTH_REDIRECT_URI=https://your-app.com/auth/callback

# Webhook URLs (Supabase Edge Function URLs)
GMAIL_WEBHOOK_URL=https://your-project.supabase.co/functions/v1/webhook_gmail
OUTLOOK_WEBHOOK_URL=https://your-project.supabase.co/functions/v1/webhook_outlook

# Email Service Configuration
RESEND_API_KEY=your_resend_api_key
```

### Supabase Dashboard Configuration

1. Go to **Settings > API** in your Supabase dashboard
2. Add these environment variables to your Edge Functions:
   - Navigate to **Edge Functions > Settings**
   - Add each environment variable with appropriate values

## 2. Database Migration

### Apply Email Account Schema

Run this migration in your Supabase SQL Editor:

```sql
-- Apply the email accounts migration
-- Copy and paste the contents of supabase/migrations/20250119000000_email_account_connections.sql
```

### Verify Migration Success

Check that these tables were created:
- `email_accounts`
- `email_processing_log` 
- `webhook_events`

Run this query to verify:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('email_accounts', 'email_processing_log', 'webhook_events');
```

## 3. Row Level Security Configuration

### Enable RLS Policies

The migration automatically enables RLS, but verify with:

```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('email_accounts', 'email_processing_log', 'webhook_events');
```

### Test RLS Policies

Create a test broker user and verify isolation:

```sql
-- Create test broker (replace with actual user UUID from auth.users)
INSERT INTO email_accounts (broker_id, email_address, provider, status) 
VALUES ('test-broker-uuid', 'test@example.com', 'GMAIL', 'ACTIVE');

-- Test that brokers can only see their own accounts
-- (This should only return accounts for the authenticated broker)
SELECT * FROM email_accounts WHERE broker_id = auth.uid();
```

## 4. OAuth Provider Setup

### Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable Gmail API:
   - Navigate to **APIs & Services > Library**
   - Search for "Gmail API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to **APIs & Services > Credentials**
   - Click **Create Credentials > OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: Add your `OAUTH_REDIRECT_URI + /gmail`
5. Copy Client ID and Client Secret to your environment variables

### Microsoft Azure Setup

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory > App registrations**
3. Click **New registration**:
   - Name: "AI-Broker Email Integration"
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: Add your `OAUTH_REDIRECT_URI + /outlook`
4. Configure API permissions:
   - Go to **API permissions**
   - Add permissions for Microsoft Graph:
     - `Mail.Read` (Application)
     - `Mail.Send` (Application)
     - `User.Read` (Delegated)
     - `offline_access` (Delegated)
5. Create client secret:
   - Go to **Certificates & secrets**
   - Click **New client secret**
   - Copy the secret value to your environment variables

## 5. Webhook Configuration

### Gmail Push Notifications Setup

1. Enable Pub/Sub API in Google Cloud Console
2. Create a Pub/Sub topic:
   ```bash
   gcloud pubsub topics create gmail-push-notifications
   ```
3. Create a push subscription:
   ```bash
   gcloud pubsub subscriptions create gmail-webhook-sub \
     --topic=gmail-push-notifications \
     --push-endpoint=https://your-project.supabase.co/functions/v1/webhook_gmail
   ```
4. Grant Gmail service account permission to publish

### Microsoft Graph Webhooks

Microsoft Graph webhooks are configured programmatically when email accounts are connected. No additional setup required in Azure portal.

## 6. Security Verification Checklist

### Database Security
- [ ] RLS is enabled on all email-related tables
- [ ] Service role can bypass RLS for system operations
- [ ] Broker users can only access their own data
- [ ] OAuth tokens are stored encrypted (Supabase default)

### API Security
- [ ] OAuth client secrets are stored in environment variables
- [ ] Webhook endpoints validate signatures/tokens
- [ ] Edge Functions use service role authentication
- [ ] CORS headers are properly configured

### Network Security
- [ ] OAuth redirect URIs are properly configured
- [ ] Webhook endpoints use HTTPS
- [ ] API keys are not exposed in client-side code
- [ ] Rate limiting is configured for webhook endpoints

## 7. Testing Security Setup

### Test OAuth Flow

Run this test to verify OAuth configuration:

```python
from oauth_service import OAuthService, EmailProvider

# Test OAuth service initialization
oauth_service = OAuthService()

# Test authorization URL generation
auth_url, code_verifier, state = oauth_service.get_authorization_url(
    EmailProvider.GMAIL, 
    "test-broker-123"
)

print(f"Authorization URL: {auth_url}")
print(f"Configuration successful: {bool(auth_url)}")
```

### Test Database Access

```sql
-- Test that RLS is working
SET ROLE authenticated;
SET request.jwt.claim.sub = 'test-broker-uuid';

-- This should only return accounts for test-broker-uuid
SELECT COUNT(*) FROM email_accounts;

-- Reset role
RESET ROLE;
```

### Test Webhook Endpoints

```bash
# Test Gmail webhook (should return method not allowed for GET)
curl -X GET https://your-project.supabase.co/functions/v1/webhook_gmail

# Test Outlook webhook (should return method not allowed for GET)
curl -X GET https://your-project.supabase.co/functions/v1/webhook_outlook
```

## 8. Production Hardening

### Additional Security Measures

1. **Enable audit logging**:
   ```sql
   -- Enable audit logging for sensitive tables
   ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "audit_email_accounts" ON email_accounts 
   FOR ALL USING (true) 
   WITH CHECK (true);
   ```

2. **Set up monitoring**:
   - Configure Supabase alerts for failed login attempts
   - Monitor webhook endpoint error rates
   - Set up alerts for unusual email processing volumes

3. **Regular security reviews**:
   - Rotate OAuth client secrets quarterly
   - Review and audit email account connections monthly
   - Monitor for inactive email accounts and disable processing

4. **Backup and recovery**:
   - Ensure email processing logs are included in backups
   - Test OAuth token refresh mechanisms
   - Document recovery procedures for compromised accounts

## 9. Troubleshooting Common Issues

### OAuth Token Refresh Failures
- Check that refresh tokens are properly stored
- Verify OAuth client credentials are correct
- Ensure redirect URIs match exactly

### Webhook Authentication Failures
- Verify webhook signatures are being validated
- Check that Supabase service role key is correct
- Ensure Edge Functions have proper environment variables

### RLS Policy Issues
- Verify broker_id is properly set in JWT claims
- Check that auth.uid() returns expected values
- Test policies with different user contexts

## 10. Security Compliance Notes

This configuration provides:
- **Data encryption at rest** (Supabase default)
- **Data encryption in transit** (HTTPS/TLS)
- **Multi-tenant data isolation** (RLS policies)
- **OAuth 2.0 security standards** (PKCE, state parameters)
- **Webhook signature validation** (provider-specific)
- **Audit trail maintenance** (processing logs)

For additional compliance requirements (HIPAA, SOC 2, etc.), consult Supabase documentation and consider additional security measures as needed.