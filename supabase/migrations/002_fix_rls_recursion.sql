-- Fix infinite recursion in RLS policies
-- The issue is that baby_parents policies query babies table, which triggers babies policies

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Parents can view their baby-parent relationships" ON baby_parents;
DROP POLICY IF EXISTS "Owners can invite parents" ON baby_parents;
DROP POLICY IF EXISTS "Owners can add themselves when creating baby" ON baby_parents;
DROP POLICY IF EXISTS "Parents can view sleep sessions for their babies" ON sleep_sessions;
DROP POLICY IF EXISTS "Parents can create sleep sessions for their babies" ON sleep_sessions;
DROP POLICY IF EXISTS "Parents can update sleep sessions they logged" ON sleep_sessions;
DROP POLICY IF EXISTS "Parents can delete sleep sessions they logged" ON sleep_sessions;
DROP POLICY IF EXISTS "Parents can view recommendations for their babies" ON recommendations;
DROP POLICY IF EXISTS "Parents can create recommendations for their babies" ON recommendations;

-- Create a security definer function to check baby ownership (bypasses RLS)
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_baby_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_baby_owner(UUID) TO anon;

-- Recreate baby_parents policies using the function
CREATE POLICY "Parents can view their baby-parent relationships"
  ON baby_parents FOR SELECT
  USING (
    parent_id = auth.uid() OR
    is_baby_owner(baby_id)
  );

-- Policy for owners to add themselves when creating a baby
-- Uses the security definer function to bypass RLS
CREATE POLICY "Owners can add themselves when creating baby"
  ON baby_parents FOR INSERT
  WITH CHECK (
    is_baby_owner(baby_id)
    AND parent_id = auth.uid()
    AND role = 'owner'
    AND status = 'accepted'
  );

-- Policy for owners to invite other parents
CREATE POLICY "Owners can invite parents"
  ON baby_parents FOR INSERT
  WITH CHECK (
    is_baby_owner(baby_id)
    AND invited_by = auth.uid()
    AND parent_id != auth.uid()  -- Can't invite yourself (use the policy above)
  );

-- Recreate sleep_sessions policies
CREATE POLICY "Parents can view sleep sessions for their babies"
  ON sleep_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM baby_parents
      WHERE baby_parents.baby_id = sleep_sessions.baby_id
      AND baby_parents.parent_id = auth.uid()
      AND baby_parents.status = 'accepted'
    )
    OR is_baby_owner(baby_id)
  );

CREATE POLICY "Parents can create sleep sessions for their babies"
  ON sleep_sessions FOR INSERT
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM baby_parents
        WHERE baby_parents.baby_id = sleep_sessions.baby_id
        AND baby_parents.parent_id = auth.uid()
        AND baby_parents.status = 'accepted'
      )
      OR is_baby_owner(sleep_sessions.baby_id)
    )
    AND logged_by = auth.uid()
  );

CREATE POLICY "Parents can update sleep sessions they logged"
  ON sleep_sessions FOR UPDATE
  USING (
    logged_by = auth.uid() AND
    (
      EXISTS (
        SELECT 1 FROM baby_parents
        WHERE baby_parents.baby_id = sleep_sessions.baby_id
        AND baby_parents.parent_id = auth.uid()
        AND baby_parents.status = 'accepted'
      )
      OR is_baby_owner(baby_id)
    )
  );

CREATE POLICY "Parents can delete sleep sessions they logged"
  ON sleep_sessions FOR DELETE
  USING (
    logged_by = auth.uid() AND
    (
      EXISTS (
        SELECT 1 FROM baby_parents
        WHERE baby_parents.baby_id = sleep_sessions.baby_id
        AND baby_parents.parent_id = auth.uid()
        AND baby_parents.status = 'accepted'
      )
      OR is_baby_owner(baby_id)
    )
  );

-- Recreate recommendations policies
CREATE POLICY "Parents can view recommendations for their babies"
  ON recommendations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM baby_parents
      WHERE baby_parents.baby_id = recommendations.baby_id
      AND baby_parents.parent_id = auth.uid()
      AND baby_parents.status = 'accepted'
    )
    OR is_baby_owner(baby_id)
  );

CREATE POLICY "Parents can create recommendations for their babies"
  ON recommendations FOR INSERT
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM baby_parents
        WHERE baby_parents.baby_id = recommendations.baby_id
        AND baby_parents.parent_id = auth.uid()
        AND baby_parents.status = 'accepted'
      )
      OR is_baby_owner(baby_id)
    )
    AND requested_by = auth.uid()
  );

