-- Add a settings JSONB column to profiles for user preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Comment for documentation
COMMENT ON COLUMN profiles.settings IS 'User preferences JSON. Keys: night_start_hour (0-23), night_end_hour (0-23)';
