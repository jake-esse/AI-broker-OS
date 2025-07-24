# Migration to Direct OAuth Authentication

## Overview
We're migrating from Supabase Auth to direct OAuth to solve the redirect_uri_mismatch issues and simplify the authentication flow.

## Architecture Changes

### Before:
1. User logs in with Supabase Auth (Google/Azure)
2. User connects email accounts separately for email access
3. Two different OAuth flows with different redirect URIs

### After:
1. User logs in with direct OAuth (Google/Outlook)
2. Same OAuth flow gives both authentication AND email access
3. Single redirect URI configuration

## Setup Steps

### 1. Run Database Migrations
Run the contents of `DIRECT_AUTH_TABLES.sql` in Supabase SQL Editor.

### 2. Update OAuth App Configurations

#### Google Cloud Console:
- Keep existing OAuth 2.0 Client ID
- Update redirect URI to: `http://localhost:3000/api/auth/callback/google`
- Remove old Supabase redirect URIs

#### Azure Portal:
- Keep existing App Registration
- Ensure redirect URI is: `http://localhost:3000/api/auth/callback/outlook`
- Remove any Supabase-related redirect URIs

### 3. Test the New Flow

#### Gmail Login:
1. Clear all cookies for localhost:3000
2. Go to http://localhost:3000
3. You'll be redirected to /auth/login
4. Click "Continue with Gmail"
5. Sign in with your Gmail account
6. Grant permissions (email + Gmail access)
7. You'll be logged in and email connection established

#### Outlook Login:
1. Clear all cookies for localhost:3000
2. Go to http://localhost:3000
3. You'll be redirected to /auth/login
4. Click "Continue with Outlook"
5. Sign in with your Outlook account
6. Grant permissions (email + Mail.Read access)
7. You'll be logged in and email connection established

## Benefits

1. **Single Sign-On**: Users authenticate once and get both login + email access
2. **Simpler Configuration**: One set of redirect URIs per provider
3. **Better UX**: No need to connect email accounts separately
4. **Flexibility**: Easy to add more email accounts later

## Additional Email Accounts

After initial login, users can connect additional email accounts:
1. Go to Settings
2. Click "Add Email Account"
3. Choose provider (Gmail/Outlook)
4. OAuth flow adds the account without changing authentication

## Security

- Sessions managed with JWT tokens (30-day expiry)
- Tokens stored in httpOnly cookies
- Email OAuth tokens encrypted in database
- Row Level Security still enforced via service role