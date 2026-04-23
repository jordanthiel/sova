import type { AgenticRequestType } from './aiRequest.ts';
import type { RankedCandidate } from './candidateOption.ts';
import type { SleepFacts } from './sleepFacts.ts';

export type RecommendedActionType =
  | 'NAP_WINDOW'
  | 'BEDTIME'
  | 'WAKE_FROM_NAP'
  | 'CATNAP_THEN_BEDTIME';

export interface TimelineAction {
  type: RecommendedActionType;
  startAt?: string;
  endAt?: string;
  wakeAt?: string;
  label: string;
}

/** Spec-shaped explainability payload from the deterministic sleep engine layer. */
export interface SleepEngineStructuredBlock {
  summary: Record<string, unknown>;
  analysis: Record<string, unknown>;
  recommendation: Record<string, unknown>;
  rest_of_day_plan: { plan_a: string[]; plan_b: string[] };
  validation: Record<string, unknown>;
  explanation: string[];
}

export interface AgenticScheduleResponse {
  requestType: AgenticRequestType;
  recommendedAction: TimelineAction;
  fallbackAction?: TimelineAction;
  reasoningSummary: string;
  confidence: number;
  dataQualityScore: number;
  watchFors: string[];
  parentFacingResponse: string;
  /** 30-day pattern analysis + rest-of-day plan A/B + validation (sleep recommendation engine spec). */
  sleepEngine?: SleepEngineStructuredBlock;
  idealWakeRange?: { startAt: string; endAt: string };
  preferredWakeAt?: string;
  stillOkayUntil?: string;
  softCapAt?: string;
  hardCapAt?: string;
  debug?: {
    facts: SleepFacts;
    topCandidates: RankedCandidate[];
    classifier?: Record<string, unknown>;
    critique?: Record<string, unknown> | null;
    stagesMs?: Record<string, number>;
  };
}

export interface LlmSelectionOutput {
  recommendedOptionId: string;
  reasoningSummary: string;
  confidence: number;
  fallbackOptionId?: string;
  watchFors: string[];
  parentFacingResponse: string;
}

export interface CritiqueOutput {
  approved: boolean;
  issues: string[];
  revisions: string[];
  /** Full replacement for reasoningSummary when fixing clientRestOfDay alignment, etc. */
  reasoningSummaryRevision?: string;
}
