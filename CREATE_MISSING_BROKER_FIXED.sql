-- Run this in Supabase SQL Editor to create the missing broker record

-- First check if broker exists for user
SELECT * FROM brokers WHERE user_id = '19237bd3-51ba-4dc1-80c0-a1fa6eddc278';

-- If no results, create the broker record with only the columns that exist
INSERT INTO brokers (
  id,
  user_id,
  email,
  company_name,
  subscription_tier,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '19237bd3-51ba-4dc1-80c0-a1fa6eddc278',
  'jake@hiaiden.com',
  'jake',
  'trial',
  NOW(),
  NOW()
) ON CONFLICT (user_id) DO NOTHING;

-- If user_id column doesn't exist, try this instead:
INSERT INTO brokers (
  id,
  email,
  company_name,
  subscription_tier,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'jake@hiaiden.com',
  'jake',
  'trial',
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- Verify it was created
SELECT * FROM brokers WHERE email = 'jake@hiaiden.com';