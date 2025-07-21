#!/usr/bin/env python3
"""
Execute SQL directly in Supabase using REST API
"""

import os
import sys
import requests
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
load_dotenv()

def execute_sql_file(sql_file_path: str):
    """Execute SQL file contents via Supabase REST API"""
    
    # Get credentials
    supabase_url = os.getenv('SUPABASE_URL')
    service_role_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not service_role_key:
        print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        return False
    
    # Read SQL file
    with open(sql_file_path, 'r') as f:
        sql_content = f.read()
    
    # Prepare headers
    headers = {
        'apikey': service_role_key,
        'Authorization': f'Bearer {service_role_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }
    
    # Split SQL into individual statements
    statements = [s.strip() for s in sql_content.split(';') if s.strip()]
    
    print(f"🚀 Executing {len(statements)} SQL statements...")
    
    success_count = 0
    for i, statement in enumerate(statements):
        try:
            # Execute via Supabase REST API
            # Using the /rest/v1/ endpoint with a raw query
            response = requests.post(
                f"{supabase_url}/rest/v1/rpc",
                headers=headers,
                json={
                    "query": statement + ";"
                }
            )
            
            # Try alternative approach - using pg REST API
            if response.status_code not in [200, 201, 204]:
                # Direct SQL execution endpoint
                alt_response = requests.post(
                    f"{supabase_url}/pg/query",
                    headers=headers,
                    json={
                        "query": statement + ";"
                    }
                )
                
                if alt_response.status_code in [200, 201, 204]:
                    print(f"✅ Statement {i+1}/{len(statements)} executed successfully")
                    success_count += 1
                else:
                    print(f"⚠️  Statement {i+1} response: {alt_response.status_code}")
            else:
                print(f"✅ Statement {i+1}/{len(statements)} executed successfully")
                success_count += 1
                
        except Exception as e:
            print(f"⚠️  Statement {i+1} error: {str(e)}")
    
    print(f"\n📊 Executed {success_count}/{len(statements)} statements successfully")
    
    if success_count < len(statements):
        print("\n⚠️  Some statements failed. This might be normal if objects already exist.")
        print("\n📝 To execute manually:")
        print("1. Go to your Supabase dashboard")
        print("2. Navigate to SQL Editor")
        print("3. Paste the contents of the SQL file")
        print("4. Click 'Run'")
    
    return success_count > 0

if __name__ == '__main__':
    if len(sys.argv) > 1:
        sql_file = sys.argv[1]
    else:
        sql_file = 'scripts/create_missing_tables.sql'
    
    sql_path = Path(sql_file)
    if not sql_path.exists():
        print(f"❌ SQL file not found: {sql_path}")
        sys.exit(1)
    
    print(f"📄 Executing SQL from: {sql_path}")
    execute_sql_file(str(sql_path))