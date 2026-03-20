import { supabase } from '@/lib/supabase';
import type { NotificationConfig } from '@/types/domain';
import { DEFAULT_NOTIFICATION_CONFIG } from '@/types/domain';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Stored in `profiles.settings` alongside keys like `night_start_hour`. */
export const NOTIFICATION_CONFIG_BY_BABY_KEY = 'notification_config_by_baby';

const STORAGE_KEY_PREFIX = 'notification_config_';

export function notificationConfigStorageKey(babyId: string): string {
  return `${STORAGE_KEY_PREFIX}${babyId}`;
}

/**
 * Coerces unknown JSON (e.g. from DB or older clients) to a full NotificationConfig with defaults for missing keys.
 */
export function normalizeNotificationConfig(raw: unknown): NotificationConfig {
  const d = DEFAULT_NOTIFICATION_CONFIG;
  if (!raw || typeof raw !== 'object') {
    return { ...d };
  }
  const o = raw as Record<string, unknown>;
  return {
    napWindowSoon: typeof o.napWindowSoon === 'boolean' ? o.napWindowSoon : d.napWindowSoon,
    capNapReminder: typeof o.capNapReminder === 'boolean' ? o.capNapReminder : d.capNapReminder,
    bedtimeReminder: typeof o.bedtimeReminder === 'boolean' ? o.bedtimeReminder : d.bedtimeReminder,
    wakeWindowAlert: typeof o.wakeWindowAlert === 'boolean' ? o.wakeWindowAlert : d.wakeWindowAlert,
  };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

async function readLocalNotificationConfig(babyId: string): Promise<NotificationConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(notificationConfigStorageKey(babyId));
    if (!raw) return null;
    return normalizeNotificationConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function persistToSupabase(babyId: string, config: NotificationConfig): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('settings')
    .eq('id', user.id)
    .single();

  const existingSettings = (profile?.settings as Record<string, unknown>) || {};
  const prevByBaby = isRecord(existingSettings[NOTIFICATION_CONFIG_BY_BABY_KEY])
    ? (existingSettings[NOTIFICATION_CONFIG_BY_BABY_KEY] as Record<string, unknown>)
    : {};

  await supabase
    .from('profiles')
    .update({
      settings: {
        ...existingSettings,
        [NOTIFICATION_CONFIG_BY_BABY_KEY]: {
          ...prevByBaby,
          [babyId]: config,
        },
      },
    })
    .eq('id', user.id);
}

export type LoadNotificationConfigOptions = {
  /** When true, do not backfill Supabase from local (avoids racing with `saveNotificationConfigForBaby`). */
  skipBackfill?: boolean;
};

/**
 * Prefer Supabase (`profiles.settings.notification_config_by_baby`); fall back to AsyncStorage, then defaults.
 * If only local data exists for this baby, backfills Supabase when signed in (unless `skipBackfill`).
 */
export async function loadNotificationConfigForBaby(
  babyId: string,
  options?: LoadNotificationConfigOptions
): Promise<NotificationConfig> {
  const skipBackfill = options?.skipBackfill === true;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('settings')
        .eq('id', user.id)
        .single();

      if (!error && data?.settings) {
        const settings = data.settings as Record<string, unknown>;
        const byBaby = settings[NOTIFICATION_CONFIG_BY_BABY_KEY];
        if (isRecord(byBaby) && babyId in byBaby) {
          const merged = normalizeNotificationConfig(byBaby[babyId]);
          await AsyncStorage.setItem(
            notificationConfigStorageKey(babyId),
            JSON.stringify(merged)
          );
          return merged;
        }
      }
    }
  } catch {
    // fall through to local / defaults
  }

  const local = await readLocalNotificationConfig(babyId);
  if (local) {
    if (!skipBackfill) {
      void persistToSupabase(babyId, local).catch((err) => {
        console.warn('[notificationSettings] backfill to Supabase failed:', err);
      });
    }
    return local;
  }

  return { ...DEFAULT_NOTIFICATION_CONFIG };
}

/**
 * Merges patch into current config, writes AsyncStorage cache, and updates `profiles.settings` without clobbering other keys.
 */
export async function saveNotificationConfigForBaby(
  babyId: string,
  patch: Partial<NotificationConfig>
): Promise<NotificationConfig> {
  const previous = await loadNotificationConfigForBaby(babyId, { skipBackfill: true });
  const merged = normalizeNotificationConfig({ ...previous, ...patch });

  await AsyncStorage.setItem(notificationConfigStorageKey(babyId), JSON.stringify(merged));

  try {
    await persistToSupabase(babyId, merged);
  } catch (err) {
    console.warn('[notificationSettings] save to Supabase failed:', err);
  }

  return merged;
}
