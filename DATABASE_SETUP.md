# Database Setup Instructions

## Current Status
✅ **Existing tables**: loads, carriers
❌ **Missing tables**: brokers, quotes, communications

## Manual Setup Steps

1. **Go to your Supabase Dashboard**
   - URL: https://app.supabase.com/project/gylxustweebxlnqaykec

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar

3. **Run the Migration**
   - Copy the entire contents of: `scripts/add_missing_tables.sql`
   - Paste into the SQL Editor
   - Click "Run" button

4. **Verify Setup**
   - After running, execute this verification query:
   ```sql
   -- Check all tables exist
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('brokers', 'loads', 'quotes', 'communications', 'carriers')
   ORDER BY table_name;
   ```

5. **Test the Setup**
   - Run: `python scripts/setup_database.py --skip-seed`
   - This will verify all tables are accessible

## What These Tables Do

### brokers
- Stores broker accounts and OAuth credentials
- Manages subscription tiers and preferences
- Links brokers to their loads and communications

### quotes  
- Tracks all quotes sent to carriers for each load
- Records carrier responses and rates
- Manages quote lifecycle (pending → accepted/rejected)

### communications
- Logs all emails, SMS, and other communications
- Tracks email threads and conversations
- Stores OAuth email integration data

## Next Steps

After creating the tables:
1. Deploy the Edge Function (fn_create_load)
2. Test the OAuth email integration
3. Process a test load through the system