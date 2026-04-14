import { getAppNowMs } from '@/lib/appClock';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAiInsight } from '@/hooks/useAiInsight';

export interface NextSleepRecommendation {
  recommended_time: string;
  sleep_type: 'short_nap' | 'long_nap' | 'bedtime' | 'nap';
  expected_duration_minutes: number;
  minutes_from_now: number;
  urgency: 'now' | 'soon' | 'upcoming' | 'not_yet';
  headline: string;
  summary: string;
  reasoning: string;
  should_cap_nap: boolean;
  cap_at_minutes: number | null;
  cap_reason: string | null;
}

interface UseProactiveRecommendationsProps {
  babyId: string | null;
  lastWakeTime: Date | null;
  activeSleepSession: boolean;
}

export function useProactiveRecommendations({
  babyId,
  lastWakeTime,
  activeSleepSession,
}: UseProactiveRecommendationsProps) {
  const [minutesFromNow, setMinutesFromNow] = useState<number | null>(null);
  const fetchedRef = useRef(false);
  const lastBabyIdRef = useRef<string | null>(null);

  const { data, loading, error, fetch: fetchNextSleep, clearCache } =
    useAiInsight<{ next_sleep: NextSleepRecommendation | null }>('next_sleep', babyId, {
      cacheTtlMs: 10 * 60 * 1000, // 10 min cache
    });

  const recommendation = data?.next_sleep ?? null;

  // Fetch when we have a baby, a last wake time, and no active session
  useEffect(() => {
    if (!babyId || !lastWakeTime || activeSleepSession) {
      fetchedRef.current = false;
      lastBabyIdRef.current = null;
      return;
    }

    // Only fetch once per baby / wake-time combo, or if baby changed
    if (fetchedRef.current && lastBabyIdRef.current === babyId) return;
    fetchedRef.current = true;
    lastBabyIdRef.current = babyId;

    fetchNextSleep({
      last_wake_time: lastWakeTime.toISOString(),
    });
  }, [babyId, lastWakeTime, activeSleepSession]);

  // Update local countdown every minute
  useEffect(() => {
    if (!recommendation) {
      setMinutesFromNow(null);
      return;
    }

    // Use the AI's minutes_from_now as a starting point, then tick down
    const initialMinutes = recommendation.minutes_from_now;
    const fetchedAt = getAppNowMs();

    const tick = () => {
      const elapsed = Math.floor((getAppNowMs() - fetchedAt) / 60000);
      setMinutesFromNow(Math.max(initialMinutes - elapsed, -30));
    };

    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [recommendation]);

  const refetch = useCallback(() => {
    if (!babyId || !lastWakeTime) return;
    clearCache().then(() =>
      fetchNextSleep({ last_wake_time: lastWakeTime.toISOString() })
    );
  }, [babyId, lastWakeTime, clearCache, fetchNextSleep]);

  return {
    recommendation,
    minutesFromNow,
    loading,
    error,
    refetch,
  };
}
