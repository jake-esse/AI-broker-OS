-- Run this to see the actual columns in the brokers table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'brokers' 
ORDER BY ordinal_position;

-- Then create the broker record with only the columns that exist
-- We'll update this query based on the results above