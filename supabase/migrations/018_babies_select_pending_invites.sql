-- Allow users with a pending invitation to read the baby row (so they can see baby name on invite screen).
CREATE POLICY "Parents with pending invite can view baby"
  ON babies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM baby_parents
      WHERE baby_parents.baby_id = babies.id
      AND baby_parents.parent_id = auth.uid()
      AND baby_parents.status = 'pending'
    )
  );
