-- Coach conversations: one thread per conversation
CREATE TABLE IF NOT EXISTS coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coach_conversations_baby_id ON coach_conversations(baby_id);
CREATE INDEX IF NOT EXISTS idx_coach_conversations_created_at ON coach_conversations(created_at DESC);

ALTER TABLE coach_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can view coach conversations"
  ON coach_conversations FOR SELECT
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
  );

CREATE POLICY "Parents can create coach conversations"
  ON coach_conversations FOR INSERT
  WITH CHECK (
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
  );

-- Link chat_messages to conversations (nullable for backward compatibility)
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES coach_conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
