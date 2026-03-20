/**
 * Hook to keep the Nap Live Activity in sync with Today screen state.
 * Starts only while a sleep session is active, updates on change and every second, and ends when the session ends.
 */

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
  const { activeSession, capAtIso, babyName } = params;

  if (activeSession) {
    return {
      mode: 'sleeping',
      sessionStartIso: activeSession.start_time,
      sessionType: activeSession.type as 'nap' | 'night',
      capAtIso,
      babyName: babyName ?? undefined,
    };
  }

  return null;
}

const UPDATE_INTERVAL_MS = 60 * 1000;
const SLEEPING_UPDATE_INTERVAL_MS = 1000;

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
