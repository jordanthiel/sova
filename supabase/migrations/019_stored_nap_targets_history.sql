-- Allow multiple stored nap target rows per baby (history of recommendations).
-- Each new recommendation is inserted; only "regenerate" (user refresh) updates the current row.
-- Existing single row per baby becomes one row; new PK is id.

-- Add id column (nullable first so we can backfill)
ALTER TABLE stored_nap_targets ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Backfill id for any existing rows (e.g. from before this migration)
UPDATE stored_nap_targets SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE stored_nap_targets ALTER COLUMN id SET NOT NULL;

-- Drop old primary key and add new one
ALTER TABLE stored_nap_targets DROP CONSTRAINT IF EXISTS stored_nap_targets_pkey;
ALTER TABLE stored_nap_targets ADD PRIMARY KEY (id);

-- Index for "get latest by baby_id" (order by created_at desc)
CREATE INDEX IF NOT EXISTS idx_stored_nap_targets_baby_created
  ON stored_nap_targets(baby_id, created_at DESC);

-- Keep existing baby_id index for list/filter
-- (idx_stored_nap_targets_baby_id already exists from 012)

COMMENT ON TABLE stored_nap_targets IS 'History of nap/bedtime recommendations per baby. Each new recommendation inserts a row; user regenerate (refresh) updates the current row in place.';
