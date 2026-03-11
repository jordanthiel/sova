-- Fix "relation baby_parents does not exist" during signup
-- The convert_pending_invitations trigger runs in Auth context where search_path
-- may not include public, so unqualified table names fail to resolve.
-- Setting search_path = public ensures baby_parents and baby_invitations are found.

CREATE OR REPLACE FUNCTION public.convert_pending_invitations_to_baby_parents()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NULL OR TRIM(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.baby_parents (baby_id, parent_id, role, status, invited_by)
  SELECT bi.baby_id, NEW.id, 'member', 'pending', bi.invited_by
  FROM public.baby_invitations bi
  WHERE LOWER(TRIM(bi.email)) = LOWER(TRIM(NEW.email))
  ON CONFLICT (baby_id, parent_id) DO NOTHING;

  DELETE FROM public.baby_invitations
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;
