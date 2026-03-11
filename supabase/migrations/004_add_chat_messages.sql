-- Add chat messages table for conversational AI coach
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_chat_messages_baby_id ON chat_messages(baby_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- Enable realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_messages
CREATE POLICY "Parents can view their chat messages"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM baby_parents
      WHERE baby_parents.baby_id = chat_messages.baby_id
      AND baby_parents.parent_id = auth.uid()
      AND baby_parents.status = 'accepted'
    )
    OR EXISTS (
      SELECT 1 FROM babies
      WHERE babies.id = chat_messages.baby_id
      AND babies.created_by = auth.uid()
    )
  );

CREATE POLICY "Parents can create chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM baby_parents
        WHERE baby_parents.baby_id = chat_messages.baby_id
        AND baby_parents.parent_id = auth.uid()
        AND baby_parents.status = 'accepted'
      )
      OR EXISTS (
        SELECT 1 FROM babies
        WHERE babies.id = chat_messages.baby_id
        AND babies.created_by = auth.uid()
      )
    )
  );

-- Function to automatically create assistant messages (for system messages)
-- This will be called by the Edge Function
CREATE OR REPLACE FUNCTION public.create_assistant_message(
  p_baby_id UUID,
  p_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id UUID;
BEGIN
  INSERT INTO chat_messages (baby_id, user_id, role, content)
  VALUES (p_baby_id, (SELECT created_by FROM babies WHERE id = p_baby_id), 'assistant', p_content)
  RETURNING id INTO v_message_id;
  RETURN v_message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_assistant_message(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_assistant_message(UUID, TEXT) TO anon;

