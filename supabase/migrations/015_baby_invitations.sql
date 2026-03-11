-- Store pending invitations by email for users who don't have an account yet.
-- When they sign up, the trigger converts these to baby_parents rows.
CREATE TABLE baby_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(baby_id, email)
);

CREATE INDEX IF NOT EXISTS idx_baby_invitations_email ON baby_invitations (LOWER(TRIM(email)));

ALTER TABLE baby_invitations ENABLE ROW LEVEL SECURITY;

-- Only service role / edge functions modify this table (no policies for anon/authenticated)
-- The send-caregiver-invite function inserts; the trigger deletes.

-- When a new profile is created (user signs up), convert any pending invitations for that email
-- into baby_parents rows so they can accept in the app.
CREATE OR REPLACE FUNCTION convert_pending_invitations_to_baby_parents()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NULL OR TRIM(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO baby_parents (baby_id, parent_id, role, status, invited_by)
  SELECT bi.baby_id, NEW.id, 'member', 'pending', bi.invited_by
  FROM baby_invitations bi
  WHERE LOWER(TRIM(bi.email)) = LOWER(TRIM(NEW.email))
  ON CONFLICT (baby_id, parent_id) DO NOTHING;

  DELETE FROM baby_invitations
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_convert_invitations ON profiles;
CREATE TRIGGER on_profile_created_convert_invitations
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION convert_pending_invitations_to_baby_parents();
