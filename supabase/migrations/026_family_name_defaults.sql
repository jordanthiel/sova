-- Default new family names to "<last name> Family" when no explicit name is provided.

CREATE OR REPLACE FUNCTION public.ensure_user_family(
  p_user_id UUID DEFAULT auth.uid(),
  p_family_name TEXT DEFAULT NULL
)
RETURNS public.families AS $$
DECLARE
  family_row public.families;
  full_name_value TEXT;
  last_name_value TEXT;
  generated_family_name TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user id';
  END IF;

  SELECT NULLIF(TRIM(full_name), '')
  INTO full_name_value
  FROM public.profiles
  WHERE id = p_user_id;

  last_name_value := NULLIF(TRIM(regexp_replace(COALESCE(full_name_value, ''), '^.*\s+', '')), '');

  generated_family_name := COALESCE(
    NULLIF(TRIM(p_family_name), ''),
    CASE
      WHEN last_name_value IS NOT NULL THEN last_name_value || ' Family'
      WHEN full_name_value IS NOT NULL THEN full_name_value || ' Family'
      ELSE 'Family'
    END
  );

  INSERT INTO public.families (
    name,
    created_by,
    trial_started_at,
    trial_ends_at,
    subscription_status,
    revenuecat_app_user_id
  )
  VALUES (
    generated_family_name,
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
