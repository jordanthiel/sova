import type { SleepFacts } from '../types/sleepFacts.ts';
import type { SleepSession } from '../types/sessions.ts';
import { startOfDayInTimezone } from '../utils/sleepMath.ts';

export interface DataQualityBreakdown {
  score: number;
  /** 0–1 factors (higher = better) */
  enoughLogsToday: number;
  wakeTimeKnown: number;
  lastNapEndKnown: number;
  activeNapStartKnown: number;
  recentHistoryDepth: number;
  inferenceBurden: number;
  notes: string[];
}

/**
 * Composite 0–1 — feeds orchestrator confidence ceiling.
 * Tuning: weights in scoring comments for later product calibration.
 */
export function computeDataQuality(
  facts: SleepFacts,
  sleepData: SleepSession[],
  nowIso: string,
): DataQualityBreakdown {
  const notes: string[] = [];
  const dayStart = startOfDayInTimezone(nowIso, facts.timezone).getTime();
  const todaySessions = sleepData.filter((s) => new Date(s.start_time).getTime() >= dayStart);

  // enough logs today: at least one session starting today OR clear morning wake inference
  let enoughLogsToday = todaySessions.length > 0 || facts.morningWakeIso != null ? 0.95 : 0.45;
  if (todaySessions.length === 0 && facts.morningWakeIso) {
    enoughLogsToday = 0.72;
    notes.push('inferring_day_from_morning_wake_only');
  }
  if (todaySessions.length === 0 && !facts.morningWakeIso) {
    enoughLogsToday = 0.35;
    notes.push('sparse_today');
  }

  const wakeTimeKnown = facts.morningWakeIso || facts.lastWakeIso ? 0.9 : 0.4;

  const lastNapEndKnown = facts.completedNapCountToday > 0 && facts.lastNapEndedAt ? 0.92 : 0.55;
  if (facts.currentNapInProgress) {
    notes.push('ongoing_nap');
  }

  const activeNapStartKnown =
    facts.currentNapInProgress && facts.ongoingNapStartIso ? 0.95 : facts.currentNapInProgress ? 0.5 : 0.85;

  const recentCount = sleepData.length;
  let recentHistoryDepth = recentCount >= 14 ? 1 : recentCount >= 8 ? 0.85 : recentCount >= 4 ? 0.65 : 0.45;
  if (recentCount < 4) notes.push('thin_history');

  // inference burden: many unknowns lower score
  let inferenceBurden = 1;
  if (!facts.lastWakeIso && !facts.morningWakeIso) inferenceBurden -= 0.25;
  if (facts.currentNapInProgress && facts.currentNapDurationMinutes == null) inferenceBurden -= 0.2;
  if (facts.lastNightTotalSleepMinutes == null) inferenceBurden -= 0.1;
  inferenceBurden = Math.max(0.35, Math.min(1, inferenceBurden));

  // Weighted blend — explicit weights for tuning
  const score = clamp01(
    enoughLogsToday * 0.22 +
      wakeTimeKnown * 0.18 +
      lastNapEndKnown * 0.15 +
      activeNapStartKnown * 0.15 +
      recentHistoryDepth * 0.2 +
      inferenceBurden * 0.1,
  );

  return {
    score,
    enoughLogsToday,
    wakeTimeKnown,
    lastNapEndKnown,
    activeNapStartKnown,
    recentHistoryDepth,
    inferenceBurden,
    notes,
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
