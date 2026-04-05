/**
 * Offline queue for sleep session creates/updates.
 * When the user has no network, we store pending ops in AsyncStorage and flush when back online.
 * Callers can use getLocalNapRecommendation() for wake window recommendations when offline.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { requestLiveActivityRefreshForCaregivers } from '@/services/liveActivity';

const OFFLINE_QUEUE_KEY = '@sova/offline_sleep_queue';

export type OfflineOp =
  | { type: 'insert'; babyId: string; sessionType: 'nap' | 'night'; startTime: string; loggedBy: string }
  | { type: 'update'; sessionId: string; endTime: string; durationMinutes: number };

let queueCache: OfflineOp[] | null = null;

async function loadQueue(): Promise<OfflineOp[]> {
  if (queueCache) return queueCache;
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    queueCache = raw ? JSON.parse(raw) : [];
    return queueCache!;
  } catch {
    queueCache = [];
    return [];
  }
}

async function saveQueue(ops: OfflineOp[]): Promise<void> {
  queueCache = ops;
  try {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(ops));
  } catch {
    // ignore
  }
}

/** Add an insert to the queue (e.g. start nap/night). Call when network insert fails. */
export async function queueInsert(
  babyId: string,
  sessionType: 'nap' | 'night',
  startTime: string,
  loggedBy: string
): Promise<void> {
  const queue = await loadQueue();
  queue.push({ type: 'insert', babyId, sessionType, startTime, loggedBy });
  await saveQueue(queue);
}

/** Add an update to the queue (e.g. end session). Call when network update fails. */
export async function queueUpdate(
  sessionId: string,
  endTime: string,
  durationMinutes: number
): Promise<void> {
  const queue = await loadQueue();
  queue.push({ type: 'update', sessionId, endTime, durationMinutes });
  await saveQueue(queue);
}

/** Flush all pending ops to Supabase. Call when app detects network. Returns number of flushed ops. */
export async function flushOfflineQueue(): Promise<number> {
  const queue = await loadQueue();
  if (queue.length === 0) return 0;

  const { data: { user } } = await supabase.auth.getUser();
  const excludeId = user?.id ?? null;

  const remaining: OfflineOp[] = [];
  for (const op of queue) {
    try {
      if (op.type === 'insert') {
        const { error } = await supabase.from('sleep_sessions').insert({
          baby_id: op.babyId,
          type: op.sessionType,
          start_time: op.startTime,
          logged_by: op.loggedBy,
        });
        if (error) {
          remaining.push(op);
        } else {
          void requestLiveActivityRefreshForCaregivers(op.babyId, excludeId);
        }
      } else {
        const { data: row } = await supabase
          .from('sleep_sessions')
          .select('baby_id')
          .eq('id', op.sessionId)
          .maybeSingle();
        const { error } = await supabase
          .from('sleep_sessions')
          .update({
            end_time: op.endTime,
            duration_minutes: op.durationMinutes,
          })
          .eq('id', op.sessionId);
        if (error) {
          remaining.push(op);
        } else if (row?.baby_id) {
          void requestLiveActivityRefreshForCaregivers(row.baby_id as string, excludeId);
        }
      }
    } catch {
      remaining.push(op);
    }
  }

  await saveQueue(remaining);
  return queue.length - remaining.length;
}

/** Return pending count for UI (e.g. "3 pending when back online"). */
export async function getOfflineQueueCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}

/** Clear the queue (e.g. after user logs out). */
export async function clearOfflineQueue(): Promise<void> {
  queueCache = [];
  await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
}
