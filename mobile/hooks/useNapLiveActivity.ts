/**
 * Hook to keep the Nap Live Activity in sync with Today screen state.
 * Starts when there is a recommendation or active session; updates on change and every minute; ends when neither.
 */

import { addMinutes } from 'date-fns';
import { useCallback, useEffect, useRef } from 'react';
import type { Database } from '@/lib/supabase';
import type { NapRecommendationPayload } from '@/types/domain';
import type { NapLiveActivityState } from '@/types/liveActivity';
import {
  endNapLiveActivity,
  getNapLiveActivityId,
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
    const capAtIso =
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
      capAtIso: capAtIso ?? undefined,
    };
  }

  return null;
}

const UPDATE_INTERVAL_MS = 60 * 1000;
const SLEEPING_UPDATE_INTERVAL_MS = 1000;

export function useNapLiveActivity(params: UseNapLiveActivityParams): void {
  const { activeSession, napPayload, capAtIso, babyName, isBedtime } = params;
  const state = buildState(params);
  const hasActivityRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const startOrUpdate = useCallback(() => {
    if (!state) return;
    getNapLiveActivityId().then((id) => {
      if (id) {
        updateNapLiveActivity(state);
      } else {
        const newId = startNapLiveActivity(state);
        if (newId) hasActivityRef.current = true;
      }
    });
  }, [state]);

  const end = useCallback(() => {
    endNapLiveActivity();
    hasActivityRef.current = false;
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

    const isSleeping = state.mode === 'sleeping';
    const intervalMs = isSleeping ? SLEEPING_UPDATE_INTERVAL_MS : UPDATE_INTERVAL_MS;

    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        const currentState = buildState(paramsRef.current);
        if (currentState) updateNapLiveActivity(currentState);
      }, intervalMs);
    }

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
