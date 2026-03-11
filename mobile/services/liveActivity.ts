/**
 * Nap Live Activity: maps domain state to expo-live-activity and manages lifecycle.
 * iOS only (expo-live-activity returns undefined / no-ops on other platforms).
 * Requires: npx expo prebuild --clean (to generate the widget extension) and a dev build (Expo Go does not support Live Activities).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LiveActivity from 'expo-live-activity';
import { format } from 'date-fns';
import type { LiveActivityConfig, LiveActivityState } from 'expo-live-activity';
import type { NapLiveActivityState } from '@/types/liveActivity';
import { formatDuration } from '@/utils/formatTime';

const NAP_ACTIVITY_ID_KEY = '@sova/nap_live_activity_id';

let cachedActivityId: string | null = null;

async function getStoredActivityId(): Promise<string | null> {
  if (cachedActivityId) return cachedActivityId;
  try {
    const id = await AsyncStorage.getItem(NAP_ACTIVITY_ID_KEY);
    cachedActivityId = id;
    return id;
  } catch {
    return null;
  }
}

async function setStoredActivityId(id: string | null): Promise<void> {
  cachedActivityId = id;
  try {
    if (id) await AsyncStorage.setItem(NAP_ACTIVITY_ID_KEY, id);
    else await AsyncStorage.removeItem(NAP_ACTIVITY_ID_KEY);
  } catch {
    // ignore
  }
}

const DEFAULT_CONFIG: LiveActivityConfig = {
  deepLinkUrl: '/(tabs)/', // opens Today tab
  backgroundColor: '#0D1B2A',
  titleColor: '#E6F4FE',
  subtitleColor: '#B0C4DE',
  progressViewTint: '#4ECDC4',
  progressViewLabelColor: '#FFFFFF',
  timerType: 'digital',
};

/**
 * Build expo-live-activity state from our nap domain state.
 */
export function buildLiveActivityState(
  state: NapLiveActivityState,
  now: Date = new Date()
): LiveActivityState {
  if (state.mode === 'awake') {
    const windowStart = new Date(state.windowStartIso);
    const windowEnd = new Date(state.windowEndIso);
    const title = state.isBedtime ? 'Bedtime' : 'Next nap';
    const windowStr = `${format(windowStart, 'h:mm a')} – ${format(windowEnd, 'h:mm a')}`;
    const subtitle = state.babyName ? `${state.babyName} · ${windowStr}` : windowStr;
    return {
      title,
      subtitle,
      progressBar: { date: windowStart.getTime() },
    };
  }

  // sleeping
  const sessionStart = new Date(state.sessionStartIso);
  const elapsedMinutes = Math.round((now.getTime() - sessionStart.getTime()) / 60000);
  const elapsedStr = formatDuration(elapsedMinutes);
  const title = state.sessionType === 'night' ? 'Night sleep' : 'Nap';
  let subtitle: string;
  if (state.capAtIso) {
    const capAt = format(new Date(state.capAtIso), 'h:mm a');
    subtitle = state.babyName
      ? `${state.babyName} · Cap by ${capAt}`
      : `Cap by ${capAt} · ${elapsedStr}`;
  } else {
    subtitle = state.babyName ? `${state.babyName} · ${elapsedStr}` : elapsedStr;
  }
  return {
    title,
    subtitle,
    progressBar: { progress: 0 },
  };
}

/**
 * Start a Live Activity with the given nap state. Returns activity ID or undefined.
 */
export function startNapLiveActivity(
  state: NapLiveActivityState,
  config: Partial<LiveActivityConfig> = {}
): string | undefined {
  const activityState = buildLiveActivityState(state);
  const id = LiveActivity.startActivity(activityState, { ...DEFAULT_CONFIG, ...config });
  if (id) setStoredActivityId(id);
  return id;
}

/**
 * Update the current Nap Live Activity. No-op if none is running.
 */
export function updateNapLiveActivity(state: NapLiveActivityState): void {
  getStoredActivityId().then((id) => {
    if (!id) return;
    const activityState = buildLiveActivityState(state);
    LiveActivity.updateActivity(id, activityState);
  });
}

/**
 * End the current Nap Live Activity and clear stored ID.
 */
export function endNapLiveActivity(): void {
  getStoredActivityId().then((id) => {
    if (!id) return;
    const activityState = buildLiveActivityState({
      mode: 'awake',
      windowStartIso: new Date().toISOString(),
      windowEndIso: new Date().toISOString(),
      isBedtime: false,
    });
    LiveActivity.stopActivity(id, activityState);
    setStoredActivityId(null);
  });
}

/**
 * Return the current activity ID if one is running (from cache or storage).
 */
export async function getNapLiveActivityId(): Promise<string | null> {
  return getStoredActivityId();
}

/**
 * Sync stored activity ID with actual running activities (e.g. after app launch).
 * If we have an ID but the activity was dismissed by the user, clear it.
 */
export function setNapLiveActivityIdForTesting(id: string | null): void {
  setStoredActivityId(id);
}
