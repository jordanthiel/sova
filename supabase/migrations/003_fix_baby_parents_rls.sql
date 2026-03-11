-- Fix RLS policies for baby_parents table
-- This migration fixes the "row violates row level security" error
-- by adding a policy that allows owners to add themselves when creating a baby

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Owners can add themselves when creating baby" ON baby_parents;

-- Ensure the is_baby_owner function exists (in case migration 002 wasn't applied)
CREATE OR REPLACE FUNCTION public.is_baby_owner(baby_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.babies
    WHERE id = baby_id_param
    AND created_by = auth.uid()
  );
END;
$$;

-- Grant execute permission to authenticated users (idempotent)
GRANT EXECUTE ON FUNCTION public.is_baby_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_baby_owner(UUID) TO anon;

-- Policy for owners to add themselves when creating a baby
-- This is needed because when a user creates a baby, they need to insert
-- themselves into baby_parents without an invited_by field
CREATE POLICY "Owners can add themselves when creating baby"
  ON baby_parents FOR INSERT
  WITH CHECK (
    is_baby_owner(baby_id)
    AND parent_id = auth.uid()
    AND role = 'owner'
    AND status = 'accepted'
  );

-- Update the "Owners can invite parents" policy to ensure it doesn't conflict
-- Drop and recreate to make sure it's correct
DROP POLICY IF EXISTS "Owners can invite parents" ON baby_parents;

CREATE POLICY "Owners can invite parents"
  ON baby_parents FOR INSERT
  WITH CHECK (
    is_baby_owner(baby_id)
    AND invited_by = auth.uid()
    AND parent_id != auth.uid()  -- Can't invite yourself (use the policy above)
  );


