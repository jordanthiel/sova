/**
 * Registers a headless task so silent remote pushes can refresh the nap Live Activity
 * while the app is backgrounded or terminated (iOS: content-available; see Expo docs).
 * Import this module once at app startup (e.g. root _layout) before other notification setup.
 */
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { refreshNapLiveActivityFromServer } from '@/services/liveActivity';

export const LIVE_ACTIVITY_BG_TASK = 'sova-live-activity-bg';

function babyIdFromPushTaskPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if ('actionIdentifier' in d) return null;

  const fromObject = (raw: unknown): string | null => {
    if (typeof raw !== 'object' || raw === null) return null;
    const o = raw as Record<string, unknown>;
    if (o.type === 'live_activity_refresh' && typeof o.babyId === 'string') return o.babyId;
    return null;
  };

  const nested = d.data as Record<string, unknown> | undefined;
  if (nested?.dataString && typeof nested.dataString === 'string') {
    try {
      const j = JSON.parse(nested.dataString) as Record<string, unknown>;
      const id = fromObject(j);
      if (id) return id;
    } catch {
      // ignore
    }
  }

  const n = d.notification as Record<string, unknown> | null | undefined;
  const req = n?.request as Record<string, unknown> | undefined;
  const content = req?.content as Record<string, unknown> | undefined;
  const cdata = content?.data as Record<string, unknown> | undefined;
  return fromObject(cdata ?? null);
}

TaskManager.defineTask(LIVE_ACTIVITY_BG_TASK, async ({ data, error }) => {
  if (error) return;
  const babyId = babyIdFromPushTaskPayload(data);
  if (!babyId) return;
  await refreshNapLiveActivityFromServer(babyId);
});

let registered = false;

export async function registerLiveActivityBackgroundPushTask(): Promise<void> {
  if (registered) return;
  try {
    await Notifications.registerTaskAsync(LIVE_ACTIVITY_BG_TASK);
    registered = true;
  } catch (e) {
    if (__DEV__) {
      console.warn('[LiveActivity] Background push task not registered:', e);
    }
  }
}
