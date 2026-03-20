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
import { Colors } from '@/constants/theme';
import type { NapLiveActivityState } from '@/types/liveActivity';
import { formatDurationWithSeconds } from '@/utils/formatTime';
import { supabase } from '@/lib/supabase';

const NAP_ACTIVITY_ID_KEY = '@sova/nap_live_activity_id';

let cachedActivityId: string | null = null;
let activityOperationQueue: Promise<unknown> = Promise.resolve();
let activityUpdatesListenerInstalled = false;

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

function enqueueActivityOperation<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = activityOperationQueue.catch(() => undefined).then(operation);
  activityOperationQueue = nextOperation.then(() => undefined, () => undefined);
  return nextOperation;
}

function getDeepLinkUrl(state: NapLiveActivityState): string {
  if (state.mode === 'awake') return 'sova://(tabs)/?action=startNap';
  return 'sova://(tabs)/?action=viewSession';
}

/** App icon for Dynamic Island only; lock screen shows name as text (no logo). */
const APP_ICON_IMAGE_NAME = 'sova_icon';

/** Delimiter for lock screen layout: babyName|||Sova|||detailLine (parsed in LiveActivityView.swift). */
const SUBTITLE_DELIMITER = '|||';

/** Parse ISO string as UTC so elapsed time is correct (no local-time shift). Supabase returns Z; some sources omit it. */
function parseUtcIso(iso: string): Date {
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso)) return new Date(iso);
  return new Date(iso + 'Z');
}

async function awaitActivityResult(result: unknown): Promise<void> {
  if (result && typeof (result as Promise<unknown>).then === 'function') {
    await (result as Promise<unknown>);
  }
}

function isActivityGoneError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('not found') || message.includes('ActivityNotFoundException');
}

function ensureActivityUpdatesListener(): void {
  if (activityUpdatesListenerInstalled) return;
  try {
    const sub = LiveActivity.addActivityUpdatesListener((event) => {
      if (event.activityState !== 'dismissed' && event.activityState !== 'ended') return;
      getStoredActivityId().then((storedId) => {
        if (storedId && storedId === event.activityID) {
          setStoredActivityId(null);
        }
      });
    });
    activityUpdatesListenerInstalled = !!sub;
  } catch {
    // Listener support is best-effort; the serialized queue is the primary safety mechanism.
  }
}

/**
 * Build state for the native Live Activity (ActivityKit).
 * Lock screen layout: baby name top left, "Sova" top right; then main status (bold) and detail (smaller).
 * Subtitle format: "babyName|||Sova|||detailLine" for Sova layout.
 */
export function buildLiveActivityState(
  state: NapLiveActivityState,
  now: Date = new Date()
): LiveActivityState {
  const baseContent = {
    dynamicIslandImageName: APP_ICON_IMAGE_NAME,
  };

  const babyName = state.babyName ?? 'Baby';
  const productName = 'Sova';

  if (state.mode === 'awake') {
    const windowStart = new Date(state.windowStartIso);
    const windowEnd = new Date(state.windowEndIso);
    const nextTimeStr = format(windowStart, 'h:mm a');
    const title = state.isBedtime ? `Bedtime ${nextTimeStr}` : `Next nap ${nextTimeStr}`;
    const detailLine =
      !state.isBedtime && state.capAtIso
        ? `Cap by ${format(parseUtcIso(state.capAtIso), 'h:mm a')}`
        : `${format(windowStart, 'h:mm a')} – ${format(windowEnd, 'h:mm a')}`;
    const subtitle = [babyName, productName, detailLine].join(SUBTITLE_DELIMITER);
    return {
      ...baseContent,
      title,
      subtitle,
      timeLabel: nextTimeStr,
      progressBar: { date: windowStart.getTime() },
    } as LiveActivityState;
  }

  const sessionStart = parseUtcIso(state.sessionStartIso);
  const elapsedSeconds = Math.floor((now.getTime() - sessionStart.getTime()) / 1000);
  const elapsedStr = formatDurationWithSeconds(Math.max(0, elapsedSeconds));
  const title = elapsedStr;
  let detailLine: string;
  if (state.capAtIso) {
    detailLine = `Cap by ${format(parseUtcIso(state.capAtIso), 'h:mm a')}`;
  } else {
    detailLine = state.sessionType === 'night' ? 'Night sleep' : 'Nap';
  }
  const sessionStartMs = sessionStart.getTime();
  const subtitle = [babyName, productName, detailLine, String(sessionStartMs)].join(SUBTITLE_DELIMITER);
  return {
    ...baseContent,
    title,
    subtitle,
  } as LiveActivityState;
}

const DEFAULT_CONFIG: LiveActivityConfig = {
  backgroundColor: Colors.dark.background,
  titleColor: Colors.dark.text,
  subtitleColor: Colors.dark.textSecondary,
  progressViewTint: Colors.dark.accent,
  progressViewLabelColor: Colors.dark.text,
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
): Promise<string | null> {
  ensureActivityUpdatesListener();
  return enqueueActivityOperation(async () => {
    const activityState = buildLiveActivityState(state);
    const existingId = await getStoredActivityId();

    if (existingId) {
      try {
        await awaitActivityResult(LiveActivity.updateActivity(existingId, activityState));
        return existingId;
      } catch (err) {
        if (!isActivityGoneError(err)) throw err;
        await setStoredActivityId(null);
      }
    }

    const id = LiveActivity.startActivity(activityState, {
      ...DEFAULT_CONFIG,
      deepLinkUrl: getDeepLinkUrl(state),
      ...config,
    });
    await setStoredActivityId(id ?? null);
    return id ?? null;
  });
}

function clearStoredIdIfActivityGone(err: unknown): void {
  if (isActivityGoneError(err)) {
    setStoredActivityId(null);
  }
}

/**
 * Update the current Nap Live Activity. No-op if none is running.
 * If the activity was dismissed (e.g. user removed it, app was killed), clears stored ID so we don't keep trying.
 */
export function updateNapLiveActivity(state: NapLiveActivityState): void {
  ensureActivityUpdatesListener();
  void enqueueActivityOperation(async () => {
    const id = await getStoredActivityId();
    if (!id) return;
    const activityState = buildLiveActivityState(state);
    try {
      await awaitActivityResult(LiveActivity.updateActivity(id, activityState));
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
  ensureActivityUpdatesListener();
  void enqueueActivityOperation(async () => {
    const id = await getStoredActivityId();
    if (!id) return;
    const activityState = buildLiveActivityState({
      mode: 'awake',
      windowStartIso: new Date().toISOString(),
      windowEndIso: new Date().toISOString(),
      isBedtime: false,
    });
    try {
      await awaitActivityResult(LiveActivity.stopActivity(id, activityState));
    } catch {
      // Ignore stop failures; we still clear the stored ID below.
    } finally {
      await setStoredActivityId(null);
    }
  });
}

/**
 * Return the current activity ID if one is running (from cache or storage).
 */
export async function getNapLiveActivityId(): Promise<string | null> {
  ensureActivityUpdatesListener();
  return getStoredActivityId();
}

/**
 * Sync stored activity ID with actual running activities (e.g. after app launch).
 * If we have an ID but the activity was dismissed by the user, clear it.
 */
export function setNapLiveActivityIdForTesting(id: string | null): void {
  setStoredActivityId(id);
}

/**
 * Fetch current nap/sleep state for a baby from the server and update the Live Activity.
 * Call this when a push indicates another user started/ended a session (e.g. type: 'live_activity_refresh', babyId).
 * Works when the app is in background so User A's Live Activity can update when User B starts the nap.
 */
export async function refreshNapLiveActivityFromServer(babyId: string): Promise<void> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 1);

    const { data: sessions, error: sessionsError } = await supabase
      .from('sleep_sessions')
      .select('id, start_time, end_time, type')
      .eq('baby_id', babyId)
      .gte('start_time', since.toISOString())
      .order('start_time', { ascending: false })
      .limit(50);

    if (sessionsError) {
      if (__DEV__) console.warn('[liveActivity] refresh sessions error:', sessionsError.message);
      return;
    }

    const activeSession = (sessions ?? []).find((s) => s.end_time === null) ?? null;

    const { data: baby } = await supabase.from('babies').select('name').eq('id', babyId).single();
    const babyName = (baby as { name?: string } | null)?.name ?? undefined;

    if (activeSession) {
      const state: NapLiveActivityState = {
        mode: 'sleeping',
        sessionStartIso: activeSession.start_time,
        sessionType: activeSession.type as 'nap' | 'night',
        capAtIso: null,
        babyName,
      };
      await startNapLiveActivity(state);
    } else {
      endNapLiveActivity();
    }
  } catch (err) {
    if (__DEV__) console.warn('[liveActivity] refreshNapLiveActivityFromServer error:', err);
  }
}
