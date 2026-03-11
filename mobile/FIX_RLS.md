# Fix RLS Infinite Recursion

## Problem
The RLS policies were causing infinite recursion because `baby_parents` policies were querying the `babies` table, which triggered the `babies` policies, creating a circular dependency.

## Solution
A new migration (`002_fix_rls_recursion.sql`) has been created that:
1. Creates a security definer function `is_baby_owner()` that bypasses RLS to check ownership
2. Updates all policies to use this function instead of directly querying the `babies` table

## Apply the Fix

### If using local Supabase:
```bash
supabase db reset
# This will apply all migrations including the fix
```

Or apply just the new migration:
```bash
supabase migration up
```

### If using remote Supabase:
1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase/migrations/002_fix_rls_recursion.sql`
4. Run it

## Enable Expo Logs

To see logs in Expo:

1. **In the terminal where Expo is running:**
   - Press `j` to open the debugger
   - Or check the terminal output directly

2. **Enable remote debugging:**
   - Shake your device/simulator (or press `Cmd+D` on iOS simulator, `Cmd+M` on Android)
   - Select "Debug Remote JS"
   - Open Chrome DevTools at `http://localhost:19000/debugger-ui`

3. **Use React Native Debugger:**
   ```bash
   npm install -g react-native-debugger
   # Then open it and connect
   ```

4. **Check Metro bundler logs:**
   - The terminal running `expo start` shows all console.log output
   - Look for errors in red

5. **Enable verbose logging:**
   ```bash
   EXPO_DEBUG=true npx expo start
   ```

6. **Use Flipper (for advanced debugging):**
   - Install Flipper: https://fbflipper.com/
   - It will automatically connect to your Expo app

## Quick Test

After applying the migration, test by:
1. Restart your Expo app
2. Try to sign up/login
3. Create a baby profile
4. Check that you can view the baby without recursion errors


