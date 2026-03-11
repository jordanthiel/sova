-- Let PostgREST/Supabase see the relationship between baby_parents and profiles
-- so that .select('..., profiles(full_name, email)') works. parent_id already
-- references auth.users(id) and profiles.id references auth.users(id); this
-- explicit FK to profiles makes the relationship visible in the schema cache.
ALTER TABLE baby_parents
  ADD CONSTRAINT baby_parents_parent_id_profiles_fkey
  FOREIGN KEY (parent_id) REFERENCES profiles(id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT baby_parents_parent_id_profiles_fkey ON baby_parents IS
  'Enables PostgREST embed: baby_parents -> profiles for parent display names';
