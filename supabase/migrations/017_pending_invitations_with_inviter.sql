-- Allow authenticated users to read other profiles' display names (e.g. "Invited by X").
-- Required so the app can show inviter name on pending invitations without an RPC.
CREATE POLICY "Authenticated can read profile names"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);
