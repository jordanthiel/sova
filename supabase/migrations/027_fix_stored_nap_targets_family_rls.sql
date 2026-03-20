-- Align stored_nap_targets RLS with the family-based access model.
-- The original policies still referenced baby_parents, which blocks
-- inserts/updates for users who now access babies through family_members.

DROP POLICY IF EXISTS "Parents can view stored nap targets for their babies" ON public.stored_nap_targets;
DROP POLICY IF EXISTS "Parents can insert stored nap targets for their babies" ON public.stored_nap_targets;
DROP POLICY IF EXISTS "Parents can update stored nap targets for their babies" ON public.stored_nap_targets;

CREATE POLICY "Family members can view stored nap targets"
  ON public.stored_nap_targets FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.family_members fm ON fm.family_id = b.family_id
      WHERE b.id = stored_nap_targets.baby_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  );

CREATE POLICY "Family members can create stored nap targets"
  ON public.stored_nap_targets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.family_members fm ON fm.family_id = b.family_id
      WHERE b.id = stored_nap_targets.baby_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  );

CREATE POLICY "Family members can update stored nap targets"
  ON public.stored_nap_targets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.family_members fm ON fm.family_id = b.family_id
      WHERE b.id = stored_nap_targets.baby_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.family_members fm ON fm.family_id = b.family_id
      WHERE b.id = stored_nap_targets.baby_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'accepted'
    )
  );
