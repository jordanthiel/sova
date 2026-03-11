-- Optional title derived from first user message (truncated)
ALTER TABLE coach_conversations
  ADD COLUMN IF NOT EXISTS title TEXT;

CREATE POLICY "Parents can update coach conversations"
  ON coach_conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM baby_parents
      WHERE baby_parents.baby_id = coach_conversations.baby_id
      AND baby_parents.parent_id = auth.uid()
      AND baby_parents.status = 'accepted'
    )
    OR EXISTS (
      SELECT 1 FROM babies
      WHERE babies.id = coach_conversations.baby_id
      AND babies.created_by = auth.uid()
    )
  )
  WITH CHECK (true);
