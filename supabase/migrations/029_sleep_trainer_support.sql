-- Sleep trainer support: external collaborators who can review logs, comment,
-- message families, and create trainer-authored sleep plans.

CREATE TABLE IF NOT EXISTS public.trainer_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  trainer_type TEXT NOT NULL DEFAULT 'human' CHECK (trainer_type IN ('human', 'ai_agent')),
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trainer_client_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  permissions JSONB NOT NULL DEFAULT '{
    "read_logs": true,
    "comment": true,
    "message": true,
    "write_plans": true
  }'::jsonb,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by_role TEXT NOT NULL DEFAULT 'family_admin' CHECK (invited_by_role IN ('family_admin', 'trainer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trainer_id, family_id)
);

CREATE TABLE IF NOT EXISTS public.sleep_session_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sleep_session_id UUID NOT NULL REFERENCES public.sleep_sessions(id) ON DELETE CASCADE,
  baby_id UUID NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (LENGTH(TRIM(body)) > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trainer_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  baby_id UUID REFERENCES public.babies(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(family_id, baby_id, trainer_id)
);

CREATE TABLE IF NOT EXISTS public.trainer_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.trainer_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (LENGTH(TRIM(body)) > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sleep_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL DEFAULT 'trainer' CHECK (author_type IN ('trainer', 'family', 'ai_agent')),
  title TEXT NOT NULL,
  summary TEXT,
  instructions JSONB NOT NULL DEFAULT '[]'::jsonb,
  starts_on DATE,
  ends_on DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  client_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainer_client_assignments_trainer
  ON public.trainer_client_assignments(trainer_id, status);
CREATE INDEX IF NOT EXISTS idx_trainer_client_assignments_family
  ON public.trainer_client_assignments(family_id, status);
CREATE INDEX IF NOT EXISTS idx_sleep_session_comments_session_created
  ON public.sleep_session_comments(sleep_session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sleep_session_comments_baby_created
  ON public.sleep_session_comments(baby_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trainer_conversations_family
  ON public.trainer_conversations(family_id, trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_conversations_baby
  ON public.trainer_conversations(baby_id, trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_messages_conversation_created
  ON public.trainer_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sleep_plans_baby_status
  ON public.sleep_plans(baby_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_plans_one_active_per_baby
  ON public.sleep_plans(baby_id)
  WHERE status = 'active';

ALTER TABLE public.trainer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sleep_session_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sleep_plans ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_family_member(
  p_family_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = p_family_id
      AND fm.user_id = p_user_id
      AND fm.status = 'accepted'
  ), FALSE);
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_family_admin(
  p_family_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = p_family_id
      AND fm.user_id = p_user_id
      AND fm.status = 'accepted'
      AND fm.role = 'admin'
  ), FALSE);
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_trainer_family_access(
  p_family_id UUID,
  p_user_id UUID DEFAULT auth.uid(),
  p_permission TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM public.trainer_client_assignments tca
    WHERE tca.family_id = p_family_id
      AND tca.trainer_id = p_user_id
      AND tca.status = 'accepted'
      AND (
        p_permission IS NULL
        OR COALESCE((tca.permissions ->> p_permission)::BOOLEAN, FALSE)
      )
  ), FALSE);
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_trainer_baby_access(
  p_baby_id UUID,
  p_user_id UUID DEFAULT auth.uid(),
  p_permission TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM public.babies b
    WHERE b.id = p_baby_id
      AND public.has_trainer_family_access(b.family_id, p_user_id, p_permission)
  ), FALSE);
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_baby_read_access(
  p_baby_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
    FROM public.babies b
    WHERE b.id = p_baby_id
      AND (
        public.is_family_member(b.family_id, p_user_id)
        OR public.has_trainer_family_access(b.family_id, p_user_id, 'read_logs')
      )
  ), FALSE);
$$ LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_family_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_trainer_family_access(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_trainer_baby_access(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_baby_read_access(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_sleep_session_comment_baby_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT ss.baby_id
  INTO NEW.baby_id
  FROM public.sleep_sessions ss
  WHERE ss.id = NEW.sleep_session_id;

  IF NEW.baby_id IS NULL THEN
    RAISE EXCEPTION 'Sleep session not found';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

DROP TRIGGER IF EXISTS set_sleep_session_comment_baby_id ON public.sleep_session_comments;
CREATE TRIGGER set_sleep_session_comment_baby_id
  BEFORE INSERT OR UPDATE OF sleep_session_id ON public.sleep_session_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_sleep_session_comment_baby_id();

DROP TRIGGER IF EXISTS update_trainer_profiles_updated_at ON public.trainer_profiles;
CREATE TRIGGER update_trainer_profiles_updated_at BEFORE UPDATE ON public.trainer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_trainer_client_assignments_updated_at ON public.trainer_client_assignments;
CREATE TRIGGER update_trainer_client_assignments_updated_at BEFORE UPDATE ON public.trainer_client_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sleep_session_comments_updated_at ON public.sleep_session_comments;
CREATE TRIGGER update_sleep_session_comments_updated_at BEFORE UPDATE ON public.sleep_session_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_trainer_conversations_updated_at ON public.trainer_conversations;
CREATE TRIGGER update_trainer_conversations_updated_at BEFORE UPDATE ON public.trainer_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sleep_plans_updated_at ON public.sleep_plans;
CREATE TRIGGER update_sleep_plans_updated_at BEFORE UPDATE ON public.sleep_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can manage their trainer profile"
  ON public.trainer_profiles FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Families can view assigned trainer profiles"
  ON public.trainer_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.trainer_client_assignments tca
      WHERE tca.trainer_id = trainer_profiles.user_id
        AND tca.status IN ('pending', 'accepted')
        AND public.is_family_member(tca.family_id)
    )
  );

CREATE POLICY "Assigned trainers can view client families"
  ON public.families FOR SELECT
  USING (public.has_trainer_family_access(families.id));

CREATE POLICY "Users can view related collaboration profiles"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.family_members viewer
      JOIN public.family_members related
        ON related.family_id = viewer.family_id
      WHERE viewer.user_id = auth.uid()
        AND viewer.status = 'accepted'
        AND related.user_id = profiles.id
        AND related.status IN ('accepted', 'pending')
    )
    OR EXISTS (
      SELECT 1
      FROM public.trainer_client_assignments tca
      WHERE tca.trainer_id = profiles.id
        AND tca.status IN ('pending', 'accepted')
        AND public.is_family_member(tca.family_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.trainer_client_assignments tca
      JOIN public.family_members fm ON fm.family_id = tca.family_id
      WHERE tca.trainer_id = auth.uid()
        AND tca.status = 'accepted'
        AND fm.user_id = profiles.id
        AND fm.status = 'accepted'
    )
  );

CREATE POLICY "Families and trainers can view assignments"
  ON public.trainer_client_assignments FOR SELECT
  USING (
    trainer_id = auth.uid()
    OR public.is_family_member(family_id)
  );

CREATE POLICY "Families and trainers can create assignments"
  ON public.trainer_client_assignments FOR INSERT
  WITH CHECK (
    invited_by = auth.uid()
    AND status = 'pending'
    AND (
      (
        invited_by_role = 'family_admin'
        AND public.is_family_admin(family_id)
      )
      OR (
        invited_by_role = 'trainer'
        AND trainer_id = auth.uid()
      )
    )
  );

CREATE POLICY "Families and trainers can update assignments"
  ON public.trainer_client_assignments FOR UPDATE
  USING (
    (
      trainer_id = auth.uid()
      AND invited_by_role = 'family_admin'
    )
    OR public.is_family_admin(family_id)
  )
  WITH CHECK (
    (
      trainer_id = auth.uid()
      AND invited_by_role = 'family_admin'
      AND status IN ('accepted', 'declined')
    )
    OR public.is_family_admin(family_id)
  );

CREATE POLICY "Family admins can delete trainer assignments"
  ON public.trainer_client_assignments FOR DELETE
  USING (
    public.is_family_admin(family_id)
    OR trainer_id = auth.uid()
  );

DROP POLICY IF EXISTS "Family members can view babies" ON public.babies;
CREATE POLICY "Family members and trainers can view babies"
  ON public.babies FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = babies.family_id
        AND fm.user_id = auth.uid()
        AND fm.status IN ('accepted', 'pending')
    )
    OR public.has_trainer_family_access(babies.family_id, auth.uid(), 'read_logs')
  );

DROP POLICY IF EXISTS "Family members can view sleep sessions for family babies" ON public.sleep_sessions;
CREATE POLICY "Family members and trainers can view sleep sessions"
  ON public.sleep_sessions FOR SELECT
  USING (public.has_baby_read_access(sleep_sessions.baby_id));

DROP POLICY IF EXISTS "Family members can view recommendations" ON public.recommendations;
CREATE POLICY "Family members and trainers can view recommendations"
  ON public.recommendations FOR SELECT
  USING (public.has_baby_read_access(recommendations.baby_id));

DROP POLICY IF EXISTS "Family members can view stored nap targets" ON public.stored_nap_targets;
CREATE POLICY "Family members and trainers can view stored nap targets"
  ON public.stored_nap_targets FOR SELECT
  USING (public.has_baby_read_access(stored_nap_targets.baby_id));

DROP POLICY IF EXISTS "Parents can view coach conversations" ON public.coach_conversations;
CREATE POLICY "Family members and trainers can view coach conversations"
  ON public.coach_conversations FOR SELECT
  USING (public.has_baby_read_access(coach_conversations.baby_id));

DROP POLICY IF EXISTS "Parents can create coach conversations" ON public.coach_conversations;
CREATE POLICY "Family members and trainers can create coach conversations"
  ON public.coach_conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = coach_conversations.baby_id
        AND (
          public.is_family_member(b.family_id)
          OR public.has_trainer_family_access(b.family_id, auth.uid(), 'message')
        )
    )
  );

DROP POLICY IF EXISTS "Parents can view their chat messages" ON public.chat_messages;
CREATE POLICY "Family members and trainers can view chat messages"
  ON public.chat_messages FOR SELECT
  USING (public.has_baby_read_access(chat_messages.baby_id));

DROP POLICY IF EXISTS "Parents can create chat messages" ON public.chat_messages;
CREATE POLICY "Family members and trainers can create chat messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = chat_messages.baby_id
        AND (
          public.is_family_member(b.family_id)
          OR public.has_trainer_family_access(b.family_id, auth.uid(), 'message')
        )
    )
  );

DROP POLICY IF EXISTS "Parents can view coach memories" ON public.coach_memories;
CREATE POLICY "Family members and trainers can view coach memories"
  ON public.coach_memories FOR SELECT
  USING (public.has_baby_read_access(coach_memories.baby_id));

DROP POLICY IF EXISTS "Parents can create coach memories" ON public.coach_memories;
CREATE POLICY "Family members and trainers can create coach memories"
  ON public.coach_memories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = coach_memories.baby_id
        AND public.is_family_member(b.family_id)
    )
  );

DROP POLICY IF EXISTS "Parents can delete coach memories" ON public.coach_memories;
CREATE POLICY "Family members can delete coach memories"
  ON public.coach_memories FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = coach_memories.baby_id
        AND public.is_family_member(b.family_id)
    )
  );

DROP POLICY IF EXISTS "Users can view night sleep scores for their babies" ON public.night_sleep_scores;
CREATE POLICY "Family members and trainers can view night sleep scores"
  ON public.night_sleep_scores FOR SELECT
  USING (public.has_baby_read_access(night_sleep_scores.baby_id));

DROP POLICY IF EXISTS "Users can insert night sleep scores for their babies" ON public.night_sleep_scores;
CREATE POLICY "Family members can insert night sleep scores"
  ON public.night_sleep_scores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = night_sleep_scores.baby_id
        AND public.is_family_member(b.family_id)
    )
  );

DROP POLICY IF EXISTS "Users can update night sleep scores for their babies" ON public.night_sleep_scores;
CREATE POLICY "Family members can update night sleep scores"
  ON public.night_sleep_scores FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = night_sleep_scores.baby_id
        AND public.is_family_member(b.family_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = night_sleep_scores.baby_id
        AND public.is_family_member(b.family_id)
    )
  );

CREATE POLICY "Family members and trainers can view sleep session comments"
  ON public.sleep_session_comments FOR SELECT
  USING (public.has_baby_read_access(sleep_session_comments.baby_id));

CREATE POLICY "Family members and trainers can create sleep session comments"
  ON public.sleep_session_comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = sleep_session_comments.baby_id
        AND (
          public.is_family_member(b.family_id)
          OR public.has_trainer_family_access(b.family_id, auth.uid(), 'comment')
        )
    )
  );

CREATE POLICY "Authors can update sleep session comments"
  ON public.sleep_session_comments FOR UPDATE
  USING (
    author_id = auth.uid()
    AND public.has_baby_read_access(sleep_session_comments.baby_id)
  )
  WITH CHECK (
    author_id = auth.uid()
    AND public.has_baby_read_access(sleep_session_comments.baby_id)
  );

CREATE POLICY "Authors can delete sleep session comments"
  ON public.sleep_session_comments FOR DELETE
  USING (
    author_id = auth.uid()
    AND public.has_baby_read_access(sleep_session_comments.baby_id)
  );

CREATE POLICY "Families and trainers can view trainer conversations"
  ON public.trainer_conversations FOR SELECT
  USING (
    public.is_family_member(family_id)
    OR (
      trainer_id = auth.uid()
      AND public.has_trainer_family_access(family_id, auth.uid(), 'message')
    )
  );

CREATE POLICY "Families and trainers can create trainer conversations"
  ON public.trainer_conversations FOR INSERT
  WITH CHECK (
    public.has_trainer_family_access(family_id, trainer_id, 'message')
    AND
    (
      public.is_family_member(family_id)
      OR (
        trainer_id = auth.uid()
        AND public.has_trainer_family_access(family_id, auth.uid(), 'message')
      )
    )
    AND (
      baby_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.babies b
        WHERE b.id = trainer_conversations.baby_id
          AND b.family_id = trainer_conversations.family_id
      )
    )
  );

CREATE POLICY "Families and trainers can update trainer conversations"
  ON public.trainer_conversations FOR UPDATE
  USING (
    public.is_family_member(family_id)
    OR (
      trainer_id = auth.uid()
      AND public.has_trainer_family_access(family_id, auth.uid(), 'message')
    )
  )
  WITH CHECK (
    public.is_family_member(family_id)
    OR (
      trainer_id = auth.uid()
      AND public.has_trainer_family_access(family_id, auth.uid(), 'message')
    )
  );

CREATE POLICY "Families and trainers can view trainer messages"
  ON public.trainer_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.trainer_conversations tc
      WHERE tc.id = trainer_messages.conversation_id
        AND (
          public.is_family_member(tc.family_id)
          OR (
            tc.trainer_id = auth.uid()
            AND public.has_trainer_family_access(tc.family_id, auth.uid(), 'message')
          )
        )
    )
  );

CREATE POLICY "Families and trainers can create trainer messages"
  ON public.trainer_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trainer_conversations tc
      WHERE tc.id = trainer_messages.conversation_id
        AND (
          public.is_family_member(tc.family_id)
          OR (
            tc.trainer_id = auth.uid()
            AND public.has_trainer_family_access(tc.family_id, auth.uid(), 'message')
          )
        )
    )
  );

CREATE POLICY "Family members and assigned trainers can view sleep plans"
  ON public.sleep_plans FOR SELECT
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = sleep_plans.baby_id
        AND (
          public.is_family_member(b.family_id)
          OR (
            sleep_plans.client_visible = TRUE
            AND public.has_trainer_family_access(b.family_id, auth.uid(), 'write_plans')
          )
        )
    )
  );

CREATE POLICY "Families and trainers can create sleep plans"
  ON public.sleep_plans FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = sleep_plans.baby_id
        AND (
          public.is_family_member(b.family_id)
          OR (
            sleep_plans.author_type IN ('trainer', 'ai_agent')
            AND public.has_trainer_family_access(b.family_id, auth.uid(), 'write_plans')
          )
        )
    )
  );

CREATE POLICY "Families and plan authors can update sleep plans"
  ON public.sleep_plans FOR UPDATE
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = sleep_plans.baby_id
        AND public.is_family_member(b.family_id)
    )
  )
  WITH CHECK (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = sleep_plans.baby_id
        AND public.is_family_member(b.family_id)
    )
  );

CREATE POLICY "Families and plan authors can delete sleep plans"
  ON public.sleep_plans FOR DELETE
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.babies b
      WHERE b.id = sleep_plans.baby_id
        AND public.is_family_member(b.family_id)
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sleep_session_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.trainer_conversations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.trainer_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sleep_plans;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
