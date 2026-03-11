-- Night sleep scores: one row per baby per extended day (night that ended that morning).
-- Score is computed when a night is complete and stored here to avoid recalculating.
CREATE TABLE IF NOT EXISTS night_sleep_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  date_key TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  total_sleep_minutes INTEGER NOT NULL,
  wakeup_count INTEGER NOT NULL,
  total_awake_minutes INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(baby_id, date_key)
);

CREATE INDEX IF NOT EXISTS idx_night_sleep_scores_baby_date ON night_sleep_scores(baby_id, date_key);

ALTER TABLE night_sleep_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view night sleep scores for their babies"
  ON night_sleep_scores FOR SELECT
  USING (
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
    )
  );

CREATE POLICY "Users can insert night sleep scores for their babies"
  ON night_sleep_scores FOR INSERT
  WITH CHECK (
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
    )
  );

CREATE POLICY "Users can update night sleep scores for their babies"
  ON night_sleep_scores FOR UPDATE
  USING (
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
    )
  );

-- Backfill is done from the app (ensureNightScoresBackfilled) so date_key uses
-- the same extended-day logic (6am–6am local) and segment merging as the client.
