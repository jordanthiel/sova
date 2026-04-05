-- Introduce family-scoped access and subscriptions.

CREATE TABLE IF NOT EXISTS public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  subscription_provider TEXT,
  subscription_product_id TEXT,
  subscription_expires_at TIMESTAMPTZ,
  subscription_updated_at TIMESTAMPTZ,
  revenuecat_app_user_id TEXT,
  revenuecat_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.families
  DROP CONSTRAINT IF EXISTS families_created_by_unique;

ALTER TABLE public.families
  ADD CONSTRAINT families_created_by_unique UNIQUE (created_by);

ALTER TABLE public.families
  DROP CONSTRAINT IF EXISTS families_subscription_status_check;

ALTER TABLE public.families
  ADD CONSTRAINT families_subscription_status_check
  CHECK (subscription_status IN ('inactive', 'active', 'canceled', 'past_due', 'expired'));

ALTER TABLE public.families
  DROP CONSTRAINT IF EXISTS families_subscription_provider_check;

ALTER TABLE public.families
  ADD CONSTRAINT families_subscription_provider_check
  CHECK (subscription_provider IS NULL OR subscription_provider IN ('revenuecat'));

CREATE TABLE IF NOT EXISTS public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(family_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.family_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(family_id, email)
);

ALTER TABLE public.babies
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_families_created_by ON public.families(created_by);
CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON public.family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON public.family_members(user_id);
CREATE INDEX IF NOT EXISTS idx_family_invitations_email ON public.family_invitations(LOWER(TRIM(email)));
CREATE INDEX IF NOT EXISTS idx_babies_family_id ON public.babies(family_id);

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;

-- Backfill one family per existing baby owner and inherit monetization state from profiles.
INSERT INTO public.families (
  id,
  name,
  created_by,
  trial_started_at,
  trial_ends_at,
  subscription_status,
  subscription_provider,
  subscription_product_id,
  subscription_expires_at,
  subscription_updated_at,
  revenuecat_app_user_id,
  revenuecat_customer_id
)
SELECT
  gen_random_uuid(),
  COALESCE(NULLIF(TRIM(p.full_name), ''), 'Family'),
  b.created_by,
  p.trial_started_at,
  p.trial_ends_at,
  p.subscription_status,
  p.subscription_provider,
  p.subscription_product_id,
  p.subscription_expires_at,
  p.subscription_updated_at,
  p.revenuecat_app_user_id,
  p.revenuecat_customer_id
FROM (
  SELECT DISTINCT created_by
  FROM public.babies
) b
LEFT JOIN public.profiles p ON p.id = b.created_by
WHERE NOT EXISTS (
  SELECT 1
  FROM public.families f
  WHERE f.created_by = b.created_by
);

UPDATE public.babies b
SET family_id = f.id
FROM public.families f
WHERE f.created_by = b.created_by
  AND b.family_id IS NULL;

ALTER TABLE public.babies
  ALTER COLUMN family_id SET NOT NULL;

INSERT INTO public.family_members (family_id, user_id, role, status, invited_by)
SELECT
  f.id,
  f.created_by,
  'admin',
  'accepted',
  f.created_by
FROM public.families f
ON CONFLICT (family_id, user_id) DO UPDATE
SET role = 'admin',
    status = 'accepted',
    invited_by = EXCLUDED.invited_by,
    updated_at = NOW();

WITH deduped_family_members AS (
  SELECT
    b.family_id,
    bp.parent_id AS user_id,
    CASE
      WHEN BOOL_OR(bp.role = 'owner') THEN 'admin'
      ELSE 'member'
    END AS role,
    CASE
      WHEN BOOL_OR(bp.status = 'accepted') THEN 'accepted'
      WHEN BOOL_OR(bp.status = 'pending') THEN 'pending'
      ELSE 'declined'
    END AS status,
    (ARRAY_AGG(bp.invited_by) FILTER (WHERE bp.invited_by IS NOT NULL))[1] AS invited_by
  FROM public.baby_parents bp
  JOIN public.babies b ON b.id = bp.baby_id
  GROUP BY b.family_id, bp.parent_id
)
INSERT INTO public.family_members (family_id, user_id, role, status, invited_by)
SELECT
  family_id,
  user_id,
  role,
  status,
  invited_by
FROM deduped_family_members
ON CONFLICT (family_id, user_id) DO UPDATE
SET role = CASE
      WHEN public.family_members.role = 'admin' OR EXCLUDED.role = 'admin' THEN 'admin'
      ELSE 'member'
    END,
    status = CASE
      WHEN public.family_members.status = 'accepted' OR EXCLUDED.status = 'accepted' THEN 'accepted'
      WHEN public.family_members.status = 'pending' OR EXCLUDED.status = 'pending' THEN 'pending'
      ELSE EXCLUDED.status
    END,
    invited_by = COALESCE(public.family_members.invited_by, EXCLUDED.invited_by),
    updated_at = NOW();

INSERT INTO public.family_invitations (family_id, email, invited_by)
SELECT DISTINCT
  b.family_id,
  bi.email,
  bi.invited_by
FROM public.baby_invitations bi
JOIN public.babies b ON b.id = bi.baby_id
ON CONFLICT (family_id, email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_user_family(
  p_user_id UUID DEFAULT auth.uid(),
  p_family_name TEXT DEFAULT NULL
)
RETURNS public.families AS $$
DECLARE
  family_row public.families;
  default_name TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user id';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(full_name), ''), 'Family')
  INTO default_name
  FROM public.profiles
  WHERE id = p_user_id;

  INSERT INTO public.families (
    name,
    created_by,
    trial_started_at,
    trial_ends_at,
    subscription_status,
    revenuecat_app_user_id
  )
  VALUES (
    COALESCE(NULLIF(TRIM(p_family_name), ''), default_name, 'Family'),
    p_user_id,
    NOW(),
    NOW() + INTERVAL '7 days',
    'inactive',
    p_user_id::TEXT
  )
  ON CONFLICT DO NOTHING;

  SELECT f.*
  INTO family_row
  FROM public.families f
  WHERE f.created_by = p_user_id
  ORDER BY f.created_at ASC
  LIMIT 1;

  IF family_row.id IS NULL THEN
    RAISE EXCEPTION 'Failed to create or load family';
  END IF;

  INSERT INTO public.family_members (family_id, user_id, role, status, invited_by)
  VALUES (family_row.id, p_user_id, 'admin', 'accepted', p_user_id)
  ON CONFLICT (family_id, user_id) DO UPDATE
    SET role = 'admin',
        status = 'accepted',
        invited_by = EXCLUDED.invited_by,
        updated_at = NOW();

  RETURN family_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

GRANT EXECUTE ON FUNCTION public.ensure_user_family(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_family_trial(p_family_id UUID)
RETURNS public.families AS $$
DECLARE
  family_row public.families;
BEGIN
  UPDATE public.families
  SET trial_started_at = COALESCE(trial_started_at, NOW()),
      trial_ends_at = COALESCE(trial_ends_at, NOW() + INTERVAL '7 days'),
      updated_at = NOW()
  WHERE id = p_family_id;

  SELECT *
  INTO family_row
  FROM public.families
  WHERE id = p_family_id;

  RETURN family_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

GRANT EXECUTE ON FUNCTION public.ensure_family_trial(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_family_id(p_user_id UUID DEFAULT auth.uid())
RETURNS UUID AS $$
DECLARE
  family_uuid UUID;
BEGIN
  SELECT fm.family_id
  INTO family_uuid
  FROM public.family_members fm
  WHERE fm.user_id = p_user_id
    AND fm.status = 'accepted'
  ORDER BY CASE WHEN fm.role = 'admin' THEN 0 ELSE 1 END, fm.created_at ASC
  LIMIT 1;

  IF family_uuid IS NOT NULL THEN
    RETURN family_uuid;
  END IF;

  RETURN family_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_user_family_id(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_family_entitlement_status(p_family_id UUID)
RETURNS TABLE (
  family_id UUID,
  has_premium_access BOOLEAN,
  has_subscription_access BOOLEAN,
  is_trial_active BOOLEAN,
  access_source TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  subscription_status TEXT,
  subscription_provider TEXT,
  subscription_product_id TEXT,
  subscription_expires_at TIMESTAMPTZ
) AS $$
BEGIN
  PERFORM public.ensure_family_trial(p_family_id);

  RETURN QUERY
  WITH family_data AS (
    SELECT *
    FROM public.families
    WHERE id = p_family_id
  ),
  access_flags AS (
    SELECT
      f.id AS family_id,
      f.trial_started_at,
      f.trial_ends_at,
      f.subscription_status,
      f.subscription_provider,
      f.subscription_product_id,
      f.subscription_expires_at,
      COALESCE(
        f.subscription_product_id IS NOT NULL
        AND f.subscription_expires_at IS NOT NULL
        AND f.subscription_expires_at > NOW()
        AND f.subscription_status IN ('active', 'canceled', 'past_due'),
        FALSE
      ) AS has_subscription_access,
      COALESCE(f.trial_ends_at IS NOT NULL AND f.trial_ends_at > NOW(), FALSE) AS is_trial_active
    FROM family_data f
  )
  SELECT
    a.family_id,
    (a.has_subscription_access OR a.is_trial_active) AS has_premium_access,
    a.has_subscription_access,
    a.is_trial_active,
    CASE
      WHEN a.has_subscription_access THEN 'subscription'
      WHEN a.is_trial_active THEN 'trial'
      ELSE 'none'
    END AS access_source,
    a.trial_started_at,
    a.trial_ends_at,
    a.subscription_status,
    a.subscription_provider,
    a.subscription_product_id,
    a.subscription_expires_at
  FROM access_flags a;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_family_entitlement_status(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_family_entitlement_status()
RETURNS TABLE (
  family_id UUID,
  has_premium_access BOOLEAN,
  has_subscription_access BOOLEAN,
  is_trial_active BOOLEAN,
  access_source TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  subscription_status TEXT,
  subscription_provider TEXT,
  subscription_product_id TEXT,
  subscription_expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.get_family_entitlement_status(public.get_user_family_id(auth.uid()));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_my_family_entitlement_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_baby_entitlement_status(p_baby_id UUID)
RETURNS TABLE (
  family_id UUID,
  has_premium_access BOOLEAN,
  has_subscription_access BOOLEAN,
  is_trial_active BOOLEAN,
  access_source TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  subscription_status TEXT,
  subscription_provider TEXT,
  subscription_product_id TEXT,
  subscription_expires_at TIMESTAMPTZ
) AS $$
DECLARE
  target_family_id UUID;
BEGIN
  SELECT b.family_id
  INTO target_family_id
  FROM public.babies b
  WHERE b.id = p_baby_id;

  IF target_family_id IS NULL THEN
    RAISE EXCEPTION 'Baby not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = target_family_id
      AND fm.user_id = auth.uid()
      AND fm.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.get_family_entitlement_status(target_family_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_baby_entitlement_status(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_pending_family_invitations()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NULL OR TRIM(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.family_members (family_id, user_id, role, status, invited_by)
  SELECT fi.family_id, NEW.id, 'member', 'pending', fi.invited_by
  FROM public.family_invitations fi
  WHERE LOWER(TRIM(fi.email)) = LOWER(TRIM(NEW.email))
  ON CONFLICT (family_id, user_id) DO NOTHING;

  DELETE FROM public.family_invitations
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

DROP TRIGGER IF EXISTS on_profile_created_convert_family_invitations ON public.profiles;
CREATE TRIGGER on_profile_created_convert_family_invitations
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.convert_pending_family_invitations();

CREATE POLICY "Members can view their families"
  ON public.families FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = families.id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  );

CREATE POLICY "Creators can create families"
  ON public.families FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can update families"
  ON public.families FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = families.id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
        AND fm.role = 'admin'
    )
  );

CREATE POLICY "Members can view family membership"
  ON public.family_members FOR SELECT
  USING (
    family_id IN (
      SELECT fm.family_id
      FROM public.family_members fm
      WHERE fm.user_id = auth.uid()
        AND fm.status IN ('accepted', 'pending')
    )
  );

CREATE POLICY "Admins can invite family members"
  ON public.family_members FOR INSERT
  WITH CHECK (
    family_id IN (
      SELECT fm.family_id
      FROM public.family_members fm
      WHERE fm.user_id = auth.uid()
        AND fm.status = 'accepted'
        AND fm.role = 'admin'
    )
    AND invited_by = auth.uid()
  );

CREATE POLICY "Admins and invitees can update family members"
  ON public.family_members FOR UPDATE
  USING (
    user_id = auth.uid()
    OR family_id IN (
      SELECT fm.family_id
      FROM public.family_members fm
      WHERE fm.user_id = auth.uid()
        AND fm.status = 'accepted'
        AND fm.role = 'admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR family_id IN (
      SELECT fm.family_id
      FROM public.family_members fm
      WHERE fm.user_id = auth.uid()
        AND fm.status = 'accepted'
        AND fm.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete family members"
  ON public.family_members FOR DELETE
  USING (
    family_id IN (
      SELECT fm.family_id
      FROM public.family_members fm
      WHERE fm.user_id = auth.uid()
        AND fm.status = 'accepted'
        AND fm.role = 'admin'
    )
  );

CREATE POLICY "Accepted members can view family invitations"
  ON public.family_invitations FOR SELECT
  USING (
    family_id IN (
      SELECT fm.family_id
      FROM public.family_members fm
      WHERE fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  );

CREATE POLICY "Accepted admins can manage family invitations"
  ON public.family_invitations FOR ALL
  USING (
    family_id IN (
      SELECT fm.family_id
      FROM public.family_members fm
      WHERE fm.user_id = auth.uid()
        AND fm.status = 'accepted'
        AND fm.role = 'admin'
    )
  )
  WITH CHECK (
    family_id IN (
      SELECT fm.family_id
      FROM public.family_members fm
      WHERE fm.user_id = auth.uid()
        AND fm.status = 'accepted'
        AND fm.role = 'admin'
    )
    AND invited_by = auth.uid()
  );

DROP POLICY IF EXISTS "Parents can view babies they have access to" ON public.babies;
DROP POLICY IF EXISTS "Owners can create babies" ON public.babies;
DROP POLICY IF EXISTS "Owners can update babies" ON public.babies;

CREATE POLICY "Family members can view babies"
  ON public.babies FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = babies.family_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = babies.family_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'pending'
    )
  );

CREATE POLICY "Family admins can create babies"
  ON public.babies FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = babies.family_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
        AND fm.role = 'admin'
    )
  );

CREATE POLICY "Family admins can update babies"
  ON public.babies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = babies.family_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
        AND fm.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Parents can view sleep sessions for their babies" ON public.sleep_sessions;
DROP POLICY IF EXISTS "Parents can create sleep sessions for their babies" ON public.sleep_sessions;
DROP POLICY IF EXISTS "Parents can update sleep sessions they logged" ON public.sleep_sessions;
DROP POLICY IF EXISTS "Parents can delete sleep sessions they logged" ON public.sleep_sessions;

CREATE POLICY "Family members can view sleep sessions for family babies"
  ON public.sleep_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.family_members fm ON fm.family_id = b.family_id
      WHERE b.id = sleep_sessions.baby_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  );

CREATE POLICY "Family members can create sleep sessions"
  ON public.sleep_sessions FOR INSERT
  WITH CHECK (
    logged_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.family_members fm ON fm.family_id = b.family_id
      WHERE b.id = sleep_sessions.baby_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  );

CREATE POLICY "Family members can update sleep sessions they logged"
  ON public.sleep_sessions FOR UPDATE
  USING (
    logged_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.family_members fm ON fm.family_id = b.family_id
      WHERE b.id = sleep_sessions.baby_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  );

CREATE POLICY "Family members can delete sleep sessions they logged"
  ON public.sleep_sessions FOR DELETE
  USING (
    logged_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.family_members fm ON fm.family_id = b.family_id
      WHERE b.id = sleep_sessions.baby_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "Parents can view recommendations for their babies" ON public.recommendations;
DROP POLICY IF EXISTS "Parents can create recommendations for their babies" ON public.recommendations;

CREATE POLICY "Family members can view recommendations"
  ON public.recommendations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.family_members fm ON fm.family_id = b.family_id
      WHERE b.id = recommendations.baby_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  );

CREATE POLICY "Family members can create recommendations"
  ON public.recommendations FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.family_members fm ON fm.family_id = b.family_id
      WHERE b.id = recommendations.baby_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  );
