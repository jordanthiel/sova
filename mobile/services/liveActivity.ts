/**
 * Nap Live Activity: maps domain state to the native iOS Live Activity (ActivityKit).
 *
 * Native widget lives in ios/LiveActivity/ (LiveActivityWidget.swift, LiveActivityView.swift).
 * expo-live-activity bridges JS → native; our state (title, subtitle, timeLabel, imageName,
 * dynamicIslandImageName, progressBar) maps to LiveActivityAttributes.ContentState.
 *
 * - Awake mode: next start time as text (timeLabel, e.g. "2:30 PM"), app icon on the left.
 * - Sleeping mode: elapsed duration, optional cap time; app icon on the left.
 * iOS only; requires dev build (Expo Go does not support Live Activities).
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

function getDeepLinkUrl(state: NapLiveActivityState): string {
  if (state.mode === 'awake') return '/(tabs)/?action=startNap';
  return '/(tabs)/?action=endSession';
}

/** App icon asset name in the Live Activity widget bundle (see assets/liveActivity/.gitkeep). */
const APP_ICON_IMAGE_NAME = 'sova_icon';

/**
 * Build state for the native Live Activity (ActivityKit).
 * Passes timeLabel for next start time (not countdown), app icon for left side, and standard title/subtitle/progressBar.
 */
export function buildLiveActivityState(
  state: NapLiveActivityState,
  now: Date = new Date()
): LiveActivityState {
  const baseContent = {
    imageName: APP_ICON_IMAGE_NAME,
    dynamicIslandImageName: APP_ICON_IMAGE_NAME,
  };

  if (state.mode === 'awake') {
    const windowStart = new Date(state.windowStartIso);
    const windowEnd = new Date(state.windowEndIso);
    const nextTimeStr = format(windowStart, 'h:mm a');
    const title = state.isBedtime ? `Bedtime ${nextTimeStr}` : `Next nap ${nextTimeStr}`;
    const windowStr = `${format(windowStart, 'h:mm a')} – ${format(windowEnd, 'h:mm a')}`;
    const subtitle = state.babyName ? `${state.babyName} · ${windowStr}` : windowStr;
    return {
      ...baseContent,
      title,
      subtitle,
      timeLabel: nextTimeStr,
      progressBar: { date: windowStart.getTime() },
    } as LiveActivityState;
  }

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
    ...baseContent,
    title,
    subtitle,
    progressBar: { progress: 0 },
  } as LiveActivityState;
}

const DEFAULT_CONFIG: LiveActivityConfig = {
  backgroundColor: '#0D1B2A',
  titleColor: '#E6F4FE',
  subtitleColor: '#B0C4DE',
  progressViewTint: '#4ECDC4',
  progressViewLabelColor: '#FFFFFF',
  timerType: 'digital',
  imagePosition: 'left',
};

/**
 * Start a Live Activity with the given nap state. Returns activity ID or undefined.
 * deepLinkUrl is set so the Lock Screen action button opens Start or End session.
 */
export function startNapLiveActivity(
  state: NapLiveActivityState,
  config: Partial<LiveActivityConfig> = {}
): string | undefined {
  const activityState = buildLiveActivityState(state);
  const id = LiveActivity.startActivity(activityState, {
    ...DEFAULT_CONFIG,
    deepLinkUrl: getDeepLinkUrl(state),
    ...config,
  });
  if (id) setStoredActivityId(id);
  return id;
}

function clearStoredIdIfActivityGone(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('not found') || message.includes('ActivityNotFoundException')) {
    setStoredActivityId(null);
  }
}

/**
 * Update the current Nap Live Activity. No-op if none is running.
 * If the activity was dismissed (e.g. user removed it, app was killed), clears stored ID so we don't keep trying.
 */
export function updateNapLiveActivity(state: NapLiveActivityState): void {
  getStoredActivityId().then((id) => {
    if (!id) return;
    const activityState = buildLiveActivityState(state);
    try {
      const result = LiveActivity.updateActivity(id, activityState);
      if (result?.catch) {
        result.catch((err: unknown) => clearStoredIdIfActivityGone(err));
      }
    } catch (err) {
      clearStoredIdIfActivityGone(err);
    }
  });
}

/**
 * End the current Nap Live Activity and clear stored ID.
 * Clears stored ID on failure too (e.g. activity already ended).
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
    try {
      const result = LiveActivity.stopActivity(id, activityState);
      setStoredActivityId(null);
      if (result?.catch) {
        result.catch(() => setStoredActivityId(null));
      }
    } catch {
      setStoredActivityId(null);
    }
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
