# Microsoft Outlook OAuth Testing Guide

## Prerequisites

1. **Azure App Registration**
   - App ID (Client ID): Should be in `.env.local` as `MICROSOFT_CLIENT_ID`
   - Client Secret: Should be in `.env.local` as `MICROSOFT_CLIENT_SECRET`
   - Redirect URI: `http://localhost:3000/api/auth/callback/outlook`

2. **Required Permissions in Azure**
   - Mail.Read
   - Mail.ReadBasic
   - offline_access (for refresh tokens)

## Testing Steps

### 1. Initial OAuth Connection

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to Settings page: http://localhost:3000/settings

3. Click "Connect Microsoft Outlook" button

4. You should be redirected to Microsoft login page

5. Sign in with your Outlook account

6. Grant permissions when prompted

7. You should be redirected back to settings with "Connected" status

### 2. Verify Email Filtering

After connection, the system should:
- Initially check emails from the last 60 minutes
- Then check every 5 minutes for emails from the last 5 minutes
- Check both read and unread emails within the time window

### 3. Send Test Quote Request Email

Send an email to your connected Outlook account with:

**Subject**: Quote Request - Dallas to Chicago

**Body**:
```
I need a quote for shipping:
- Pickup: Dallas, TX on 2025-07-25
- Delivery: Chicago, IL by 2025-07-28
- Commodity: General freight
- Weight: 42,000 lbs
- Equipment: Dry van

Please provide your best rate.

Thanks,
Test Shipper
test@example.com
555-1234
```

### 4. Verify Processing

1. Click "Check Now" button in settings to trigger immediate check
2. Monitor the browser console for processing logs
3. Navigate to Loads page: http://localhost:3000/loads
4. Verify the load appears with correct information

### 5. Test Token Refresh

1. Wait for token to expire (usually 1 hour for Microsoft)
2. System should automatically refresh the token
3. If refresh fails, status should change to "reconnect_required"

## Troubleshooting

### Common Issues

1. **"Invalid request" during OAuth**
   - Verify redirect URI matches exactly in Azure and code
   - Check that all required permissions are configured

2. **No emails being processed**
   - Check browser console for errors
   - Verify email meets "quote request" criteria
   - Ensure email is within time window

3. **Token refresh failing**
   - Ensure `offline_access` scope is included
   - Check if refresh token is being saved to database

### Debug Logging

Enable detailed logging by checking console output for:
- `[OAuth] Processing emails for broker`
- `[OAuth] Found X quote request emails`
- `[OAuth] Processing email from`
- `[OAuth] Intake result:`

### Database Verification

Check Supabase tables:
- `email_connections`: Should have entry with provider='outlook'
- `emails`: Should have processed emails
- `loads`: Should have created loads from quote requests

## Expected Behavior

1. **Initial Connection**: Checks last 60 minutes of emails
2. **Recurring Checks**: Every 5 minutes, checks last 5 minutes
3. **Email Processing**: Both read and unread emails are processed
4. **Duplicate Prevention**: Same email won't create duplicate loads
5. **Token Management**: Automatic refresh before expiration