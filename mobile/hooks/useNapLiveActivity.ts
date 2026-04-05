/**
 * Hook to keep the Nap Live Activity in sync with Today screen state.
 * Shows the upcoming nap/bedtime window when awake, and a live elapsed timer when sleeping.
 * The sleeping timer is system-rendered (Text timerInterval) so JS updates are only needed
 * for state changes (cap time, mode switch) — not every second.
 */

import { addMinutes } from 'date-fns';
import { useCallback, useEffect, useRef } from 'react';
import type { Database } from '@/lib/supabase';
import type { NapRecommendationPayload } from '@/types/domain';
import type { NapLiveActivityState } from '@/types/liveActivity';
import {
  endNapLiveActivity,
  startNapLiveActivity,
  updateNapLiveActivity,
} from '@/services/liveActivity';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

export interface UseNapLiveActivityParams {
  activeSession: SleepSession | null;
  napPayload: NapRecommendationPayload | null;
  capAtIso: string | null;
  babyName: string | null;
  isBedtime: boolean;
}

function buildState(params: UseNapLiveActivityParams): NapLiveActivityState | null {
  const { activeSession, napPayload, capAtIso, babyName, isBedtime } = params;

  if (activeSession) {
    return {
      mode: 'sleeping',
      sessionStartIso: activeSession.start_time,
      sessionType: activeSession.type as 'nap' | 'night',
      capAtIso,
      babyName: babyName ?? undefined,
    };
  }

  if (napPayload) {
    // Cap time shown on the live activity during the upcoming nap (when to wake the baby)
    const napCapAtIso =
      !isBedtime &&
      napPayload.shouldCapNap !== false &&
      napPayload.recommendedCapMinutes != null
        ? addMinutes(new Date(napPayload.startWindowBegin), napPayload.recommendedCapMinutes).toISOString()
        : null;
    return {
      mode: 'awake',
      windowStartIso: napPayload.startWindowBegin,
      windowEndIso: napPayload.startWindowEnd,
      isBedtime,
      babyName: babyName ?? undefined,
      capAtIso: napCapAtIso ?? undefined,
    };
  }

  return null;
}

// System-rendered Text(timerInterval:) updates the sleeping timer natively every second.
// JS only needs to push updates when meaningful state changes (cap time, mode switch, etc.)
const UPDATE_INTERVAL_MS = 60 * 1000;

export function useNapLiveActivity(params: UseNapLiveActivityParams): void {
  const state = buildState(params);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const startOrUpdate = useCallback(() => {
    if (!state) return;
    void startNapLiveActivity(state);
  }, [state]);

  const end = useCallback(() => {
    endNapLiveActivity();
  }, []);

  useEffect(() => {
    if (!state) {
      end();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    startOrUpdate();

    // Always reset interval so mode changes (awake↔sleeping) get the right rate
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      const currentState = buildState(paramsRef.current);
      if (currentState) updateNapLiveActivity(currentState);
    }, UPDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state, startOrUpdate, end]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
}
