-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Babies table
CREATE TABLE IF NOT EXISTS babies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Baby-parents junction table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS baby_parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(baby_id, parent_id)
);

-- Sleep sessions table
CREATE TABLE IF NOT EXISTS sleep_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  logged_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('nap', 'night')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recommendations table (stores ChatGPT recommendations)
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id UUID NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  recommendation_text TEXT NOT NULL,
  context_data JSONB, -- Stores sleep history context used for the recommendation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_baby_parents_baby_id ON baby_parents(baby_id);
CREATE INDEX IF NOT EXISTS idx_baby_parents_parent_id ON baby_parents(parent_id);
CREATE INDEX IF NOT EXISTS idx_sleep_sessions_baby_id ON sleep_sessions(baby_id);
CREATE INDEX IF NOT EXISTS idx_sleep_sessions_start_time ON sleep_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_recommendations_baby_id ON recommendations(baby_id);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE babies ENABLE ROW LEVEL SECURITY;
ALTER TABLE baby_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Babies policies
CREATE POLICY "Parents can view babies they have access to"
  ON babies FOR SELECT
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM baby_parents
      WHERE baby_parents.baby_id = babies.id
      AND baby_parents.parent_id = auth.uid()
      AND baby_parents.status = 'accepted'
    )
  );

CREATE POLICY "Owners can create babies"
  ON babies FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can update babies"
  ON babies FOR UPDATE
  USING (created_by = auth.uid());

-- Baby-parents policies
CREATE POLICY "Parents can view their baby-parent relationships"
  ON baby_parents FOR SELECT
  USING (
    parent_id = auth.uid() OR
    baby_id IN (
      SELECT id FROM babies WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Owners can invite parents"
  ON baby_parents FOR INSERT
  WITH CHECK (
    baby_id IN (
      SELECT id FROM babies WHERE created_by = auth.uid()
    )
    AND invited_by = auth.uid()
  );

CREATE POLICY "Invited parents can accept/decline invitations"
  ON baby_parents FOR UPDATE
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- Sleep sessions policies
CREATE POLICY "Parents can view sleep sessions for their babies"
  ON sleep_sessions FOR SELECT
  USING (
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
      UNION
      SELECT id FROM babies WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Parents can create sleep sessions for their babies"
  ON sleep_sessions FOR INSERT
  WITH CHECK (
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
      UNION
      SELECT id FROM babies WHERE created_by = auth.uid()
    )
    AND logged_by = auth.uid()
  );

CREATE POLICY "Parents can update sleep sessions they logged"
  ON sleep_sessions FOR UPDATE
  USING (
    logged_by = auth.uid() AND
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
      UNION
      SELECT id FROM babies WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Parents can delete sleep sessions they logged"
  ON sleep_sessions FOR DELETE
  USING (
    logged_by = auth.uid() AND
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
      UNION
      SELECT id FROM babies WHERE created_by = auth.uid()
    )
  );

-- Recommendations policies
CREATE POLICY "Parents can view recommendations for their babies"
  ON recommendations FOR SELECT
  USING (
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
      UNION
      SELECT id FROM babies WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Parents can create recommendations for their babies"
  ON recommendations FOR INSERT
  WITH CHECK (
    baby_id IN (
      SELECT baby_id FROM baby_parents
      WHERE parent_id = auth.uid() AND status = 'accepted'
      UNION
      SELECT id FROM babies WHERE created_by = auth.uid()
    )
    AND requested_by = auth.uid()
  );

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_babies_updated_at BEFORE UPDATE ON babies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_baby_parents_updated_at BEFORE UPDATE ON baby_parents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sleep_sessions_updated_at BEFORE UPDATE ON sleep_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();



