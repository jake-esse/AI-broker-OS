#!/usr/bin/env python3
"""
Database Setup Script for AI-Broker MVP

This script creates all necessary tables and configurations in Supabase.
Run this once to initialize your database schema.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
import asyncio
import argparse

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

# Load environment variables
load_dotenv()

class DatabaseSetup:
    def __init__(self):
        """Initialize Supabase client with service role key"""
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment")
        
        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
        
    def run_migration(self, sql_file_path: str) -> bool:
        """Execute SQL migration file"""
        try:
            # Read SQL file
            with open(sql_file_path, 'r') as f:
                sql_content = f.read()
            
            # Split into individual statements (crude but works for our schema)
            statements = [s.strip() for s in sql_content.split(';') if s.strip()]
            
            print(f"🚀 Executing {len(statements)} SQL statements...")
            
            # Execute each statement
            for i, statement in enumerate(statements):
                if statement:
                    try:
                        # Use raw SQL execution through Supabase
                        result = self.supabase.rpc('exec_sql', {
                            'sql': statement + ';'
                        }).execute()
                        print(f"✅ Statement {i+1}/{len(statements)} executed successfully")
                    except Exception as e:
                        # Try alternative method - direct REST API call
                        import requests
                        
                        headers = {
                            'apikey': self.supabase_key,
                            'Authorization': f'Bearer {self.supabase_key}',
                            'Content-Type': 'application/json'
                        }
                        
                        # Use Supabase REST API for DDL
                        response = requests.post(
                            f"{self.supabase_url}/rest/v1/rpc/query",
                            json={'query': statement + ';'},
                            headers=headers
                        )
                        
                        if response.status_code not in [200, 201, 204]:
                            print(f"⚠️  Statement {i+1} may have failed: {response.text}")
                            # Continue anyway - some statements might fail if objects already exist
                        else:
                            print(f"✅ Statement {i+1}/{len(statements)} executed via REST API")
            
            return True
            
        except Exception as e:
            print(f"❌ Migration failed: {str(e)}")
            return False
    
    def create_tables_via_api(self) -> bool:
        """Alternative method: Create tables using Supabase Python client"""
        print("🔧 Setting up database schema via Supabase API...")
        
        try:
            # Test connection first
            print("Testing Supabase connection...")
            
            # Check if tables already exist by trying to query them
            existing_tables = []
            for table in ['brokers', 'loads', 'quotes', 'communications', 'carriers']:
                try:
                    self.supabase.table(table).select('id').limit(1).execute()
                    existing_tables.append(table)
                    print(f"ℹ️  Table '{table}' already exists")
                except:
                    print(f"📋 Table '{table}' needs to be created")
            
            if len(existing_tables) == 5:
                print("✅ All tables already exist!")
                return True
            
            # If we can't create via SQL, we need to use Supabase dashboard
            print("\n⚠️  Tables need to be created manually in Supabase dashboard")
            print("\n📝 Instructions:")
            print("1. Go to your Supabase project dashboard")
            print("2. Navigate to the SQL Editor")
            print("3. Copy and paste the contents of: supabase/migrations/001_initial_schema.sql")
            print("4. Click 'Run' to execute the schema")
            print("\nAfterwards, run this script again to verify the setup.")
            
            return False
            
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            return False
    
    def seed_sample_data(self) -> bool:
        """Add sample carrier data for testing"""
        print("\n🌱 Seeding sample carrier data...")
        
        sample_carriers = [
            {
                'company_name': 'Swift Transportation',
                'mc_number': 'MC-123456',
                'dot_number': 'DOT-789012',
                'primary_email': 'dispatch@swift.example.com',
                'primary_phone': '555-0100',
                'equipment_types': ['dry_van', 'reefer'],
                'preferred_lanes': [
                    {'origin_state': 'CA', 'dest_state': 'TX'},
                    {'origin_state': 'TX', 'dest_state': 'CA'}
                ],
                'safety_rating': 0.95,
                'on_time_percentage': 92.5
            },
            {
                'company_name': 'Knight-Swift Transport',
                'mc_number': 'MC-234567',
                'dot_number': 'DOT-890123',
                'primary_email': 'booking@knight.example.com',
                'primary_phone': '555-0200',
                'equipment_types': ['dry_van', 'flatbed'],
                'preferred_lanes': [
                    {'origin_state': 'IL', 'dest_state': 'FL'},
                    {'origin_state': 'FL', 'dest_state': 'IL'}
                ],
                'safety_rating': 0.93,
                'on_time_percentage': 94.0
            },
            {
                'company_name': 'JB Hunt Transport',
                'mc_number': 'MC-345678',
                'dot_number': 'DOT-901234',
                'primary_email': 'loads@jbhunt.example.com',
                'primary_phone': '555-0300',
                'equipment_types': ['dry_van', 'reefer', 'flatbed'],
                'preferred_lanes': [
                    {'origin_state': 'AR', 'dest_state': 'CA'},
                    {'origin_state': 'CA', 'dest_state': 'AR'}
                ],
                'safety_rating': 0.97,
                'on_time_percentage': 95.5
            }
        ]
        
        try:
            for carrier in sample_carriers:
                result = self.supabase.table('carriers').insert(carrier).execute()
                print(f"✅ Added carrier: {carrier['company_name']}")
            
            return True
            
        except Exception as e:
            print(f"⚠️  Could not seed data: {str(e)}")
            print("This is okay if tables don't exist yet.")
            return False
    
    def verify_setup(self) -> bool:
        """Verify all tables exist and are accessible"""
        print("\n🔍 Verifying database setup...")
        
        required_tables = ['brokers', 'loads', 'quotes', 'communications', 'carriers']
        all_good = True
        
        for table in required_tables:
            try:
                result = self.supabase.table(table).select('*').limit(1).execute()
                print(f"✅ Table '{table}' is accessible")
            except Exception as e:
                print(f"❌ Table '{table}' is not accessible: {str(e)}")
                all_good = False
        
        return all_good

def main():
    parser = argparse.ArgumentParser(description='Setup AI-Broker database schema')
    parser.add_argument('--skip-seed', action='store_true', help='Skip seeding sample data')
    args = parser.parse_args()
    
    print("🚀 AI-Broker Database Setup")
    print("=" * 50)
    
    try:
        setup = DatabaseSetup()
        
        # Try to run migration
        migration_file = Path(__file__).parent.parent / 'supabase' / 'migrations' / '001_initial_schema.sql'
        
        if migration_file.exists():
            print(f"\n📄 Found migration file: {migration_file}")
            # For now, we'll use the manual approach
            success = setup.create_tables_via_api()
        else:
            print(f"\n❌ Migration file not found: {migration_file}")
            return
        
        # Verify setup
        if setup.verify_setup():
            print("\n✅ Database setup complete!")
            
            # Seed data unless skipped
            if not args.skip_seed:
                setup.seed_sample_data()
            
            print("\n🎉 Your AI-Broker database is ready!")
            print("\nNext steps:")
            print("1. Deploy the Edge Functions to Supabase")
            print("2. Test the OAuth email integration")
            print("3. Run a test load through the system")
        else:
            print("\n⚠️  Database setup incomplete")
            print("Please follow the manual instructions above.")
            
    except Exception as e:
        print(f"\n❌ Setup failed: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    main()