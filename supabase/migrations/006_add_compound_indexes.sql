-- Add compound indexes for common query patterns
-- The app frequently queries sleep_sessions filtered by baby_id and ordered by start_time
-- A compound index allows Postgres to satisfy both the filter and sort in one index scan

-- Compound index for the most common query: sessions for a baby, newest first
CREATE INDEX IF NOT EXISTS idx_sleep_sessions_baby_start
  ON sleep_sessions (baby_id, start_time DESC);

-- Compound index for RLS policy lookups on baby_parents
CREATE INDEX IF NOT EXISTS idx_baby_parents_parent_status
  ON baby_parents (parent_id, status);

-- The old single-column indexes are now redundant for covered queries,
-- but we keep them for other query patterns
