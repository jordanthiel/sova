import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { Baby, BabyPreferences } from '@/types/domain';
import { DEFAULT_BABY_PREFERENCES } from '@/types/domain';

const PREFS_KEY_PREFIX = 'baby_preferences_';
const ACTIVE_BABY_KEY = 'active_baby_id';

export const babiesRepo = {
  async getActiveBaby(): Promise<Baby | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const savedId = await AsyncStorage.getItem(ACTIVE_BABY_KEY);

    const { data: memberships } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', user.id)
      .eq('status', 'accepted');

    const familyIds = [...new Set((memberships || []).map((row) => row.family_id).filter(Boolean))];
    if (familyIds.length === 0) return null;

    const { data: familyBabies } = await supabase
      .from('babies')
      .select('*')
      .in('family_id', familyIds)
      .order('birth_date', { ascending: false });

    const unique = Array.from(new Map((familyBabies || []).map((b) => [b.id, b])).values());
    if (unique.length === 0) return null;

    const target = savedId ? unique.find((b) => b.id === savedId) : unique[0];
    const raw = target || unique[0];

    const prefs = await babiesRepo.getPreferences(raw.id);

    return {
      id: raw.id,
      name: raw.name,
      birthdate: raw.birth_date,
      preferences: prefs,
      caregivers: [],
    };
  },

  async getActiveBabyId(): Promise<string | null> {
    return AsyncStorage.getItem(ACTIVE_BABY_KEY);
  },

  async setActiveBaby(babyId: string): Promise<void> {
    await AsyncStorage.setItem(ACTIVE_BABY_KEY, babyId);
  },

  async clearActiveBaby(): Promise<void> {
    await AsyncStorage.removeItem(ACTIVE_BABY_KEY);
  },

  async getPreferences(babyId: string): Promise<BabyPreferences> {
    try {
      const raw = await AsyncStorage.getItem(`${PREFS_KEY_PREFIX}${babyId}`);
      if (raw) return { ...DEFAULT_BABY_PREFERENCES, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULT_BABY_PREFERENCES };
  },

  async updatePreferences(
    babyId: string,
    patch: Partial<BabyPreferences>
  ): Promise<BabyPreferences> {
    const current = await babiesRepo.getPreferences(babyId);
    const updated = { ...current, ...patch };
    await AsyncStorage.setItem(
      `${PREFS_KEY_PREFIX}${babyId}`,
      JSON.stringify(updated)
    );
    return updated;
  },
};
