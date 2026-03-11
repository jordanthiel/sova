-- Coach memories: LLM-extracted preferences/context from coach conversations.
-- Users can keep or remove these; they are used to personalize recommendations.
CREATE TABLE IF NOT EXISTS coach_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_memories_baby_id ON coach_memories(baby_id);
CREATE INDEX IF NOT EXISTS idx_coach_memories_created_at ON coach_memories(created_at DESC);

ALTER TABLE coach_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can view coach memories"
  ON coach_memories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM baby_parents
      WHERE baby_parents.baby_id = coach_memories.baby_id
      AND baby_parents.parent_id = auth.uid()
      AND baby_parents.status = 'accepted'
    )
    OR EXISTS (
      SELECT 1 FROM babies
      WHERE babies.id = coach_memories.baby_id
      AND babies.created_by = auth.uid()
    )
  );

CREATE POLICY "Parents can create coach memories"
  ON coach_memories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM baby_parents
      WHERE baby_parents.baby_id = coach_memories.baby_id
      AND baby_parents.parent_id = auth.uid()
      AND baby_parents.status = 'accepted'
    )
    OR EXISTS (
      SELECT 1 FROM babies
      WHERE babies.id = coach_memories.baby_id
      AND babies.created_by = auth.uid()
    )
  );

CREATE POLICY "Parents can delete coach memories"
  ON coach_memories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM baby_parents
      WHERE baby_parents.baby_id = coach_memories.baby_id
      AND baby_parents.parent_id = auth.uid()
      AND baby_parents.status = 'accepted'
    )
    OR EXISTS (
      SELECT 1 FROM babies
      WHERE babies.id = coach_memories.baby_id
      AND babies.created_by = auth.uid()
    )
  );
