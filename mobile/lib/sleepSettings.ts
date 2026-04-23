import { getAppNow } from '@/lib/appClock';
import { supabase } from '@/lib/supabase';

export interface SleepSettings {
  /** Hour (0-23) when night sleep typically starts. Default 19 (7 PM) */
  nightStartHour: number;
  /** Hour (0-23) when night sleep typically ends (and nap time begins). Default 7 (7 AM) */
  nightEndHour: number;
}

const DEFAULT_SETTINGS: SleepSettings = {
  nightStartHour: 19,
  nightEndHour: 7,
};

// In-memory cache so we don't hit the DB on every call
let cachedSettings: SleepSettings | null = null;

/**
 * Fetch sleep settings from the user's profile in Supabase.
 * Falls back to defaults if not authenticated or on error.
 */
export async function getSleepSettings(): Promise<SleepSettings> {
  if (cachedSettings) return cachedSettings;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return DEFAULT_SETTINGS;

    const { data, error } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', user.id)
      .single();

    if (error || !data?.settings) {
      cachedSettings = DEFAULT_SETTINGS;
      return DEFAULT_SETTINGS;
    }

    const raw = data.settings as Record<string, unknown>;
    cachedSettings = {
      nightStartHour: typeof raw.night_start_hour === 'number' ? raw.night_start_hour : DEFAULT_SETTINGS.nightStartHour,
      nightEndHour: typeof raw.night_end_hour === 'number' ? raw.night_end_hour : DEFAULT_SETTINGS.nightEndHour,
    };
    return cachedSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save sleep settings to the user's profile in Supabase.
 * Returns the merged settings.
 */
export async function saveSleepSettings(settings: Partial<SleepSettings>): Promise<SleepSettings> {
  const current = await getSleepSettings();
  const merged: SleepSettings = { ...current, ...settings };

  // Update cache immediately for fast UI
  cachedSettings = merged;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return merged;

    // Read existing settings so we don't overwrite unrelated keys
    const { data: profile } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', user.id)
      .single();

    const existingSettings = (profile?.settings as Record<string, unknown>) || {};

    await supabase
      .from('profiles')
      .update({
        settings: {
          ...existingSettings,
          night_start_hour: merged.nightStartHour,
          night_end_hour: merged.nightEndHour,
        },
      })
      .eq('id', user.id);
  } catch (err) {
    console.warn('Failed to save sleep settings to DB:', err);
  }

  return merged;
}

/**
 * Clear the in-memory cache (e.g. on logout or user switch).
 */
export function clearSettingsCache(): void {
  cachedSettings = null;
}

/**
 * Determines if a given hour is "night time" based on settings.
 * Night is from nightStartHour to nightEndHour (wrapping past midnight).
 */
export function isNightTime(hour: number, settings: SleepSettings): boolean {
  const { nightStartHour, nightEndHour } = settings;
  if (nightStartHour > nightEndHour) {
    // Wraps past midnight: e.g. 19→7 means 19,20,21,22,23,0,1,2,3,4,5,6
    return hour >= nightStartHour || hour < nightEndHour;
  }
  return hour >= nightStartHour && hour < nightEndHour;
}

/**
 * Returns the auto-detected sleep type for the current time.
 */
export function getAutoSleepType(settings: SleepSettings): 'nap' | 'night' {
  return isNightTime(getAppNow().getHours(), settings) ? 'night' : 'nap';
}

/** Format an hour (0-23) to a display string like "7:00 PM" */
export function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:00 ${period}`;
}
