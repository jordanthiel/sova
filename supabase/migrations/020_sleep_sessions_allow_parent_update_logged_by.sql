-- Allow any parent/caregiver of the baby to update sleep sessions (including changing who logged it).
-- Previously only the row's logged_by user could update, so changing logged_by made the new row fail RLS.

DROP POLICY IF EXISTS "Parents can update sleep sessions they logged" ON sleep_sessions;

CREATE POLICY "Parents can update sleep sessions for their babies"
  ON sleep_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM baby_parents
      WHERE baby_parents.baby_id = sleep_sessions.baby_id
      AND baby_parents.parent_id = auth.uid()
      AND baby_parents.status = 'accepted'
    )
    OR is_baby_owner(baby_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM baby_parents
      WHERE baby_parents.baby_id = sleep_sessions.baby_id
      AND baby_parents.parent_id = auth.uid()
      AND baby_parents.status = 'accepted'
    )
    OR is_baby_owner(baby_id)
  );
