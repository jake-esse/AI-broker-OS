#!/usr/bin/env python3
"""
Quick OAuth Configuration Test
Verifies that OAuth credentials are properly configured
"""

import os
from dotenv import load_dotenv

load_dotenv()

def test_oauth_config():
    print("🔐 OAuth Configuration Test")
    print("=" * 50)
    
    # Google OAuth
    google_client_id = os.getenv('GOOGLE_CLIENT_ID')
    google_client_secret = os.getenv('GOOGLE_CLIENT_SECRET')
    
    print("\n📧 Google OAuth:")
    print(f"   Client ID: {'✅ Set' if google_client_id else '❌ Missing'}")
    print(f"   Client Secret: {'✅ Set' if google_client_secret else '❌ Missing'}")
    if google_client_id:
        print(f"   Client ID Preview: {google_client_id[:20]}...")
    
    # Microsoft OAuth
    microsoft_client_id = os.getenv('MICROSOFT_CLIENT_ID')
    microsoft_client_secret = os.getenv('MICROSOFT_CLIENT_SECRET')
    microsoft_tenant_id = os.getenv('MICROSOFT_TENANT_ID', 'common')
    
    print("\n🏢 Microsoft OAuth:")
    print(f"   Client ID: {'✅ Set' if microsoft_client_id else '❌ Missing'}")
    print(f"   Client Secret: {'✅ Set' if microsoft_client_secret else '❌ Missing'}")
    print(f"   Tenant ID: {microsoft_tenant_id}")
    if microsoft_client_id:
        print(f"   Client ID Preview: {microsoft_client_id[:20]}...")
    
    # Redirect URI
    redirect_uri = os.getenv('OAUTH_REDIRECT_URI', 'http://localhost:8501/auth/callback')
    print(f"\n🔄 Redirect URI: {redirect_uri}")
    
    # Summary
    google_ready = bool(google_client_id and google_client_secret)
    microsoft_ready = bool(microsoft_client_id and microsoft_client_secret)
    
    print(f"\n📊 Status Summary:")
    print(f"   Google OAuth: {'✅ Ready' if google_ready else '❌ Incomplete'}")
    print(f"   Microsoft OAuth: {'✅ Ready' if microsoft_ready else '❌ Incomplete'}")
    
    if google_ready and microsoft_ready:
        print(f"\n🎉 Both OAuth providers are configured!")
        print(f"   You can now test email account connections.")
    else:
        print(f"\n⚠️  Complete the missing OAuth configurations above.")
    
    return google_ready and microsoft_ready

if __name__ == "__main__":
    test_oauth_config()