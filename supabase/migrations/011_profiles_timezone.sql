-- Store user timezone (IANA, e.g. America/New_York) for CSV import and display.
-- Used when parsing email CSV so local times are converted to UTC correctly.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN profiles.timezone IS 'IANA timezone (e.g. America/New_York) for CSV import and recommendations';
