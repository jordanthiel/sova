-- Sleep import codes: per (user, baby) secret code for email-to-CSV import address (import+CODE@domain).
CREATE TABLE IF NOT EXISTS sleep_import_codes (
  code TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  baby_id UUID NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, baby_id)
);

CREATE INDEX IF NOT EXISTS idx_sleep_import_codes_user_baby ON sleep_import_codes(user_id, baby_id);

ALTER TABLE sleep_import_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own import codes"
  ON sleep_import_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create import codes for themselves"
  ON sleep_import_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
