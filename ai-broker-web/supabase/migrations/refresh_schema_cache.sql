-- Refresh Supabase schema cache
-- This forces Supabase to update its internal schema cache

-- Option 1: Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Option 2: Touch the table to ensure it's in cache
SELECT COUNT(*) FROM loads LIMIT 1;