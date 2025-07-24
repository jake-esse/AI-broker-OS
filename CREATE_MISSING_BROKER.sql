-- Run this in Supabase SQL Editor to create the missing broker record

-- First check if broker exists for user
SELECT * FROM brokers WHERE user_id = '19237bd3-51ba-4dc1-80c0-a1fa6eddc278';

-- If no results, create the broker record
INSERT INTO brokers (
  user_id,
  email,
  company_name,
  status,
  subscription_tier,
  created_at,
  updated_at
) VALUES (
  '19237bd3-51ba-4dc1-80c0-a1fa6eddc278',
  'jake@hiaiden.com',
  'jake',
  'active',
  'trial',
  NOW(),
  NOW()
) ON CONFLICT (user_id) DO NOTHING;

-- Verify it was created
SELECT * FROM brokers WHERE user_id = '19237bd3-51ba-4dc1-80c0-a1fa6eddc278';