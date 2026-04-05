import type { ScheduleCandidate, RankedCandidate } from '../types/candidateOption.ts';
import type { SleepFacts } from '../types/sleepFacts.ts';
import type { ChildProfile } from '../types/aiRequest.ts';

/**
 * Deterministic re-ranking + narrative strengths/weaknesses.
 * Weights are documented for later tuning — keep in sync with product goals.
 */
export function evaluateRecommendationCandidates(
  candidates: ScheduleCandidate[],
  facts: SleepFacts,
  _profile: ChildProfile,
): RankedCandidate[] {
  void _profile;
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  return sorted.map((c, i) => ({
    ...c,
    rank: i + 1,
    strengths: buildStrengths(c, facts),
    weaknesses: buildWeaknesses(c, facts),
  }));
}

function buildStrengths(c: ScheduleCandidate, facts: SleepFacts): string[] {
  const out: string[] = [];
  if (c.actionType === 'WAKE_FROM_NAP' && facts.bedtimeProtectionPressure > 0.55) {
    out.push('Protects evening rhythm on a fuller daytime-sleep day');
  }
  if (c.actionType === 'NAP_START' && facts.overtiredRisk > 0.45) {
    out.push('leans_toward_sooner_rest_when_wake_window_stretching');
  }
  if (c.score >= 0.75) out.push('Strong fit to current signals and remaining day shape');
  if (out.length === 0) out.push('Reasonable tradeoff for a messy real-world day');
  return out.slice(0, 3);
}

function buildWeaknesses(c: ScheduleCandidate, facts: SleepFacts): string[] {
  const out: string[] = [];
  if (facts.currentDayShape === 'messy') {
    out.push('Messy day — prefer baby cues over rigid clock math');
  }
  if (c.actionType === 'WAKE_FROM_NAP' && facts.napRecoveryPressure > 0.6) {
    out.push('May trim recovery if last night was rough');
  }
  if (c.risks.length) out.push(...c.risks.slice(0, 1));
  if (out.length === 0) out.push('No major red flags in-rule; stay flexible');
  return out.slice(0, 3);
}
