import type { AgenticRequestType } from '../types/aiRequest.ts';
import type { ChildProfile } from '../types/aiRequest.ts';
import type { ScheduleCandidate } from '../types/candidateOption.ts';
import type { SleepFacts } from '../types/sleepFacts.ts';
import {
  catnapVsEarlyBedtimeScore,
  computeNapCapDurations,
  earliestReasonableBedtimeClockMinutes,
  getDaytimeNapBudgetMinutes,
  getMaxSingleNapMinutesByAge,
  getNapCountExpectationForAge,
  getWakeWindowBandsForAge,
} from '../sleepRules.ts';
import { formatLocalTime, getUtcOffsetMinutesAt, roundToNearestMinutes } from '../utils/sleepMath.ts';

export function generateCandidateScheduleOptions(
  facts: SleepFacts,
  profile: ChildProfile,
  requestType: AgenticRequestType,
  nowIso: string,
): ScheduleCandidate[] {
  switch (requestType) {
    case 'MAX_NAP_DURATION_RECOMMENDATION':
    case 'NAP_CAP_RECOMMENDATION':
      return maxNapCandidates(facts, profile, nowIso);
    case 'BEDTIME_RECOMMENDATION':
      return bedtimeCandidates(facts, profile, nowIso);
    case 'CATNAP_VS_EARLY_BEDTIME':
      return catnapVsBedtimeCandidates(facts, profile, nowIso);
    case 'NEXT_NAP_RECOMMENDATION':
    default:
      return nextNapCandidates(facts, profile, nowIso);
  }
}

function nextNapCandidates(facts: SleepFacts, profile: ChildProfile, nowIso: string): ScheduleCandidate[] {
  if (facts.ongoingNight || !facts.lastWakeIso) {
    return [];
  }
  // If currently napping, "next nap" is really wake timing — handled by max-nap request type
  if (facts.currentNapInProgress && facts.ongoingNapStartIso) {
    return maxNapCandidates(facts, profile, nowIso);
  }

  const ww = getWakeWindowBandsForAge(facts.ageDays);
  const targetNaps = profile.preferences.target_nap_count ?? getNapCountExpectationForAge(facts.ageDays).typical;
  const lastWakeMs = new Date(facts.lastWakeIso).getTime();
  const nowMs = new Date(nowIso).getTime();

  const deltas = [-10, 0, 15];
  const out: ScheduleCandidate[] = [];
  for (let i = 0; i < deltas.length; i++) {
    const delta = deltas[i];
    const napStartMs = roundToNearestMinutes(lastWakeMs + (ww.typical + delta) * 60000, 5);
    if (napStartMs < nowMs - 60000) continue;

    const napBudget = getDaytimeNapBudgetMinutes(facts.ageDays);
    const remaining = Math.max(0, napBudget - facts.daytimeSleepMinutes);
    const cap = Math.min(
      getMaxSingleNapMinutesByAge(facts.ageDays),
      Math.max(25, remaining),
    );

    let score =
      0.55 +
      (delta === 0 ? 0.12 : 0) -
      Math.abs(delta) * 0.004;
    // Bedtime protection: penalize late nap starts when pressure high
    const projectedEnd = napStartMs + cap * 60000;
    const bedEnd = new Date(facts.bedtimeWindow.endIso).getTime();
    const lastWwPref =
      profile.preferences.last_wake_window_minutes && profile.preferences.last_wake_window_minutes > 0
        ? profile.preferences.last_wake_window_minutes
        : Math.round(ww.typical * 0.7);
    if (projectedEnd > bedEnd - lastWwPref * 60000) {
      score -= 0.18 * facts.bedtimeProtectionPressure;
    }
    if (facts.overtiredRisk > 0.5 && delta <= 0) score += 0.08;
    if (facts.undertiredRisk > 0.5 && delta > 0) score += 0.06;
    score = clamp01(score);

    out.push({
      id: `nap_start_${i}`,
      requestType: 'NEXT_NAP_RECOMMENDATION',
      actionType: 'NAP_START',
      label:
        delta === 0
          ? `Start nap around ${formatLocalTime(napStartMs, facts.timezone)}`
          : delta < 0
          ? `Earlier nap (~${Math.abs(delta)} min sooner)`
          : `Stretch wake window ~${delta} min`,
      primaryTimeIso: new Date(napStartMs).toISOString(),
      suggestedCapMinutes: cap,
      pros:
        delta <= 0
          ? ['Leans into sleepy cues if wake window was stretching', 'Can protect later rhythm']
          : ['Gives a bit more homeostatic sleep pressure for a fuller nap'],
      risks: delta > 0 ? ['If baby is already tired, may shorten the nap'] : ['May feel early if baby seems playful'],
      expectedDownstream: `Leaves ~${Math.round(remaining)} min of nap budget for the rest of the day (target ~${targetNaps} naps).`,
      score,
      confidence: score,
    });
  }
  return out.slice(0, 5);
}

function bedtimeCandidates(facts: SleepFacts, profile: ChildProfile, nowIso: string): ScheduleCandidate[] {
  const nowMs = new Date(nowIso).getTime();
  const targetMin = resolveBedtimeClockMin(profile, facts.ageDays);
  const anchor = new Date(nowIso);
  const utcOff = getUtcOffsetMinutesAt(nowIso, facts.timezone);
  const toMs = (clockMin: number) =>
    new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), Math.floor(clockMin / 60), clockMin % 60, 0)
      .getTime() -
    utcOff * 60000;

  let t0 = toMs(targetMin);
  if (t0 <= nowMs) t0 += 86400000;

  const offsets = [-15, 0, 15];
  return offsets.map((off, i) => {
    const ms = t0 + off * 60000;
    let score = 0.68 - Math.abs(off) * 0.01;
    if (facts.overtiredRisk > 0.55 && off <= 0) score += 0.1;
    if (facts.undertiredRisk > 0.55 && off >= 0) score += 0.08;
    score = clamp01(score);
    return {
      id: `bedtime_${i}`,
      requestType: 'BEDTIME_RECOMMENDATION',
      actionType: 'BEDTIME',
      label: `Bedtime around ${formatLocalTime(ms, facts.timezone)}`,
      primaryTimeIso: new Date(ms).toISOString(),
      pros: ['Simple ending anchor for a choppy day', 'Keeps rhythm close to your usual range'],
      risks: off < 0 ? ['Very early bed can shift morning wake if undertired'] : ['Later end may add fussing if already tired'],
      expectedDownstream: 'Sets up tomorrow’s first wake window from a consistent evening anchor.',
      score,
      confidence: score,
    };
  });
}

function maxNapCandidates(facts: SleepFacts, profile: ChildProfile, nowIso: string): ScheduleCandidate[] {
  if (!facts.currentNapInProgress || !facts.ongoingNapStartIso) {
    return [];
  }
  const napStartMs = new Date(facts.ongoingNapStartIso).getTime();
  const nowMs = new Date(nowIso).getTime();
  const elapsed = Math.max(0, Math.round((nowMs - napStartMs) / 60000));
  const ordinal = facts.currentNapOrdinalToday ?? 1;
  const napsPlanned = profile.preferences.target_nap_count ?? getNapCountExpectationForAge(facts.ageDays).typical;
  const budget = getDaytimeNapBudgetMinutes(facts.ageDays);
  const before = facts.totalDaytimeSleepBeforeCurrentNapMinutes ?? 0;

  const caps = computeNapCapDurations({
    ageDays: facts.ageDays,
    napOrdinal: ordinal,
    napsPlannedToday: napsPlanned,
    totalDaytimeSleepBeforeThisNapMinutes: before,
    currentNapElapsedMinutes: elapsed,
    daytimeBudgetMinutes: budget,
    recoveryPressure: facts.napRecoveryPressure,
    bedtimeProtectionPressure: facts.bedtimeProtectionPressure,
    preferLongerNaps: profile.memory?.preferEarlyBedtimeOverCatnaps === false ||
      profile.preferences.prefer_longer_naps === true,
    preferEarlierBedtime: profile.preferences.prefer_earlier_bedtime === true ||
      profile.memory?.preferEarlyBedtimeOverCatnaps === true,
  });

  const wakeNowMs = nowMs;
  const wake10Ms = nowMs + 10 * 60000;
  const preferredWakeMs = napStartMs + caps.preferredCapMinutes * 60000;
  const softWakeMs = napStartMs + caps.softCapMinutes * 60000;
  const hardWakeMs = napStartMs + caps.hardCapMinutes * 60000;

  const basePros = (ms: number) => {
    const minsFromNow = Math.round((ms - nowMs) / 60000);
    return minsFromNow <= 0
      ? ['Stops nap before it steals too much budget', 'Keeps evening landing realistic']
      : ['Gives a little more restorative depth', 'Still bounded by an upper limit'];
  };

  const mk = (id: string, ms: number, label: string, scoreBoost: number): ScheduleCandidate => {
    const minsTotal = Math.round((ms - napStartMs) / 60000);
    let score = 0.55 + scoreBoost;
    if (facts.bedtimeProtectionPressure > 0.65 && ms <= softWakeMs) score += 0.12;
    if (facts.napRecoveryPressure > 0.6 && ms >= preferredWakeMs) score += 0.08;
    score = clamp01(score);
    return {
      id,
      requestType: 'MAX_NAP_DURATION_RECOMMENDATION',
      actionType: 'WAKE_FROM_NAP',
      label,
      wakeAtIso: new Date(roundToNearestMinutes(ms, 5)).toISOString(),
      pros: basePros(ms),
      risks:
        ms > softWakeMs
          ? ['Later wake may push bedtime or shorten next wake window']
          : ['Baby might wake cranky — that can be normal'],
      expectedDownstream: `Total nap ~${minsTotal} min supports ~${Math.max(0, budget - before - minsTotal)} min remaining daytime sleep budget.`,
      score,
      confidence: score,
    };
  };

  return [
    mk('nap_cap_now', wakeNowMs, 'Wake now (or very soon)', facts.bedtimeProtectionPressure * 0.15),
    mk('nap_cap_10', wake10Ms, 'Wake in about 10 minutes', 0.06),
    mk('nap_cap_preferred', preferredWakeMs, `Wake by ${formatLocalTime(preferredWakeMs, facts.timezone)}`, 0.12),
    mk('nap_cap_soft', softWakeMs, `Still-okay window ends ~${formatLocalTime(softWakeMs, facts.timezone)}`, 0.04),
    mk('nap_cap_hard', hardWakeMs, `Hard stop by ${formatLocalTime(hardWakeMs, facts.timezone)}`, -0.05),
  ].filter((c) => new Date(c.wakeAtIso!).getTime() >= napStartMs - 60000);
}

function catnapVsBedtimeCandidates(facts: SleepFacts, profile: ChildProfile, nowIso: string): ScheduleCandidate[] {
  const nowMs = new Date(nowIso).getTime();
  const ww = getWakeWindowBandsForAge(facts.ageDays);
  const targetMin = resolveBedtimeClockMin(profile, facts.ageDays);
  const anchor = new Date(nowIso);
  const utcOff = getUtcOffsetMinutesAt(nowIso, facts.timezone);
  const toMs = (clockMin: number) =>
    new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), Math.floor(clockMin / 60), clockMin % 60, 0)
      .getTime() - utcOff * 60000;

  let bedtimeMs = toMs(targetMin);
  if (bedtimeMs <= nowMs) bedtimeMs += 86400000;
  const minsUntilBed = Math.round((bedtimeMs - nowMs) / 60000);

  const lastWw =
    profile.preferences.last_wake_window_minutes && profile.preferences.last_wake_window_minutes > 0
      ? profile.preferences.last_wake_window_minutes
      : Math.round(ww.typical * 0.7);

  const scores = catnapVsEarlyBedtimeScore({
    ageDays: facts.ageDays,
    minutesUntilTargetBedtime: minsUntilBed,
    lastWakeWindowMinutes: lastWw,
    daytimeSleepMinutes: facts.daytimeSleepMinutes,
    napBudget: getDaytimeNapBudgetMinutes(facts.ageDays),
    overtiredRisk: facts.overtiredRisk,
    preferEarlierBedtime: profile.preferences.prefer_earlier_bedtime === true,
  });

  const catnapStartMs = nowMs + 15 * 60000;
  const catnapEndMs = catnapStartMs + 20 * 60000;
  const bedAfterCatnapMs = catnapEndMs + lastWw * 60000;
  const earlyBedMs = nowMs + lastWw * 60000;

  return [
    {
      id: 'catnap_then_bed',
      requestType: 'CATNAP_VS_EARLY_BEDTIME' as const,
      actionType: 'CATNAP' as const,
      label: `Short catnap (~20 min) then bedtime ~${formatLocalTime(bedAfterCatnapMs, facts.timezone)}`,
      primaryTimeIso: new Date(catnapStartMs).toISOString(),
      secondaryTimeIso: new Date(bedAfterCatnapMs).toISOString(),
      suggestedCapMinutes: 20,
      pros: ['Resets overtired signal', 'Keeps closer to usual bedtime'],
      risks: ['Might refuse nap', 'If nap runs long, bedtime slides'],
      expectedDownstream: `Catnap at ${formatLocalTime(catnapStartMs, facts.timezone)}, wake by ${formatLocalTime(catnapEndMs, facts.timezone)}, bed ~${formatLocalTime(bedAfterCatnapMs, facts.timezone)}.`,
      score: scores.catnapScore,
      confidence: scores.catnapScore,
    },
    {
      id: 'skip_catnap_early_bed',
      requestType: 'CATNAP_VS_EARLY_BEDTIME' as const,
      actionType: 'BEDTIME' as const,
      label: `Skip catnap, early bedtime ~${formatLocalTime(earlyBedMs, facts.timezone)}`,
      primaryTimeIso: new Date(earlyBedMs).toISOString(),
      pros: ['Simpler evening', 'Avoids failed nap attempt'],
      risks: ['Might be hard to hold baby if still 1+ hours away', 'Earlier morning wake possible'],
      expectedDownstream: `Bedtime at ${formatLocalTime(earlyBedMs, facts.timezone)}.`,
      score: scores.earlyBedtimeScore,
      confidence: scores.earlyBedtimeScore,
    },
  ];
}

function resolveBedtimeClockMin(profile: ChildProfile, ageDays: number): number {
  const p = profile.preferences;
  let m = 19 * 60 + 30;
  if (p.bedtime_type === 'target' && p.bedtime_target_time) {
    const [h, mi] = p.bedtime_target_time.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(mi)) m = h * 60 + mi;
  }
  const floor = earliestReasonableBedtimeClockMinutes(ageDays);
  return Math.max(floor, Math.min(22 * 60, m));
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
