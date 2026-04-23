import type { AgenticRequestType } from './aiRequest.ts';

export type CandidateActionType =
  | 'NAP_START'
  | 'WAKE_FROM_NAP'
  | 'BEDTIME'
  | 'CATNAP'
  | 'STRETCH_WAKE_WINDOW'
  | 'FULL_DAY_SHAPE';

export interface ScheduleCandidate {
  id: string;
  requestType: AgenticRequestType;
  actionType: CandidateActionType;
  label: string;
  /** ISO timestamps in UTC (instant semantics) */
  primaryTimeIso?: string;
  secondaryTimeIso?: string;
  wakeAtIso?: string;
  /** For nap starts */
  suggestedCapMinutes?: number | null;
  stretchWakeWindowMinutes?: number | null;
  pros: string[];
  risks: string[];
  expectedDownstream: string;
  /** Deterministic rank score 0–1 (higher = better) — tuning comments in scorer */
  score: number;
  confidence: number;
}

export interface RankedCandidate extends ScheduleCandidate {
  rank: number;
  strengths: string[];
  weaknesses: string[];
}

export interface NapCapWindows {
  idealWakeRange: { startAtIso: string; endAtIso: string };
  preferredWakeAtIso: string;
  stillOkayUntilIso: string;
  softCapAtIso: string;
  hardCapAtIso: string;
  reasonCodes: string[];
}
