import type { AgenticRequestType, ChildProfile } from '../types/aiRequest.ts';
import type { RankedCandidate } from '../types/candidateOption.ts';
import type { SleepEngineStructuredBlock } from '../types/recommendation.ts';
import type { SleepFacts } from '../types/sleepFacts.ts';
import {
  earliestReasonableBedtimeClockMinutes,
  getDaytimeNapBudgetMinutes,
  getWakeWindowBandsForAge,
} from '../sleepRules.ts';
import { formatLocalTime, getUtcOffsetMinutesAt, roundToNearestMinutes } from '../utils/sleepMath.ts';
import type { SleepPatternAnalysis } from './sleepPatternAnalysisService.ts';

export interface SleepEngineGuidance {
  personalizationStrength: 'strong' | 'medium' | 'weak';
  usableDays: number;
  nextNapOrdinal: number;
  targetWakeWindowMinutes: number;
  wakeWindowCeilingMinutes: number;
  wakeWindowFloorMinutes: number;
  expectedNapLengthMinutes: number | null;
  bedtimeClockMinutesHint: number | null;
  explanationSeeds: string[];
  validationAdjustments: string[];
  guardrailsChecked: string[];
}

function fmtMinRange(min: number, max: number): string {
  const a = Math.round(min);
  const b = Math.round(max);
  const h1 = Math.floor(a / 60);
  const m1 = a % 60;
  const h2 = Math.floor(b / 60);
  const m2 = b % 60;
  return `${h1}h${m1.toString().padStart(2, '0')}m-${h2}h${m2.toString().padStart(2, '0')}m`;
}

function bestWwForOrdinal(ordinal: number, analysis: SleepPatternAnalysis): number | null {
  const b = analysis.bestDayTrends;
  if (ordinal <= 1) return b.wake_window_1_median;
  if (ordinal === 2) return b.wake_window_2_median;
  if (ordinal === 3) return b.wake_window_3_median;
  return b.final_wake_window_median ?? b.wake_window_3_median ?? b.wake_window_2_median;
}

function worstWwForOrdinal(ordinal: number, analysis: SleepPatternAnalysis): number | null {
  const w = analysis.worstDayTrends;
  if (ordinal <= 1) return w.wake_window_1_median;
  if (ordinal === 2) return w.wake_window_2_median;
  if (ordinal === 3) return w.wake_window_3_median;
  return w.final_wake_window_median ?? w.wake_window_3_median ?? w.wake_window_2_median;
}

function blendStrength(usableDays: number): { strength: SleepEngineGuidance['personalizationStrength']; t: number } {
  if (usableDays >= 8) return { strength: 'strong', t: 0.58 };
  if (usableDays >= 3) return { strength: 'medium', t: 0.38 };
  return { strength: 'weak', t: 0.14 };
}

/**
 * Deterministic layer: blends age bands with top/bottom cohort patterns (spec steps 3–5, 7–8).
 */
export function buildSleepEngineGuidance(
  analysis: SleepPatternAnalysis,
  facts: SleepFacts,
  profile: ChildProfile,
): SleepEngineGuidance {
  const age = getWakeWindowBandsForAge(facts.ageDays);
  const adjustments: string[] = [];
  const guardrails: string[] = [
    'Age wake-window min/max',
    'Earliest reasonable bedtime floor',
    'Daytime nap budget awareness',
  ];

  const ordinal = facts.currentNapInProgress
    ? facts.currentNapOrdinalToday ?? facts.completedNapCountToday + 1
    : facts.completedNapCountToday + 1;

  const { strength, t } = blendStrength(analysis.daysAnalyzed);
  const bestM = bestWwForOrdinal(ordinal, analysis);
  const worstM = worstWwForOrdinal(ordinal, analysis);

  let target = age.typical;
  if (bestM != null) {
    target = Math.round(age.typical * (1 - t) + bestM * t);
  }

  let ceiling = age.max;
  if (bestM != null && worstM != null && worstM - bestM >= 22) {
    ceiling = Math.min(ceiling, Math.round(bestM + 18));
    adjustments.push('Tightened wake-window ceiling vs weaker-day stretch pattern.');
  }

  let floor = age.min;
  if (facts.overtiredRisk > 0.62) {
    floor = Math.min(floor + 5, target);
    target = Math.max(floor, Math.min(target, Math.round(age.typical * 0.92)));
    adjustments.push('Slightly earlier nap target because overtired risk is elevated today.');
  }
  if (facts.undertiredRisk > 0.58) {
    target = Math.min(ceiling, Math.round(target + Math.min(12, (ceiling - target) * 0.35)));
    adjustments.push('Nudged wake window longer because undertired signal is elevated.');
  }

  target = Math.max(floor, Math.min(ceiling, target));

  if (target < floor + 3) {
    target = floor;
  }
  if (target > ceiling) {
    target = ceiling;
    adjustments.push('Clamped target wake window to age maximum.');
  }

  const bedHint = analysis.bestDayTrends.bedtime_clock_median_minutes;
  const earliestBed = earliestReasonableBedtimeClockMinutes(facts.ageDays);
  let bedtimeClockHint: number | null = bedHint;
  if (bedtimeClockHint != null && bedtimeClockHint < earliestBed) {
    bedtimeClockHint = earliestBed;
    adjustments.push('Bedtime hint raised to earliest reasonable bound for age.');
  }

  const seeds: string[] = [];
  if (analysis.daysAnalyzed >= 8) {
    seeds.push('Recent history has enough usable days to lean on this baby’s stronger-day patterns.');
  } else if (analysis.daysAnalyzed >= 3) {
    seeds.push('Patterns are emerging — blending a moderate amount of personal history with age norms.');
  } else {
    seeds.push('Limited usable history in the last 30 days — age-based guardrails carry most of the weight.');
  }
  if (bestM != null) {
    seeds.push(`Stronger logged days often used ~${bestM} min before nap ${ordinal} (recency-weighted cohort).`);
  }
  seeds.push(...analysis.keyThresholds.slice(0, 2));

  const budget = getDaytimeNapBudgetMinutes(facts.ageDays);
  const remaining = Math.max(0, budget - facts.daytimeSleepMinutes);
  const expectedNap = remaining > 0 ? Math.min(90, Math.max(20, Math.round(remaining / Math.max(1, 4 - ordinal)))) : null;

  return {
    personalizationStrength: strength,
    usableDays: analysis.daysAnalyzed,
    nextNapOrdinal: ordinal,
    targetWakeWindowMinutes: target,
    wakeWindowCeilingMinutes: ceiling,
    wakeWindowFloorMinutes: floor,
    expectedNapLengthMinutes: expectedNap,
    bedtimeClockMinutesHint: bedtimeClockHint,
    explanationSeeds: seeds,
    validationAdjustments: adjustments,
    guardrailsChecked: guardrails,
  };
}

function confidenceBucketFrom(
  guidance: SleepEngineGuidance,
  dataQuality: number,
  facts: SleepFacts,
): 'high' | 'medium' | 'low' {
  if (dataQuality < 0.42 || guidance.usableDays < 3) return 'low';
  if (facts.currentDayShape === 'messy' || facts.napTransitionSignalStrength != null && facts.napTransitionSignalStrength > 0.45) {
    return guidance.usableDays >= 8 && dataQuality >= 0.62 ? 'medium' : 'low';
  }
  if (guidance.personalizationStrength === 'strong' && dataQuality >= 0.65) return 'high';
  if (guidance.personalizationStrength === 'medium' && dataQuality >= 0.55) return 'medium';
  return 'medium';
}

function primaryDriverLine(guidance: SleepEngineGuidance, analysis: SleepPatternAnalysis): string {
  if (guidance.personalizationStrength === 'weak') {
    return 'Age-based wake windows with light personalization (sparse usable history).';
  }
  if (analysis.keyThresholds[0]) {
    return analysis.keyThresholds[0].slice(0, 200);
  }
  return 'Blended stronger-day wake patterns with today’s pressure signals.';
}

function planStepsFromCandidate(
  chosen: RankedCandidate | undefined,
  facts: SleepFacts,
  profile: ChildProfile,
  nowIso: string,
  guidance: SleepEngineGuidance,
): { planA: string[]; planB: string[] } {
  const tz = facts.timezone;
  const nowMs = new Date(nowIso).getTime();
  const planA: string[] = [];
  const planB: string[] = [];

  if (!chosen) {
    return {
      planA: ['Review logs and confirm last wake time.'],
      planB: ['If timing still unclear, follow sleepy cues within age wake-window range.'],
    };
  }

  if (chosen.actionType === 'WAKE_FROM_NAP' && chosen.wakeAtIso) {
    const w = new Date(chosen.wakeAtIso).getTime();
    planA.push(`Cap nap: wake around ${formatLocalTime(w, tz)}.`);
    planA.push('Preserve evening sleep pressure for a realistic bedtime.');
    planB.push('If baby wakes much earlier than the cap, use the next wake window from that wake time.');
    return { planA, planB };
  }

  if (chosen.actionType === 'BEDTIME' && chosen.primaryTimeIso) {
    const b = new Date(chosen.primaryTimeIso).getTime();
    planA.push(`Target bedtime around ${formatLocalTime(b, tz)}.`);
    planB.push('If overtired signs are strong, you can move bedtime slightly earlier (15–25 min).');
    return { planA, planB };
  }

  if (chosen.primaryTimeIso) {
    const start = new Date(chosen.primaryTimeIso).getTime();
    const cap = chosen.suggestedCapMinutes ?? guidance.expectedNapLengthMinutes ?? 45;
    planA.push(`Next nap: offer around ${formatLocalTime(start, tz)}.`);
    planA.push(`Cap ~${cap} min if needed to protect bedtime.`);
    if (guidance.bedtimeClockMinutesHint != null) {
      const bh = Math.floor(guidance.bedtimeClockMinutesHint / 60);
      const bm = Math.round(guidance.bedtimeClockMinutesHint % 60);
      planA.push(`Aim for bedtime near ${bh}:${bm.toString().padStart(2, '0')} local if the day stays on track.`);
    }
    planB.push('If the nap is refused or ends very short, shorten the next wake window and consider a 15–20 min rescue nap or earlier bedtime.');
    const bedEnd = new Date(facts.bedtimeWindow.endIso).getTime();
    if (bedEnd > nowMs) {
      planB.push(`If last nap is skipped, bedtime can land closer to ${formatLocalTime(bedEnd - 30 * 60000, tz)}–${formatLocalTime(bedEnd, tz)}.`);
    }
    return { planA, planB };
  }

  return { planA, planB };
}

export function buildSleepEngineStructuredBlock(params: {
  analysis: SleepPatternAnalysis;
  guidance: SleepEngineGuidance;
  facts: SleepFacts;
  profile: ChildProfile;
  chosen: RankedCandidate | undefined;
  fallback: RankedCandidate | undefined;
  nowIso: string;
  dataQualityScore: number;
  requestType: AgenticRequestType;
}): SleepEngineStructuredBlock {
  const { analysis, guidance, facts, profile, chosen, fallback, nowIso, dataQualityScore, requestType } = params;
  const age = getWakeWindowBandsForAge(facts.ageDays);
  const conf = confidenceBucketFrom(guidance, dataQualityScore, facts);

  const recommendationType =
    requestType === 'BEDTIME_RECOMMENDATION'
      ? 'bedtime_only'
      : requestType === 'MAX_NAP_DURATION_RECOMMENDATION' || requestType === 'NAP_CAP_RECOMMENDATION'
      ? 'next_nap'
      : 'rest_of_day';

  const ageGuidance = {
    wake_window_1: fmtMinRange(age.min, Math.min(age.max, age.typical + 15)),
    wake_window_2: fmtMinRange(age.min, age.max),
    final_wake_window: fmtMinRange(Math.round(age.typical * 0.65), age.max),
  };

  const bestLines = analysis.bestDayTrends.summaryLines;
  const worstLines = analysis.worstDayTrends.summaryLines;

  const lastWakeMs = facts.lastWakeIso ? new Date(facts.lastWakeIso).getTime() : null;
  let nextSleepIso: string | null = null;
  if (chosen?.primaryTimeIso) nextSleepIso = chosen.primaryTimeIso;
  else if (chosen?.wakeAtIso) nextSleepIso = chosen.wakeAtIso;

  let targetWw = guidance.targetWakeWindowMinutes;
  if (lastWakeMs != null && nextSleepIso) {
    const implied = Math.round((new Date(nextSleepIso).getTime() - lastWakeMs) / 60000);
    if (implied > 15 && implied < 600) targetWw = implied;
  }

  const napCap = chosen?.suggestedCapMinutes ?? null;
  const bedMs = facts.bedtimeWindow.endIso ? new Date(facts.bedtimeWindow.endIso).getTime() : null;
  let recommendedBedtimeIso: string | null = null;
  if (bedMs != null && guidance.bedtimeClockMinutesHint != null) {
    const anchor = new Date(nowIso);
    const utcOff = getUtcOffsetMinutesAt(nowIso, facts.timezone);
    const c = guidance.bedtimeClockMinutesHint;
    const ms = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), Math.floor(c / 60), c % 60, 0)
      .getTime() - utcOff * 60000;
    let t = roundToNearestMinutes(ms, 5);
    if (t <= new Date(nowIso).getTime()) t += 86400000;
    recommendedBedtimeIso = new Date(t).toISOString();
  } else if (chosen?.actionType === 'BEDTIME' && chosen.primaryTimeIso) {
    recommendedBedtimeIso = chosen.primaryTimeIso;
  }

  const { planA, planB } = planStepsFromCandidate(chosen, facts, profile, nowIso, guidance);

  const explanation = [
    ...guidance.explanationSeeds.slice(0, 3),
    ...(fallback ? [`Fallback if plan A stalls: ${fallback.label}.`] : []),
  ];

  return {
    summary: {
      recommendation_type: recommendationType,
      confidence: conf,
      primary_driver: primaryDriverLine(guidance, analysis),
    },
    analysis: {
      input_sessions: analysis.inputSessionCount,
      days_analyzed: analysis.daysAnalyzed,
      top_days_considered: analysis.topDays.length,
      bottom_days_considered: analysis.bottomDays.length,
      age_guidance_used: ageGuidance,
      personal_patterns: {
        best_day_trends: bestLines,
        worst_day_trends: worstLines,
        key_thresholds: analysis.keyThresholds,
      },
    },
    recommendation: {
      next_sleep_time: nextSleepIso,
      target_wake_window_minutes: targetWw,
      nap_cap_minutes: napCap,
      expected_nap_length_minutes: guidance.expectedNapLengthMinutes,
      recommended_bedtime: recommendedBedtimeIso,
    },
    rest_of_day_plan: {
      plan_a: planA,
      plan_b: planB,
    },
    validation: {
      passed: true,
      adjustments_made: guidance.validationAdjustments,
      guardrails_checked: guidance.guardrailsChecked,
    },
    explanation,
  };
}
