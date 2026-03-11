import { useCallback, useEffect, useRef, useState } from 'react';
import { nightSleepScoresRepo } from '@/services/repositories/nightSleepScoresRepo';
import { computeNightSleepScore, getNightSummaries, isNightComplete } from '@/utils/nightSleepScore';
import type { Database } from '@/lib/supabase';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

/** Returns stored or computed night sleep scores for the given date keys. Ensures scores are written to DB when a night is complete. */
export function useNightSleepScores(
  babyId: string | null,
  dateKeys: string[],
  sessions: SleepSession[] | undefined,
  /** When this value changes (e.g. after manual refresh), recalc and upsert the most recent night's score. */
  refreshTrigger?: number
): Record<string, number> {
  const [stored, setStored] = useState<Record<string, number>>({});
  const backfillDoneRef = useRef<Set<string>>(new Set());

  const completedSessions = sessions?.filter(
    (s) => s.end_time != null && (s.type === 'night' || s.type === 'nap')
  ) ?? [];

  const fetchScores = useCallback(async () => {
    if (!babyId || dateKeys.length === 0) return;
    const map = await nightSleepScoresRepo.getByDateKeys(babyId, dateKeys);
    const byScore: Record<string, number> = {};
    Object.entries(map).forEach(([k, row]) => {
      byScore[k] = row.score;
    });
    setStored((prev) => ({ ...prev, ...byScore }));
  }, [babyId, dateKeys.join(',')]);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  // On manual refresh (e.g. home pull-to-refresh): ensure most recent night is computed and stored
  useEffect(() => {
    if (!refreshTrigger || !babyId || !completedSessions.length) return;
    const summaries = getNightSummaries(
      completedSessions as { type: 'nap' | 'night'; start_time: string; end_time: string | null; duration_minutes: number | null }[],
      { maxNights: 1 }
    );
    const lastNight = summaries[0];
    if (!lastNight || !isNightComplete(lastNight)) return;
    const score = computeNightSleepScore(lastNight);
    nightSleepScoresRepo
      .upsert(babyId, lastNight.dateKey, {
        score,
        total_sleep_minutes: lastNight.totalSleepMinutes,
        wakeup_count: lastNight.wakeupCount,
        total_awake_minutes: lastNight.totalAwakeMinutes,
      })
      .then(() => fetchScores())
      .catch(() => {});
  }, [refreshTrigger, babyId, completedSessions.length, fetchScores]);

  // Backfill: for any night we have session data for but no stored score, compute and upsert
  useEffect(() => {
    if (!babyId || !completedSessions.length) return;

    const summaries = getNightSummaries(
      completedSessions as { type: 'nap' | 'night'; start_time: string; end_time: string | null; duration_minutes: number | null }[],
      { maxNights: 365 }
    );

    const toUpsert = summaries.filter((s) => dateKeys.includes(s.dateKey) && isNightComplete(s));
    toUpsert.forEach((summary) => {
      // Fingerprint so we re-upsert when computed summary changes (e.g. segment count fix)
      const key = `${babyId}:${summary.dateKey}:${summary.segmentCount}:${summary.wakeupCount}`;
      if (backfillDoneRef.current.has(key)) return;
      const score = computeNightSleepScore(summary);
      backfillDoneRef.current.add(key);
      nightSleepScoresRepo
        .upsert(babyId, summary.dateKey, {
          score,
          total_sleep_minutes: summary.totalSleepMinutes,
          wakeup_count: summary.wakeupCount,
          total_awake_minutes: summary.totalAwakeMinutes,
        })
        .then(() => fetchScores())
        .catch(() => {
          backfillDoneRef.current.delete(key);
        });
    });
  }, [babyId, dateKeys.join(','), completedSessions.length, fetchScores]);

  // One-time full backfill per baby: ensure all historical nights have a score row
  const backfillBabyRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!babyId || !completedSessions.length || backfillBabyRef.current.has(babyId)) return;
    const summaries = getNightSummaries(
      completedSessions as { type: 'nap' | 'night'; start_time: string; end_time: string | null; duration_minutes: number | null }[],
      { maxNights: 365 }
    );
    backfillBabyRef.current.add(babyId);
    const completeSummaries = summaries.filter((s) => isNightComplete(s));
    Promise.all(
      completeSummaries.map((summary) =>
        nightSleepScoresRepo.upsert(babyId, summary.dateKey, {
          score: computeNightSleepScore(summary),
          total_sleep_minutes: summary.totalSleepMinutes,
          wakeup_count: summary.wakeupCount,
          total_awake_minutes: summary.totalAwakeMinutes,
        })
      )
    ).then(() => fetchScores()).catch(() => {});
  }, [babyId, completedSessions.length, fetchScores]);

  // Merge: for each dateKey, use stored if present; otherwise compute from sessions for this key.
  // Only compute scores for complete nights (past 6am on the night's end date).
  const summaries = getNightSummaries(
    completedSessions as { type: 'nap' | 'night'; start_time: string; end_time: string | null; duration_minutes: number | null }[],
    { maxNights: 365 }
  );
  const computedByKey: Record<string, number> = {};
  summaries.forEach((s) => {
    if (isNightComplete(s)) {
      computedByKey[s.dateKey] = computeNightSleepScore(s);
    }
  });

  const result: Record<string, number> = {};
  dateKeys.forEach((dk) => {
    const score = stored[dk] ?? computedByKey[dk];
    if (score != null) result[dk] = score;
  });
  return result;
}
