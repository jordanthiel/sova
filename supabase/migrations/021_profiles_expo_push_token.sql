-- Store Expo push token for sending push notifications to the user's device
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expo_push_token_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.expo_push_token IS 'Expo push token (ExponentPushToken[...]) for this user; used by backend to send push notifications';
COMMENT ON COLUMN profiles.expo_push_token_updated_at IS 'When the push token was last updated (e.g. on app launch or reinstall)';
