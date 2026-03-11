-- Stored nap target window: one row per baby, updated only when recommendation is recomputed
-- (e.g. after a nap completes or user manually refreshes). Enables comparing target vs actual.
CREATE TABLE IF NOT EXISTS stored_nap_targets (
  baby_id UUID PRIMARY KEY REFERENCES babies(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('next_nap', 'bedtime')),
  start_window_begin TIMESTAMPTZ NOT NULL,
  start_window_end TIMESTAMPTZ NOT NULL,
  recommended_cap_minutes INTEGER NOT NULL,
  expected_bedtime TIMESTAMPTZ NOT NULL,
  recommended_wake_window_minutes INTEGER,
  session_data_key TEXT,
  rest_of_day_schedule JSONB,
  explanation TEXT,
  reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stored_nap_targets_baby_id ON stored_nap_targets(baby_id);

-- RLS
ALTER TABLE stored_nap_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents can view stored nap targets for their babies"
  ON stored_nap_targets FOR SELECT
  USING (
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
      UNION
      SELECT id FROM babies WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Parents can insert stored nap targets for their babies"
  ON stored_nap_targets FOR INSERT
  WITH CHECK (
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
      UNION
      SELECT id FROM babies WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Parents can update stored nap targets for their babies"
  ON stored_nap_targets FOR UPDATE
  USING (
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
      UNION
      SELECT id FROM babies WHERE created_by = auth.uid()
    )
  );
