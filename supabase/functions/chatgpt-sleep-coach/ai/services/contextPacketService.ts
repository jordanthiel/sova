import type { AgenticRequestType } from '../types/aiRequest.ts';
import type { ChildProfile } from '../types/aiRequest.ts';
import type { RankedCandidate } from '../types/candidateOption.ts';
import type { SleepFacts } from '../types/sleepFacts.ts';
import { buildNapWindowRestOfDaySchedule } from '../legacyNextSleepMap.ts';
import { formatLocalTime } from '../utils/sleepMath.ts';
import type { DataQualityBreakdown } from './dataQualityService.ts';
import type { SleepEngineGuidance } from './sleepRecommendationEngine.ts';
import type { SleepPatternAnalysis } from './sleepPatternAnalysisService.ts';

/** Compact, grounded payload for LLM selection — no raw chain-of-thought. */
export interface ContextPacket {
  schemaVersion: 1;
  requestType: AgenticRequestType;
  child: { name: string; ageDays: number; ageMonths: number };
  userRequest?: string;
  /** 30-day cohort analysis + deterministic targets (sleep recommendation engine spec). */
  sleepEngine?: {
    usableDays: number;
    personalizationStrength: string;
    targetWakeWindowMinutes: number;
    wakeWindowFloorMinutes: number;
    wakeWindowCeilingMinutes: number;
    keyThresholds: string[];
    bestDayTrendLines: string[];
    worstDayTrendLines: string[];
  };
  factsTopline: Record<string, unknown>;
  rankedCandidates: Array<{
    id: string;
    rank: number;
    label: string;
    actionType: string;
    score: number;
    primaryTimeIso?: string;
    secondaryTimeIso?: string;
    wakeAtIso?: string;
    suggestedCapMinutes?: number | null;
    strengths: string[];
    weaknesses: string[];
    expectedDownstream: string;
    /**
     * Same deterministic “rest of day” the app will show if this candidate is chosen.
     * reasoningSummary MUST NOT cite other bedtimes/caps/times for the plan.
     */
    clientRestOfDay: string[];
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
  patternAnalysis?: SleepPatternAnalysis | null,
  engineGuidance?: SleepEngineGuidance | null,
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

  const sleepEngine =
    patternAnalysis && engineGuidance
      ? {
        usableDays: patternAnalysis.daysAnalyzed,
        personalizationStrength: engineGuidance.personalizationStrength,
        targetWakeWindowMinutes: engineGuidance.targetWakeWindowMinutes,
        wakeWindowFloorMinutes: engineGuidance.wakeWindowFloorMinutes,
        wakeWindowCeilingMinutes: engineGuidance.wakeWindowCeilingMinutes,
        keyThresholds: patternAnalysis.keyThresholds.slice(0, 6),
        bestDayTrendLines: patternAnalysis.bestDayTrends.summaryLines.slice(0, 6),
        worstDayTrendLines: patternAnalysis.worstDayTrends.summaryLines.slice(0, 6),
      }
      : undefined;

  return {
    schemaVersion: 1,
    requestType,
    child: { name: profile.name, ageDays: profile.ageDays, ageMonths: facts.ageMonths },
    userRequest: userMessage,
    sleepEngine,
    factsTopline,
    rankedCandidates: ranked.slice(0, 5).map((c) => ({
      id: c.id,
      rank: c.rank,
      label: c.label,
      actionType: c.actionType,
      score: c.score,
      primaryTimeIso: c.primaryTimeIso,
      secondaryTimeIso: c.secondaryTimeIso,
      wakeAtIso: c.wakeAtIso,
      suggestedCapMinutes: c.suggestedCapMinutes,
      strengths: c.strengths,
      weaknesses: c.weaknesses,
      expectedDownstream: c.expectedDownstream,
      clientRestOfDay: buildClientRestOfDayLines(c, facts, profile),
    })),
    dataQuality: dq,
    guardrailsReminder:
      'Do not invent logs. Do not give medical advice. Use gentle practical tone. If data is weak, lower certainty.',
  };
}

/** Lines matching the app’s “Ideal rest of day” for this candidate (same builder as legacy next_sleep). */
function buildClientRestOfDayLines(c: RankedCandidate, facts: SleepFacts, profile: ChildProfile): string[] {
  const tz = facts.timezone;

  if (c.actionType === 'BEDTIME' && c.primaryTimeIso) {
    const ms = new Date(c.primaryTimeIso).getTime();
    if (Number.isNaN(ms)) return [];
    return [`Bedtime: ${formatLocalTime(ms, tz)}`];
  }

  if (c.actionType === 'NAP_START' && c.primaryTimeIso) {
    const startMs = new Date(c.primaryTimeIso).getTime();
    if (Number.isNaN(startMs)) return [];
    const cap = c.suggestedCapMinutes ?? 45;
    const events = buildNapWindowRestOfDaySchedule(startMs, cap, facts, profile, tz);
    return formatNapWindowEventsToLines(events);
  }

  if (c.actionType === 'CATNAP' && c.primaryTimeIso) {
    const startMs = new Date(c.primaryTimeIso).getTime();
    if (Number.isNaN(startMs)) return [];
    const capMin = Math.max(15, c.suggestedCapMinutes ?? 20);
    const endMs = startMs + capMin * 60000;
    const bedMs = new Date(facts.bedtimeWindow.endIso).getTime();
    return [
      `Catnap: ${formatLocalTime(startMs, tz)}–${formatLocalTime(endMs, tz)}, cap ${capMin}m`,
      `Bedtime: ${formatLocalTime(bedMs, tz)}`,
    ];
  }

  if (c.actionType === 'WAKE_FROM_NAP' && c.wakeAtIso) {
    const w = new Date(c.wakeAtIso).getTime();
    if (Number.isNaN(w)) return [];
    return [`Wake by: ${formatLocalTime(w, tz)}`];
  }

  return [];
}

function formatNapWindowEventsToLines(events: Array<Record<string, unknown>>): string[] {
  const lines: string[] = [];
  let napNum = 1;
  let i = 0;
  while (i < events.length) {
    const row = events[i];
    const ev = String(row.event || '');
    if (ev === 'nap_start') {
      const next = events[i + 1];
      const t0 = String(row.time || '');
      const cap = row.cap_minutes != null ? Number(row.cap_minutes) : null;
      if (next && String(next.event) === 'nap_end') {
        const t1 = String(next.time || '');
        const capPart =
          cap != null && Number.isFinite(cap) ? `, cap ${Math.round(cap)}m` : '';
        lines.push(`Nap ${napNum}: ${t0}–${t1}${capPart}`);
        i += 2;
      } else {
        lines.push(`Nap ${napNum}: ${t0}`);
        i += 1;
      }
      napNum += 1;
    } else if (ev === 'bedtime') {
      lines.push(`Bedtime: ${String(row.time || '')}`);
      i += 1;
    } else {
      i += 1;
    }
  }
  return lines;
}
