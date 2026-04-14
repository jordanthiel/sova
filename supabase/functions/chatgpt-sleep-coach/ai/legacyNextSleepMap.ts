import type { ChildProfile } from './types/aiRequest.ts';
import type { RankedCandidate } from './types/candidateOption.ts';
import type { AgenticScheduleResponse } from './types/recommendation.ts';
import type { SleepFacts } from './types/sleepFacts.ts';
import {
  getDaytimeNapBudgetMinutes,
  getMaxSingleNapMinutesByAge,
  getNapCountExpectationForAge,
  getWakeWindowBandsForAge,
} from './sleepRules.ts';
import {
  formatLocalTime,
  parseAmPmOnLocalCalendarDay,
  roundToNearestMinutes,
} from './utils/sleepMath.ts';

/** Preserves mobile contract for `mode: next_sleep` while adding richer `agentic` payload. */
export function agenticResponseToLegacyNextSleep(
  agentic: AgenticScheduleResponse,
  chosen: RankedCandidate | undefined,
  facts: SleepFacts,
  nowIso: string,
  profile: ChildProfile,
): Record<string, unknown> {
  const tz = facts.timezone;
  const nowMs = new Date(nowIso).getTime();

  if (agentic.recommendedAction.type === 'WAKE_FROM_NAP') {
    return wakeFromNapLegacy(agentic, chosen, facts, nowMs, tz);
  }

  if (agentic.recommendedAction.type === 'BEDTIME') {
    return bedtimeLegacy(agentic, facts, nowMs, tz);
  }

  if (agentic.recommendedAction.type === 'CATNAP_THEN_BEDTIME') {
    return catnapLegacy(agentic, facts, nowMs, tz);
  }

  // Default: NAP_WINDOW
  return napWindowLegacy(agentic, chosen, facts, nowMs, tz, profile);
}

function wakeFromNapLegacy(
  agentic: AgenticScheduleResponse,
  chosen: RankedCandidate | undefined,
  facts: SleepFacts,
  nowMs: number,
  tz: string,
): Record<string, unknown> {
  const wakeIso = agentic.recommendedAction.wakeAt;
  const wakeMs = wakeIso ? new Date(wakeIso).getTime() : nowMs;
  const napStart = facts.ongoingNapStartIso ? new Date(facts.ongoingNapStartIso).getTime() : wakeMs;
  const capAt = Math.max(15, Math.round((wakeMs - napStart) / 60000));
  const minsFromNow = Math.max(0, Math.round((wakeMs - nowMs) / 60000));

  return {
    recommended_time: formatLocalTime(wakeMs, tz),
    sleep_type: 'nap',
    expected_duration_minutes: capAt,
    minutes_from_now: minsFromNow,
    urgency: minsFromNow <= 5 ? 'now' : minsFromNow <= 15 ? 'soon' : 'upcoming',
    headline: 'Cap ongoing nap',
    should_cap_nap: true,
    cap_at_minutes: capAt,
    wake_window_minutes: Math.max(25, chosen?.stretchWakeWindowMinutes ?? facts.currentWakeWindowMinutes ?? 60),
    summary: safeTruncate(agentic.parentFacingResponse, 400),
    reasoning: agentic.reasoningSummary,
    cap_reason: 'Protects rest-of-day sleep pressure and keeps bedtime realistic.',
    rest_of_day_schedule: [],
  };
}

function bedtimeLegacy(
  agentic: AgenticScheduleResponse,
  facts: SleepFacts,
  nowMs: number,
  tz: string,
): Record<string, unknown> {
  const bedMs = resolveTimestamp(
    agentic.recommendedAction.startAt,
    facts.bedtimeWindow.endIso,
    nowMs,
  );
  const minsFromNow = Math.max(0, Math.round((bedMs - nowMs) / 60000));

  return {
    recommended_time: formatLocalTime(bedMs, tz),
    sleep_type: 'bedtime',
    expected_duration_minutes: 720,
    minutes_from_now: minsFromNow,
    urgency: minsFromNow <= 15 ? 'soon' : 'upcoming',
    headline: 'Bedtime window',
    should_cap_nap: false,
    cap_at_minutes: null,
    wake_window_minutes: facts.currentWakeWindowMinutes ?? 90,
    summary: safeTruncate(agentic.parentFacingResponse, 400),
    reasoning: agentic.reasoningSummary,
    cap_reason: null,
    rest_of_day_schedule: [
      { time: formatLocalTime(bedMs, tz), event: 'bedtime', label: 'Bedtime' },
    ],
  };
}

function catnapLegacy(
  agentic: AgenticScheduleResponse,
  facts: SleepFacts,
  nowMs: number,
  tz: string,
): Record<string, unknown> {
  const catnapStartMs = resolveTimestamp(agentic.recommendedAction.startAt, null, nowMs + 15 * 60000);
  const catnapEndMs = resolveTimestamp(agentic.recommendedAction.endAt, null, catnapStartMs + 20 * 60000);
  const bedMs = new Date(facts.bedtimeWindow.endIso).getTime();
  const capMin = Math.max(15, Math.round((catnapEndMs - catnapStartMs) / 60000));
  const minsFromNow = Math.max(0, Math.round((catnapStartMs - nowMs) / 60000));

  return {
    recommended_time: formatLocalTime(catnapStartMs, tz),
    sleep_type: 'nap',
    expected_duration_minutes: capMin,
    minutes_from_now: minsFromNow,
    urgency: minsFromNow <= 5 ? 'now' : minsFromNow <= 15 ? 'soon' : 'upcoming',
    headline: 'Quick catnap',
    should_cap_nap: true,
    cap_at_minutes: capMin,
    wake_window_minutes: facts.currentWakeWindowMinutes ?? 90,
    summary: safeTruncate(agentic.parentFacingResponse, 400),
    reasoning: agentic.reasoningSummary,
    cap_reason: 'Short rescue nap before bedtime.',
    rest_of_day_schedule: [
      { time: formatLocalTime(catnapStartMs, tz), event: 'nap_start', label: 'Catnap', cap_minutes: capMin },
      { time: formatLocalTime(catnapEndMs, tz), event: 'nap_end', label: 'Wake' },
      { time: formatLocalTime(bedMs, tz), event: 'bedtime', label: 'Bedtime' },
    ],
  };
}

/**
 * How many naps should still happen *after* the recommended nap completes (same calendar plan).
 * Root fix: legacy map used to jump straight from first nap wake → bedtime, ignoring parent target nap count.
 */
function napsRemainingAfterRecommendedNap(facts: SleepFacts, profile: ChildProfile): number {
  const target =
    profile.preferences.target_nap_count != null && profile.preferences.target_nap_count > 0
      ? profile.preferences.target_nap_count
      : getNapCountExpectationForAge(facts.ageDays).typical;
  const completedBefore = facts.completedNapCountToday;
  const afterThisNap = completedBefore + 1;
  return Math.max(0, target - afterThisNap);
}

/**
 * Build rest-of-day rows: recommended nap, any additional naps implied by target count, then bedtime.
 */
/** Exported so the selector LLM can ground copy in the same timeline the app renders. */
export function buildNapWindowRestOfDaySchedule(
  firstStartMs: number,
  firstCapMin: number,
  facts: SleepFacts,
  profile: ChildProfile,
  tz: string,
): Array<Record<string, unknown>> {
  const cap = firstCapMin;
  const startMs = firstStartMs;
  const endMs = startMs + cap * 60000;
  const bedMs = new Date(facts.bedtimeWindow.endIso).getTime();
  const ww = getWakeWindowBandsForAge(facts.ageDays);
  const napBudget = getDaytimeNapBudgetMinutes(facts.ageDays);
  const maxSingle = getMaxSingleNapMinutesByAge(facts.ageDays);
  const lastWwMin =
    profile.preferences.last_wake_window_minutes != null && profile.preferences.last_wake_window_minutes > 0
      ? profile.preferences.last_wake_window_minutes
      : Math.round(ww.typical * 0.7);
  const lastWwMs = lastWwMin * 60000;

  const events: Array<Record<string, unknown>> = [
    { time: formatLocalTime(startMs, tz), event: 'nap_start', label: 'Next nap start', cap_minutes: cap },
    { time: formatLocalTime(endMs, tz), event: 'nap_end', label: 'Wake / cap' },
  ];

  let remaining = napsRemainingAfterRecommendedNap(facts, profile);
  let cursor = endMs;
  let projectedDaySleep = facts.daytimeSleepMinutes + cap;
  let laterIndex = 0;

  while (remaining > 0) {
    const reserveAfterNapMs = remaining === 1 ? lastWwMs : lastWwMs + 45 * 60000;
    const hardEndForThisNap = bedMs - reserveAfterNapMs;
    const roomMs = hardEndForThisNap - cursor;
    if (roomMs < 55 * 60000) {
      break;
    }

    const budgetLeft = Math.max(0, napBudget - projectedDaySleep);
    let capMin = Math.min(maxSingle, Math.max(30, Math.ceil(budgetLeft / remaining)));
    let wwBeforeMs = Math.min(ww.typical * 60000, Math.max(45 * 60000, Math.floor(roomMs * 0.38)));

    if (wwBeforeMs + capMin * 60000 > roomMs) {
      capMin = Math.max(25, Math.floor((roomMs - 45 * 60000) / 60000));
      wwBeforeMs = Math.max(45 * 60000, roomMs - capMin * 60000);
    }

    let napKStart = roundToNearestMinutes(cursor + wwBeforeMs, 5);
    let napKEnd = roundToNearestMinutes(napKStart + capMin * 60000, 5);

    if (napKEnd > hardEndForThisNap) {
      napKEnd = roundToNearestMinutes(hardEndForThisNap, 5);
      napKStart = roundToNearestMinutes(Math.max(cursor + 40 * 60000, napKEnd - capMin * 60000), 5);
    }

    const actualCap = Math.max(25, Math.round((napKEnd - napKStart) / 60000));
    laterIndex += 1;
    events.push({
      time: formatLocalTime(napKStart, tz),
      event: 'nap_start',
      label: remaining === 1 && laterIndex === 1 ? 'Second nap' : `Later nap ${laterIndex}`,
      cap_minutes: actualCap,
    });
    events.push({
      time: formatLocalTime(napKEnd, tz),
      event: 'nap_end',
      label: 'Wake',
    });

    projectedDaySleep += actualCap;
    cursor = napKEnd;
    remaining -= 1;
  }

  events.push({ time: formatLocalTime(bedMs, tz), event: 'bedtime', label: 'Bedtime' });
  return events;
}

function napWindowLegacy(
  agentic: AgenticScheduleResponse,
  chosen: RankedCandidate | undefined,
  facts: SleepFacts,
  nowMs: number,
  tz: string,
  profile: ChildProfile,
): Record<string, unknown> {
  const startMs = resolveTimestamp(agentic.recommendedAction.startAt, null, nowMs);
  const cap = chosen?.suggestedCapMinutes ?? 45;
  const minsFromNow = Math.max(0, Math.round((startMs - nowMs) / 60000));

  const restOfDay = buildNapWindowRestOfDaySchedule(startMs, cap, facts, profile, tz);

  return {
    recommended_time: formatLocalTime(startMs, tz),
    sleep_type: 'nap',
    expected_duration_minutes: cap,
    minutes_from_now: minsFromNow,
    urgency: minsFromNow <= 5 ? 'now' : minsFromNow <= 15 ? 'soon' : minsFromNow <= 60 ? 'upcoming' : 'not_yet',
    headline: 'Next nap window',
    should_cap_nap: true,
    cap_at_minutes: cap,
    wake_window_minutes: facts.currentWakeWindowMinutes ?? 90,
    summary: safeTruncate(agentic.parentFacingResponse, 400),
    reasoning: agentic.reasoningSummary,
    cap_reason: 'Keeps daytime total near goal while protecting evening sleep pressure.',
    rest_of_day_schedule: restOfDay,
  };
}

function resolveTimestamp(primary: string | undefined, secondary: string | null, fallbackMs: number): number {
  if (primary) {
    const ms = new Date(primary).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  if (secondary) {
    const ms = new Date(secondary).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return fallbackMs;
}

function safeTruncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Enforce parent `target_nap_count` and avoid impossible late first/only naps when more naps
 * must still fit before bedtime (e.g. 2-nap day: first nap cannot start at 4pm if bed is 7pm).
 */
export function clampLegacyNextSleepToTargetNapPlan(
  legacy: Record<string, unknown>,
  facts: SleepFacts,
  profile: ChildProfile,
  nowIso: string,
): void {
  const target = profile.preferences.target_nap_count;
  if (target == null || target < 1 || facts.currentNapInProgress) return;

  const tz = facts.timezone;
  const nowMs = new Date(nowIso).getTime();
  const completed = facts.completedNapCountToday;

  // Already logged enough naps for the plan — next event should be bedtime, not another nap.
  if (completed >= target) {
    if (legacy.sleep_type === 'bedtime') return;
    const bedMsRaw = new Date(facts.bedtimeWindow.endIso).getTime();
    let bedMs = bedMsRaw;
    if (bedMs <= nowMs) bedMs = nowMs + 25 * 60000;
    legacy.recommended_time = formatLocalTime(bedMs, tz);
    legacy.sleep_type = 'bedtime';
    legacy.expected_duration_minutes = 720;
    const minsFromNowBed = Math.max(0, Math.round((bedMs - nowMs) / 60000));
    legacy.minutes_from_now = minsFromNowBed;
    legacy.headline = 'Bedtime';
    legacy.should_cap_nap = false;
    legacy.cap_at_minutes = null;
    legacy.cap_reason = null;
    legacy.urgency = minsFromNowBed <= 15 ? 'soon' : 'upcoming';
    legacy.rest_of_day_schedule = [
      { time: formatLocalTime(bedMs, tz), event: 'bedtime', label: 'Bedtime' },
    ];
    return;
  }

  if (legacy.sleep_type !== 'nap') return;

  const recStr = typeof legacy.recommended_time === 'string' ? legacy.recommended_time : '';
  const recMs = parseAmPmOnLocalCalendarDay(recStr, nowIso, tz);
  if (recMs == null) return;

  const bedMs = new Date(facts.bedtimeWindow.endIso).getTime();
  const ww = getWakeWindowBandsForAge(facts.ageDays);
  const lastWwMin =
    profile.preferences.last_wake_window_minutes != null && profile.preferences.last_wake_window_minutes > 0
      ? profile.preferences.last_wake_window_minutes
      : Math.round(ww.typical * 0.7);

  const napsAfterThis = Math.max(0, target - completed - 1);
  const minNapCap = 35;
  const gapBetweenNapsMin = 50;
  let tailReserveMin = lastWwMin + minNapCap;
  if (napsAfterThis > 0) {
    tailReserveMin += napsAfterThis * (minNapCap + gapBetweenNapsMin) + gapBetweenNapsMin;
  }
  let latestStartMs = bedMs - tailReserveMin * 60000;

  const earliestFromWake = facts.lastWakeIso
    ? new Date(facts.lastWakeIso).getTime() + ww.min * 60000
    : nowMs + 20 * 60000;

  if (latestStartMs < earliestFromWake + 10 * 60000) {
    latestStartMs = Math.max(earliestFromWake + 10 * 60000, latestStartMs);
  }

  if (recMs <= latestStartMs) return;

  let clampedMs = Math.min(recMs, latestStartMs);
  clampedMs = Math.max(clampedMs, nowMs + 5 * 60000, earliestFromWake);
  const cap =
    typeof legacy.cap_at_minutes === 'number' && legacy.cap_at_minutes > 0
      ? Math.round(legacy.cap_at_minutes)
      : 45;

  legacy.recommended_time = formatLocalTime(clampedMs, tz);
  legacy.minutes_from_now = Math.max(0, Math.round((clampedMs - nowMs) / 60000));
  const mf = legacy.minutes_from_now as number;
  legacy.urgency =
    mf <= 5 ? 'now' : mf <= 15 ? 'soon' : mf <= 60 ? 'upcoming' : 'not_yet';
  legacy.rest_of_day_schedule = buildNapWindowRestOfDaySchedule(clampedMs, cap, facts, profile, tz);
}
