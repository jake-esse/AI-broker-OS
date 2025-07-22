-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  mc_number TEXT,
  phone TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  confidence_thresholds JSONB DEFAULT '{
    "auto_quote": 85,
    "auto_carrier_select": 75,
    "auto_dispatch": 90
  }'::jsonb,
  notifications JSONB DEFAULT '{
    "action_required": true,
    "load_updates": true,
    "daily_summary": false
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for profiles
CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

-- RLS policies for user_settings
CREATE POLICY "Users can view own settings" ON user_settings
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON user_settings
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON user_settings
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Function to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();