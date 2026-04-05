import type { RankedCandidate } from './types/candidateOption.ts';
import type { AgenticScheduleResponse } from './types/recommendation.ts';
import type { SleepFacts } from './types/sleepFacts.ts';
import { formatLocalTime } from './utils/sleepMath.ts';

/** Preserves mobile contract for `mode: next_sleep` while adding richer `agentic` payload. */
export function agenticResponseToLegacyNextSleep(
  agentic: AgenticScheduleResponse,
  chosen: RankedCandidate | undefined,
  facts: SleepFacts,
  nowIso: string,
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
  return napWindowLegacy(agentic, chosen, facts, nowMs, tz);
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

function napWindowLegacy(
  agentic: AgenticScheduleResponse,
  chosen: RankedCandidate | undefined,
  facts: SleepFacts,
  nowMs: number,
  tz: string,
): Record<string, unknown> {
  const startMs = resolveTimestamp(agentic.recommendedAction.startAt, null, nowMs);
  const cap = chosen?.suggestedCapMinutes ?? 45;
  const endMs = startMs + cap * 60000;
  const bedMs = new Date(facts.bedtimeWindow.endIso).getTime();
  const minsFromNow = Math.max(0, Math.round((startMs - nowMs) / 60000));

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
    rest_of_day_schedule: [
      { time: formatLocalTime(startMs, tz), event: 'nap_start', label: 'Next nap start', cap_minutes: cap },
      { time: formatLocalTime(endMs, tz), event: 'nap_end', label: 'Wake / cap' },
      { time: formatLocalTime(bedMs, tz), event: 'bedtime', label: 'Bedtime' },
    ],
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
