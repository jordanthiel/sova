-- Add monetization fields to profiles and helper RPCs for app-managed trials.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS subscription_provider TEXT,
  ADD COLUMN IF NOT EXISTS subscription_product_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revenuecat_app_user_id TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_customer_id TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('inactive', 'active', 'canceled', 'past_due', 'expired'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_provider_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_provider_check
  CHECK (subscription_provider IS NULL OR subscription_provider IN ('revenuecat'));

COMMENT ON COLUMN public.profiles.trial_started_at IS 'When the user first received their 7-day app-managed premium trial';
COMMENT ON COLUMN public.profiles.trial_ends_at IS 'When the user''s app-managed premium trial expires';
COMMENT ON COLUMN public.profiles.subscription_status IS 'Current paid subscription state managed by RevenueCat';
COMMENT ON COLUMN public.profiles.subscription_provider IS 'Billing provider for the active or latest paid subscription';
COMMENT ON COLUMN public.profiles.subscription_product_id IS 'Current paid product identifier from RevenueCat';
COMMENT ON COLUMN public.profiles.subscription_expires_at IS 'Current paid subscription expiry timestamp from RevenueCat';
COMMENT ON COLUMN public.profiles.subscription_updated_at IS 'When paid subscription metadata was last synced';
COMMENT ON COLUMN public.profiles.revenuecat_app_user_id IS 'RevenueCat app user id mapped to this profile';
COMMENT ON COLUMN public.profiles.revenuecat_customer_id IS 'Latest RevenueCat original app user id / customer id for this profile';

CREATE INDEX IF NOT EXISTS idx_profiles_trial_ends_at ON public.profiles (trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_expires_at ON public.profiles (subscription_expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_revenuecat_app_user_id ON public.profiles (revenuecat_app_user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    trial_started_at,
    trial_ends_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NOW(),
    NOW() + INTERVAL '7 days'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
        trial_started_at = COALESCE(public.profiles.trial_started_at, EXCLUDED.trial_started_at),
        trial_ends_at = COALESCE(public.profiles.trial_ends_at, EXCLUDED.trial_ends_at),
        updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

CREATE OR REPLACE FUNCTION public.ensure_profile_trial(p_user_id UUID DEFAULT auth.uid())
RETURNS public.profiles AS $$
DECLARE
  profile_row public.profiles;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user id';
  END IF;

  INSERT INTO public.profiles (id, trial_started_at, trial_ends_at)
  VALUES (p_user_id, NOW(), NOW() + INTERVAL '7 days')
  ON CONFLICT (id) DO UPDATE
    SET trial_started_at = COALESCE(public.profiles.trial_started_at, EXCLUDED.trial_started_at),
        trial_ends_at = COALESCE(public.profiles.trial_ends_at, EXCLUDED.trial_ends_at),
        updated_at = NOW();

  SELECT *
  INTO profile_row
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN profile_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

GRANT EXECUTE ON FUNCTION public.ensure_profile_trial(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_entitlement_status(p_user_id UUID)
RETURNS TABLE (
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
  WITH profile_data AS (
    SELECT *
    FROM public.ensure_profile_trial(p_user_id)
  ),
  access_flags AS (
    SELECT
      p.trial_started_at,
      p.trial_ends_at,
      p.subscription_status,
      p.subscription_provider,
      p.subscription_product_id,
      p.subscription_expires_at,
      COALESCE(
        p.subscription_product_id IS NOT NULL
        AND p.subscription_expires_at IS NOT NULL
        AND p.subscription_expires_at > NOW()
        AND p.subscription_status IN ('active', 'canceled', 'past_due'),
        FALSE
      ) AS has_subscription_access,
      COALESCE(p.trial_ends_at IS NOT NULL AND p.trial_ends_at > NOW(), FALSE) AS is_trial_active
    FROM profile_data p
  )
  SELECT
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

GRANT EXECUTE ON FUNCTION public.get_entitlement_status(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_entitlement_status()
RETURNS TABLE (
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
  FROM public.get_entitlement_status(auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_my_entitlement_status() TO authenticated;
