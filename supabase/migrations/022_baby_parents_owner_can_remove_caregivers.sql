-- Allow baby owner (admin) to remove other caregivers from the baby.
-- Owner cannot remove themselves (parent_id != auth.uid()).
CREATE POLICY "Owners can remove caregivers"
  ON baby_parents FOR DELETE
  USING (
    is_baby_owner(baby_id)
    AND parent_id != auth.uid()
  );
