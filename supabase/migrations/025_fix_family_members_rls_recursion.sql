-- Fix infinite recursion in family_members RLS policies.
-- The initial family model policies queried family_members from inside
-- family_members policies, which causes Postgres to recurse indefinitely.

DROP POLICY IF EXISTS "Members can view family membership" ON public.family_members;
DROP POLICY IF EXISTS "Admins can invite family members" ON public.family_members;
DROP POLICY IF EXISTS "Admins and invitees can update family members" ON public.family_members;
DROP POLICY IF EXISTS "Admins can delete family members" ON public.family_members;

CREATE OR REPLACE FUNCTION public.is_family_member(
  p_family_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.family_members
    WHERE family_id = p_family_id
      AND user_id = p_user_id
      AND status = 'accepted'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_family_admin(
  p_family_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.family_members
    WHERE family_id = p_family_id
      AND user_id = p_user_id
      AND status = 'accepted'
      AND role = 'admin'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_family_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_admin(UUID, UUID) TO authenticated;

CREATE POLICY "Members can view family membership"
  ON public.family_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_family_member(family_id)
  );

CREATE POLICY "Admins can invite family members"
  ON public.family_members FOR INSERT
  WITH CHECK (
    public.is_family_admin(family_id)
    AND invited_by = auth.uid()
  );

CREATE POLICY "Admins and invitees can update family members"
  ON public.family_members FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.is_family_admin(family_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_family_admin(family_id)
  );

CREATE POLICY "Admins can delete family members"
  ON public.family_members FOR DELETE
  USING (public.is_family_admin(family_id));
