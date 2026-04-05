import type { AgenticRequestType } from '../types/aiRequest.ts';
import type { ChildProfile } from '../types/aiRequest.ts';
import type { RankedCandidate } from '../types/candidateOption.ts';
import type { SleepFacts } from '../types/sleepFacts.ts';
import type { DataQualityBreakdown } from './dataQualityService.ts';

/** Compact, grounded payload for LLM selection — no raw chain-of-thought. */
export interface ContextPacket {
  schemaVersion: 1;
  requestType: AgenticRequestType;
  child: { name: string; ageDays: number; ageMonths: number };
  userRequest?: string;
  factsTopline: Record<string, unknown>;
  rankedCandidates: Array<{
    id: string;
    rank: number;
    label: string;
    actionType: string;
    score: number;
    primaryTimeIso?: string;
    wakeAtIso?: string;
    suggestedCapMinutes?: number | null;
    strengths: string[];
    weaknesses: string[];
    expectedDownstream: string;
  }>;
  dataQuality: DataQualityBreakdown;
  guardrailsReminder: string;
}

export function buildContextPacket(
  requestType: AgenticRequestType,
  profile: ChildProfile,
  facts: SleepFacts,
  ranked: RankedCandidate[],
  dq: DataQualityBreakdown,
  userMessage?: string,
): ContextPacket {
  const factsTopline = {
    currentWakeWindowMinutes: facts.currentWakeWindowMinutes,
    napCountToday: facts.napCountToday,
    daytimeSleepMinutes: facts.daytimeSleepMinutes,
    currentNapInProgress: facts.currentNapInProgress,
    currentNapDurationMinutes: facts.currentNapDurationMinutes,
    overtiredRisk: facts.overtiredRisk,
    undertiredRisk: facts.undertiredRisk,
    schedulePressure: facts.schedulePressure,
    dayShape: facts.currentDayShape,
    bedtimeProtectionPressure: facts.bedtimeProtectionPressure,
    napRecoveryPressure: facts.napRecoveryPressure,
    laterCatnapStillPossible: facts.laterCatnapStillPossible,
    lastNightTotalSleepMinutes: facts.lastNightTotalSleepMinutes,
  };

  return {
    schemaVersion: 1,
    requestType,
    child: { name: profile.name, ageDays: profile.ageDays, ageMonths: facts.ageMonths },
    userRequest: userMessage,
    factsTopline,
    rankedCandidates: ranked.slice(0, 5).map((c) => ({
      id: c.id,
      rank: c.rank,
      label: c.label,
      actionType: c.actionType,
      score: c.score,
      primaryTimeIso: c.primaryTimeIso,
      wakeAtIso: c.wakeAtIso,
      suggestedCapMinutes: c.suggestedCapMinutes,
      strengths: c.strengths,
      weaknesses: c.weaknesses,
      expectedDownstream: c.expectedDownstream,
    })),
    dataQuality: dq,
    guardrailsReminder:
      'Do not invent logs. Do not give medical advice. Use gentle practical tone. If data is weak, lower certainty.',
  };
}
