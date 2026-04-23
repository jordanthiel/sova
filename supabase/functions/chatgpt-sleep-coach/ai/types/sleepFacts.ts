import type { AgenticRequestType } from './aiRequest.ts';

export type DayShape = 'on_track' | 'compressed' | 'messy' | 'recovery';
export type SchedulePressure = 'low' | 'medium' | 'high';
export type NapDisposition = 'restorative' | 'balanced' | 'disruptive' | 'unknown';

/**
 * Deterministic, computed view of “where the day is” — LLM must not invent these;
 * they are passed explicitly in the context packet.
 */
export interface SleepFacts {
  computedAt: string;
  timezone: string;
  ageDays: number;
  ageWeeks: number;
  ageMonths: number;
  morningWakeIso: string | null;
  wakeTimeToday: string | null;
  lastWakeIso: string | null;
  currentWakeWindowMinutes: number | null;
  napCountToday: number;
  completedNapCountToday: number;
  daytimeSleepMinutes: number;
  lastNapEndedAt: string | null;
  ongoingNight: boolean;
  ongoingNapStartIso: string | null;
  currentNapInProgress: boolean;
  currentNapDurationMinutes: number | null;
  /** 1-based index of the in-progress or last nap relative to first nap today */
  currentNapOrdinalToday: number | null;
  totalDaytimeSleepBeforeCurrentNapMinutes: number | null;
  projectedDaytimeSleepIfNapContinuesMinutes: number | null;
  /** Rough minutes from now to preferred bedtime if we assume typical last wake window */
  timeUntilBedtimeBasedOnTypicalWindowsMinutes: number | null;
  overtiredRisk: number;
  undertiredRisk: number;
  bedtimeWindow: { startIso: string; endIso: string };
  schedulePressure: SchedulePressure;
  scheduleConsistencyScore: number | null;
  /** 0–1 approximate recent rate of “false start” style nights */
  recentFalseStartRate: number | null;
  /** 0–1 approximate rate of early morning wakes (heuristic) */
  recentEarlyWakeRate: number | null;
  napTransitionSignalStrength: number | null;
  sleepDebtEstimate: number | null;
  currentDayShape: DayShape;
  napRecoveryPressure: number;
  bedtimeProtectionPressure: number;
  currentNapLikelyRestorativeVsDisruptive: NapDisposition;
  laterCatnapStillPossible: boolean;
  lastNightTotalSleepMinutes: number | null;
  /** When the orchestrator already knows the intended routing */
  suggestedRequestType?: AgenticRequestType;
}
