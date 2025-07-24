# Microsoft OAuth Setup Guide

## 1. Create Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Configure the app:
   - Name: `AI Broker Email Integration` (or your preferred name)
   - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI: 
     - Platform: "Web"
     - URI: `http://localhost:3000/api/auth/callback/outlook`

## 2. Configure API Permissions

1. In your app registration, go to "API permissions"
2. Click "Add a permission"
3. Choose "Microsoft Graph"
4. Select "Delegated permissions"
5. Add these permissions:
   - `Mail.Read` - Read user mail
   - `Mail.ReadBasic` - Read basic mail properties
   - `offline_access` - Maintain access to data
6. Click "Add permissions"
7. (Optional) Click "Grant admin consent" if you're an admin

## 3. Create Client Secret

1. Go to "Certificates & secrets"
2. Click "New client secret"
3. Add a description: "AI Broker Email"
4. Choose expiration (recommend 24 months)
5. Click "Add"
6. **IMPORTANT**: Copy the secret value immediately (you can't see it again!)

## 4. Add to Environment Variables

Add these to your `.env.local` file:

```env
MICROSOFT_CLIENT_ID=your_application_id_here
MICROSOFT_CLIENT_SECRET=your_client_secret_here
```

You can find the Application (client) ID on the Overview page of your app registration.

## 5. Add Additional Redirect URIs (for Production)

When deploying to production, add your production URL:
1. Go to "Authentication" in your app registration
2. Under "Platform configurations" > "Web"
3. Add redirect URI: `https://yourdomain.com/api/auth/callback/outlook`

## 6. Test the Connection

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Run the test script:
   ```bash
   node scripts/test-outlook-oauth.js
   ```

3. Go to Settings page and click "Connect Microsoft Outlook"

## Common Issues

### "Invalid request" Error
- Ensure redirect URI matches exactly (including http vs https)
- Check that you're using the v2.0 endpoint

### "Insufficient privileges" Error  
- Make sure all required permissions are added
- If in an organization, admin consent may be required

### Token Refresh Failing
- Verify `offline_access` permission is included
- Check that refresh token is being saved to database

## Security Notes

1. Never commit your client secret to git
2. Use different app registrations for dev/staging/production
3. Rotate client secrets regularly
4. Monitor app usage in Azure portal