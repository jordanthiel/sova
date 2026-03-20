import type {
  Baby,
  SleepEvent,
  AIRecommendation,
  NapRecommendationPayload,
  RestOfDayScheduleEvent,
} from '@/types/domain';
import {
  calculateAgeDays,
  getWakeWindowForAge,
  getAdaptiveWakeWindowMinutes,
  getObservedDailyNapCount,
  getRecommendedNapCountForAge,
} from '@/utils/wakeWindowCalculator';
import { formatDuration, roundToNearest5, roundDateToNearest5Minutes } from '@/utils/formatTime';
import { format, addMinutes, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { getPremiumAccessErrorFromResponse } from '@/services/subscription';
import { isPremiumAccessRequiredError } from '@/types/subscription';

// ─── Shared constants ───────────────────────────────────────────

/** Age-based daytime nap budget (total minutes across all naps). */
function getDayNapBudget(ageDays: number): number {
  if (ageDays < 120) return 210;   // 0–4 mo: ~3.5h
  if (ageDays < 270) return 180;   // 4–9 mo: ~3h
  if (ageDays < 365) return 150;   // 9–12 mo: ~2.5h
  return 120;                       // 12+ mo: ~2h
}

/** Max single nap duration (cap) by age. */
function getMaxSingleNapMinutes(ageDays: number): number {
  if (ageDays < 120) return 120;   // 0–4 mo: up to 2h
  if (ageDays < 270) return 90;    // 4–9 mo: up to 1.5h
  if (ageDays < 365) return 75;    // 9–12 mo: up to 1h15m
  return 60;                        // 12+ mo: up to 1h
}

/** Compute the recommended cap for the next nap, given today's total so far. Rounded to nearest 5. */
function computeNapCap(ageDays: number, totalNapMinutesToday: number): number {
  const budget = getDayNapBudget(ageDays);
  const maxSingle = getMaxSingleNapMinutes(ageDays);
  const remaining = Math.max(budget - totalNapMinutesToday, 30);
  const cap = roundToNearest5(Math.min(maxSingle, remaining));
  return cap;
}

// ─── Time parsing ───────────────────────────────────────────────

/**
 * Parse time string from edge function (e.g. "05:30 PM", "9:00 AM", "17:30") into
 * a Date on the same calendar day as refDate.
 */
function parseRecommendedTime(timeStr: string, refDate: Date): Date {
  if (!timeStr || typeof timeStr !== 'string') return refDate;
  const trimmed = timeStr.trim();
  const amPm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (amPm) {
    let h = parseInt(amPm[1], 10);
    const m = parseInt(amPm[2], 10);
    if (amPm[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (amPm[3].toUpperCase() === 'AM' && h === 12) h = 0;
    let d = new Date(refDate);
    d = setHours(d, h);
    d = setMinutes(d, m);
    d = setSeconds(d, 0);
    d = setMilliseconds(d, 0);
    return d;
  }
  const twentyFour = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    const h = parseInt(twentyFour[1], 10);
    const m = parseInt(twentyFour[2], 10);
    let d = new Date(refDate);
    d = setHours(d, h);
    d = setMinutes(d, m);
    d = setSeconds(d, 0);
    d = setMilliseconds(d, 0);
    return d;
  }
  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return refDate;
}

// ─── Nighttime check ────────────────────────────────────────────

/** Hour (0–23). Wakes at or after this are treated as "up for the day" and get a nap recommendation. */
const MORNING_CUTOFF_HOUR = 4;
const NIGHT_START_HOUR = 19;

/**
 * True if the baby is in "nighttime mode" — we should NOT show a nap recommendation.
 * Wakes from 4:00 AM onward are treated as up for the day (early wake) and get a first-nap recommendation.
 * Only suppresses when the last session was night sleep (not a late nap ending at 7pm).
 */
export function isNighttimeWake(lastWakeTime: Date, lastSessionType?: 'nap' | 'night'): boolean {
  const hour = lastWakeTime.getHours();
  const isNightHours = hour >= NIGHT_START_HOUR || hour < MORNING_CUTOFF_HOUR;
  if (!isNightHours) return false;
  if (lastSessionType === 'nap') return false;
  return true;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Fetch an AI-powered nap recommendation.
 * Tries the Supabase edge function first, falls back to local heuristics.
 * The result is always normalized so wake windows, caps, and schedules are consistent.
 */
export async function getNextNapRecommendation(
  baby: Baby,
  events: SleepEvent[],
  now: Date = new Date(),
  memories?: string[]
): Promise<AIRecommendation> {
  try {
    const remote = await fetchRemoteRecommendation(baby, events, now, memories);
    if (remote) return remote;
  } catch (err) {
    if (isPremiumAccessRequiredError(err)) throw err;
    console.warn('[recommendations] Remote fetch failed, using local:', err);
  }
  return getLocalNapRecommendation(baby, events, now);
}

// ─── Remote (LLM) recommendation ───────────────────────────────

async function fetchRemoteRecommendation(
  baby: Baby,
  events: SleepEvent[],
  now: Date,
  memories?: string[]
): Promise<AIRecommendation | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const ageDays = calculateAgeDays(baby.birthdate);
  const endedEvents = events
    .filter((e) => e.end != null)
    .sort((a, b) => new Date(b.end!).getTime() - new Date(a.end!).getTime());
  const lastWakeTime = endedEvents.length > 0 ? endedEvents[0].end : null;

  const sleepHistory = endedEvents
    .slice(0, 20)
    .map((e) => ({
      type: e.type,
      start_time: e.start,
      end_time: e.end,
      duration_minutes: e.durationMinutes,
    }));

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54421';
  const res = await fetch(`${supabaseUrl}/functions/v1/chatgpt-sleep-coach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      baby_id: baby.id,
      mode: 'next_sleep',
      sleep_history: sleepHistory,
      baby_age_days: ageDays,
      current_time: now.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      last_wake_time: lastWakeTime,
      baby_name: baby.name,
      user_preferences: {
        bedtime_type: baby.preferences.bedtimeType ?? undefined,
        bedtime_target_time: baby.preferences.bedtimeTargetTime ?? undefined,
        last_wake_window_minutes: baby.preferences.lastWakeWindowMinutes ?? undefined,
        target_nap_count: baby.preferences.targetNapCount ?? undefined,
      },
      memories: memories && memories.length > 0 ? memories : undefined,
    }),
  });

  if (!res.ok) {
    const premiumError = await getPremiumAccessErrorFromResponse(res, 'recommendations');
    if (premiumError) throw premiumError;
    return null;
  }

  const data = await res.json();
  const nextSleep = data?.next_sleep;
  if (!nextSleep) return null;

  const recTime = parseRecommendedTime(nextSleep.recommended_time ?? '', now);

  // Validate: recommendation time must be reasonable
  const minsFromNow = (recTime.getTime() - now.getTime()) / 60000;
  if (minsFromNow < -30 || minsFromNow > 720) {
    console.warn('[recommendations] LLM time out of range:', nextSleep.recommended_time);
    return null;
  }

  // Compute the ACTUAL implied wake window from the recommendation
  const lastWake = lastWakeTime ? new Date(lastWakeTime) : null;
  const impliedWakeWindowMin = lastWake
    ? Math.round((recTime.getTime() - lastWake.getTime()) / 60000)
    : null;

  // Get the age-appropriate wake window as reference
  const ageWakeWindow = getWakeWindowForAge(ageDays);

  // Use the implied wake window (what the rec actually means), bounded to reasonable range
  let effectiveWakeWindow: number;
  if (impliedWakeWindowMin != null && impliedWakeWindowMin >= 30 && impliedWakeWindowMin <= 360) {
    effectiveWakeWindow = impliedWakeWindowMin;
  } else if (nextSleep.wake_window_minutes != null && Number.isFinite(nextSleep.wake_window_minutes) &&
             nextSleep.wake_window_minutes >= 30 && nextSleep.wake_window_minutes <= 360) {
    effectiveWakeWindow = nextSleep.wake_window_minutes;
  } else {
    effectiveWakeWindow = ageWakeWindow;
  }

  // Validate the cap — trust LLM when it provides one, fall back to local heuristic
  const todayNaps = events.filter(
    (e) => e.type === 'nap' && e.end != null && new Date(e.start).toDateString() === now.toDateString()
  );
  const totalNapMinutes = todayNaps.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
  const localCap = computeNapCap(ageDays, totalNapMinutes);

  let cap: number;
  if (nextSleep.should_cap_nap === false || nextSleep.cap_at_minutes == null) {
    // LLM says don't cap — use expected duration or a generous default
    cap = nextSleep.expected_duration_minutes ?? localCap;
  } else {
    cap = nextSleep.cap_at_minutes;
  }
  // Sanity bounds only — don't override LLM judgment
  if (cap < 15 || cap > 180) {
    cap = localCap;
  }
  cap = roundToNearest5(cap);

  // Parse and validate bedtime
  let expectedBedtimeDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 30);
  if (baby.preferences.bedtimeType === 'target' && baby.preferences.bedtimeTargetTime) {
    const [h, m] = baby.preferences.bedtimeTargetTime.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      expectedBedtimeDate.setHours(h, m, 0, 0);
    }
  }
  // Check if LLM returned a bedtime in schedule
  const bedtimeEvent = Array.isArray(nextSleep.rest_of_day_schedule)
    ? nextSleep.rest_of_day_schedule.find((e: { event?: string }) => e.event === 'bedtime')
    : undefined;
  if (bedtimeEvent?.time) {
    const parsedBedtime = parseRecommendedTime(String(bedtimeEvent.time), now);
    if (!Number.isNaN(parsedBedtime.getTime())) expectedBedtimeDate = parsedBedtime;
  }
  if (expectedBedtimeDate.getTime() < now.getTime()) {
    expectedBedtimeDate.setDate(expectedBedtimeDate.getDate() + 1);
  }

  // Validate and normalize the schedule
  const rawSchedule: RestOfDayScheduleEvent[] = Array.isArray(nextSleep.rest_of_day_schedule)
    ? nextSleep.rest_of_day_schedule
        .filter((e: any) => e && typeof e === 'object' && typeof e.time === 'string' && typeof e.label === 'string')
        .map((e: any) => ({
          time: String(e.time).trim(),
          event: typeof e.event === 'string' ? e.event : 'nap_start',
          label: String(e.label).trim(),
          note: typeof e.note === 'string' ? e.note.trim() : undefined,
          cap_minutes: typeof e.cap_minutes === 'number' && e.cap_minutes > 0 ? roundToNearest5(e.cap_minutes) : undefined,
          wake_window_minutes: typeof e.wake_window_minutes === 'number' && e.wake_window_minutes > 0 ? e.wake_window_minutes : undefined,
        }))
    : [];

  // Validate schedule: check that events have reasonable gaps
  const schedule = validateAndFixSchedule(
    rawSchedule,
    recTime,
    cap,
    effectiveWakeWindow,
    baby.preferences,
    expectedBedtimeDate,
    todayNaps.length,
    ageDays,
    now,
    events
  );

  // First nap of the day: if the schedule says nap 1 at a specific time (e.g. 7:20), use that
  // for the displayed window instead of "now" when the LLM recommended_time is too soon.
  let windowStart = recTime;
  if (todayNaps.length === 0 && rawSchedule.length > 0) {
    const firstNapStart = rawSchedule.find((e: { event?: string }) => e.event === 'nap_start');
    if (firstNapStart?.time) {
      const scheduleNapTime = parseRecommendedTime(String(firstNapStart.time), now);
      const scheduleMinsFromNow = (scheduleNapTime.getTime() - now.getTime()) / 60000;
      const recMinsFromNow = (recTime.getTime() - now.getTime()) / 60000;
      // If schedule has nap start 20+ min in future and LLM said "now/soon" (within 30 min), prefer schedule time
      if (scheduleMinsFromNow >= 20 && recMinsFromNow < 30 && !Number.isNaN(scheduleNapTime.getTime())) {
        windowStart = scheduleNapTime;
      }
    }
  }

  windowStart = roundDateToNearest5Minutes(windowStart);
  const roundedBedtime = roundDateToNearest5Minutes(expectedBedtimeDate);
  const scheduleRounded: RestOfDayScheduleEvent[] = schedule.map((e: RestOfDayScheduleEvent) => ({
    ...e,
    time: format(roundDateToNearest5Minutes(parseRecommendedTime(e.time, now)), 'h:mm a'),
  }));

  const payload: NapRecommendationPayload = {
    startWindowBegin: windowStart.toISOString(),
    startWindowEnd: addMinutes(windowStart, 15).toISOString(),
    recommendedCapMinutes: cap,
    shouldCapNap: nextSleep.should_cap_nap !== false,
    expectedBedtime: roundedBedtime.toISOString(),
    explanation: nextSleep.summary ?? null,
    reasoning: nextSleep.reasoning ?? null,
    restOfDaySchedule: scheduleRounded.length > 0 ? scheduleRounded : undefined,
    recommendedWakeWindowMinutes: effectiveWakeWindow,
  };

  const confidenceMap: Record<string, 'low' | 'medium' | 'high'> = {
    now: 'high',
    soon: 'high',
    upcoming: 'medium',
    not_yet: 'low',
  };

  const minutesSinceWake = lastWake ? (recTime.getTime() - lastWake.getTime()) / 60000 : Infinity;
  const isBedtime =
    nextSleep.sleep_type === 'bedtime' && (minutesSinceWake > 120 || !lastWake);

  return {
    id: `rec_remote_${Date.now()}`,
    babyId: baby.id,
    createdAt: now.toISOString(),
    type: isBedtime ? 'bedtime' : 'next_nap',
    payload,
    confidence: confidenceMap[nextSleep.urgency] || 'medium',
  };
}

/**
 * Validate a schedule from LLM. If events are too close together (no wake window gap),
 * rebuild the schedule locally using the core rec data.
 */
function validateAndFixSchedule(
  rawSchedule: RestOfDayScheduleEvent[],
  recTime: Date,
  capMinutes: number,
  wakeWindowMin: number,
  prefs: Baby['preferences'],
  bedtime: Date,
  napsCompletedToday: number,
  ageDays: number,
  now: Date,
  events: SleepEvent[] = []
): RestOfDayScheduleEvent[] {
  if (rawSchedule.length === 0) {
    // No schedule from LLM — build locally
    return buildLocalSchedule(recTime, capMinutes, wakeWindowMin, prefs, bedtime, napsCompletedToday, ageDays, now, events);
  }

  // Parse all schedule times and check gaps
  const parsed: { event: RestOfDayScheduleEvent; date: Date }[] = rawSchedule.map((e) => ({
    event: e,
    date: parseRecommendedTime(e.time, now),
  }));

  // Check: is there a gap of at least (wakeWindowMin * 0.5) between nap_end and next nap_start?
  const minGapMinutes = Math.max(wakeWindowMin * 0.5, 45); // at least 45 min or half wake window
  let isValid = true;

  for (let i = 0; i < parsed.length - 1; i++) {
    const curr = parsed[i];
    const next = parsed[i + 1];

    if (curr.event.event === 'nap_end' && next.event.event === 'nap_start') {
      const gapMin = (next.date.getTime() - curr.date.getTime()) / 60000;
      if (gapMin < minGapMinutes) {
        console.warn(`[recommendations] Schedule gap too small: ${gapMin}m between ${curr.event.time} and ${next.event.time} (need ${minGapMinutes}m)`);
        isValid = false;
        break;
      }
    }

    // Check chronological order
    if (next.date.getTime() <= curr.date.getTime()) {
      console.warn('[recommendations] Schedule not chronological');
      isValid = false;
      break;
    }
  }

  if (isValid) return rawSchedule;

  // Rebuild locally
  return buildLocalSchedule(recTime, capMinutes, wakeWindowMin, prefs, bedtime, napsCompletedToday, ageDays, now, events);
}

// ─── Local (heuristic) recommendation ───────────────────────────

const LAST_WINDOW_AFTER_HOUR = 16;

export function getLocalNapRecommendation(
  baby: Baby,
  events: SleepEvent[],
  now: Date = new Date()
): AIRecommendation {
  const ageDays = calculateAgeDays(baby.birthdate);
  const prefs = baby.preferences;

  const endedEvents = events
    .filter((e) => e.end != null)
    .sort((a, b) => new Date(b.end!).getTime() - new Date(a.end!).getTime());

  // Compute bedtime first
  const bedtimeEstimate = new Date(now);
  if (prefs.bedtimeType === 'target' && prefs.bedtimeTargetTime) {
    const [h, m] = prefs.bedtimeTargetTime.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      bedtimeEstimate.setHours(h, m, 0, 0);
    } else {
      bedtimeEstimate.setHours(19, 30, 0, 0);
    }
  } else {
    bedtimeEstimate.setHours(19, 30, 0, 0);
  }
  if (bedtimeEstimate.getTime() < now.getTime()) {
    bedtimeEstimate.setDate(bedtimeEstimate.getDate() + 1);
  }

  const minutesUntilBedtime = (bedtimeEstimate.getTime() - now.getTime()) / 60000;

  // Today's nap stats (computed early — needed for nap position)
  const todayNaps = events.filter(
    (e) => e.type === 'nap' && e.end != null && new Date(e.start).toDateString() === now.toDateString()
  );
  const totalNapMinutes = todayNaps.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);

  // Nap position: which nap number would the next nap be?
  const napPosition = todayNaps.length + 1;

  // Adaptive wake windows based on this baby's observed history for this nap position.
  // Falls back to age-based when fewer than 3 historical data points exist.
  const standardWakeWindow = getAdaptiveWakeWindowMinutes(events, ageDays, napPosition, prefs, false);
  const lastWakeWindow = getAdaptiveWakeWindowMinutes(events, ageDays, napPosition, prefs, true);

  const lastWakeTime = endedEvents.length > 0
    ? new Date(endedEvents[0].end!)
    : new Date(now.getTime() - standardWakeWindow * 60 * 1000);

  const awakeMinutes = Math.round((now.getTime() - lastWakeTime.getTime()) / 60000);

  let capMinutes = computeNapCap(ageDays, totalNapMinutes);
  capMinutes = roundToNearest5(capMinutes);

  // Determine target nap count for today, adapting to observed reality.
  // If baby has been consistently taking fewer naps than age-typical, use observed count.
  const { typical: typicalNapCount } = getRecommendedNapCountForAge(ageDays);
  const observedNapCount = getObservedDailyNapCount(events);
  const targetNapCount =
    observedNapCount != null && observedNapCount < typicalNapCount
      ? observedNapCount
      : typicalNapCount;

  // If baby has already hit the target nap count, treat this as a bedtime scenario
  const napBudgetExhausted = todayNaps.length >= targetNapCount;

  // Decide nap vs bedtime:
  // Bedtime if not enough time for a full nap + last wake window, or nap budget is exhausted
  const minNapDuration = 30;
  const timeNeededForNapPlusBedtime = minNapDuration + lastWakeWindow;
  const isLastWakeWindowBeforeBed = now.getHours() >= LAST_WINDOW_AFTER_HOUR;
  const isBedtimeScenario =
    napBudgetExhausted ||
    minutesUntilBedtime <= timeNeededForNapPlusBedtime ||
    (isLastWakeWindowBeforeBed && minutesUntilBedtime <= lastWakeWindow * 1.3);

  const wakeWindowMin = isBedtimeScenario ? lastWakeWindow : standardWakeWindow;
  const minutesUntilNap = Math.max(wakeWindowMin - awakeMinutes, 0);
  const windowStart = addMinutes(now, minutesUntilNap);

  const confidence: 'low' | 'medium' | 'high' =
    awakeMinutes > wakeWindowMin * 0.8
      ? 'high'
      : awakeMinutes > wakeWindowMin * 0.5
      ? 'medium'
      : 'low';

  // Explanation
  const windowLabel =
    isBedtimeScenario && prefs.lastWakeWindowMinutes != null
      ? `your ${formatDuration(wakeWindowMin)} last wake window`
      : `a ${formatDuration(wakeWindowMin)} wake window`;

  let explanation: string;
  let reasoning: string;

  if (isBedtimeScenario) {
    const napBudgetReason = napBudgetExhausted
      ? `Today's ${todayNaps.length} nap(s) match the target of ${targetNapCount} for the day.`
      : todayNaps.length > 0
        ? `Today's ${todayNaps.length} nap(s) total ${formatDuration(totalNapMinutes)}. Not enough time for another nap before bedtime.`
        : `No naps logged today. Based on the current time, bedtime is the next recommended sleep.`;
    explanation = `Based on ${windowLabel}, bedtime is recommended around ${format(windowStart, 'h:mm a')}. Target bedtime: ${format(bedtimeEstimate, 'h:mm a')}.`;
    reasoning = napBudgetReason;
  } else {
    explanation =
      awakeMinutes >= wakeWindowMin
        ? `Based on ${windowLabel}, baby has been awake long enough. This nap helps protect a ${format(bedtimeEstimate, 'h:mm a')} bedtime.`
        : `Baby has been awake ${formatDuration(awakeMinutes)}; the suggested wake window is ${formatDuration(wakeWindowMin)}. Next nap keeps the day on track for bedtime around ${format(bedtimeEstimate, 'h:mm a')}.`;
    reasoning = todayNaps.length > 0
      ? `Today's ${todayNaps.length} nap(s) total ${formatDuration(totalNapMinutes)} so far. Cap at ${formatDuration(capMinutes)} to preserve nighttime sleep.`
      : `First nap of the day. Cap at ${formatDuration(capMinutes)} so later naps and bedtime stay consistent.`;
  }

  // Build schedule
  const scheduleStart = isBedtimeScenario ? null : windowStart;
  const scheduleCap = isBedtimeScenario ? null : capMinutes;
  const restOfDaySchedule = buildLocalSchedule(
    scheduleStart, scheduleCap, wakeWindowMin, prefs, bedtimeEstimate,
    todayNaps.length, ageDays, now, events, targetNapCount
  );

  // For bedtime scenario, the "window" is the bedtime itself
  const recStart = roundDateToNearest5Minutes(
    isBedtimeScenario
      ? addMinutes(now, Math.max(lastWakeWindow - awakeMinutes, 0))
      : windowStart
  );
  const recEnd = addMinutes(recStart, 15);
  const roundedBedtime = roundDateToNearest5Minutes(bedtimeEstimate);

  const payload: NapRecommendationPayload = {
    startWindowBegin: recStart.toISOString(),
    startWindowEnd: recEnd.toISOString(),
    recommendedCapMinutes: capMinutes,
    expectedBedtime: roundedBedtime.toISOString(),
    explanation,
    reasoning,
    restOfDaySchedule: restOfDaySchedule.length > 0 ? restOfDaySchedule : undefined,
    recommendedWakeWindowMinutes: wakeWindowMin,
  };

  return {
    id: `rec_local_${Date.now()}`,
    babyId: baby.id,
    createdAt: now.toISOString(),
    type: isBedtimeScenario ? 'bedtime' : 'next_nap',
    payload,
    confidence,
  };
}

// ─── Schedule builder ───────────────────────────────────────────

/**
 * Build a rest-of-day schedule with adaptive wake windows per nap position.
 * Uses this baby's observed historical wake windows (blended with age baseline) for each gap,
 * so the schedule adapts to the baby's actual patterns rather than a single age-average WW.
 *
 * @param maxTotalNaps - Cap on total naps for the day (from observed daily nap count or age-typical).
 *                       Prevents over-scheduling when baby has already transitioned to fewer naps.
 */
function buildLocalSchedule(
  nextNapStart: Date | null,
  napCapMinutes: number | null,
  firstNapWakeWindow: number,
  prefs: Baby['preferences'],
  bedtime: Date,
  napsCompletedToday: number,
  ageDays: number,
  now: Date,
  events: SleepEvent[] = [],
  maxTotalNaps = 6
): RestOfDayScheduleEvent[] {
  const schedule: RestOfDayScheduleEvent[] = [];
  const lastWakeWindow = getAdaptiveWakeWindowMinutes(events, ageDays, maxTotalNaps, prefs, true);

  // If bedtime scenario (no more naps), just show bedtime
  if (!nextNapStart || !napCapMinutes) {
    schedule.push({
      time: format(roundDateToNearest5Minutes(bedtime), 'h:mm a'),
      event: 'bedtime',
      label: 'Bedtime',
    });
    return schedule;
  }

  let napNum = napsCompletedToday + 1;
  let currentNapStart = nextNapStart;
  // WW before the first scheduled nap is already decided (passed in)
  let currentWakeWindow = firstNapWakeWindow;
  const minNapDuration = 30;

  // Safety: max 6 naps to prevent infinite loop; also respect the daily nap target
  const maxNapsToSchedule = Math.max(0, maxTotalNaps - napsCompletedToday);

  for (let i = 0; i < Math.min(6, maxNapsToSchedule); i++) {
    if (currentNapStart.getTime() >= bedtime.getTime()) break;

    const napEnd = addMinutes(currentNapStart, napCapMinutes);
    const timeAfterNapToBed = (bedtime.getTime() - napEnd.getTime()) / 60000;

    // WW from this nap to the next is adaptive for position (napsCompletedToday + i + 1)
    const napPosition = napsCompletedToday + i + 1;
    const nextWakeWindow = getAdaptiveWakeWindowMinutes(events, ageDays, napPosition, prefs, false);

    // Can we fit another nap after this one?
    // Need: inter-nap WW + min nap duration + last WW before bedtime
    const hasTimeForAnotherNap =
      i + 1 < maxNapsToSchedule &&
      timeAfterNapToBed > (nextWakeWindow + minNapDuration + lastWakeWindow);

    schedule.push({
      time: format(roundDateToNearest5Minutes(currentNapStart), 'h:mm a'),
      event: 'nap_start',
      label: `Nap ${napNum} start`,
    });
    schedule.push({
      time: format(roundDateToNearest5Minutes(napEnd), 'h:mm a'),
      event: 'nap_end',
      label: `Nap ${napNum} end`,
      note: `Wake after ${formatDuration(napCapMinutes)}`,
    });

    napNum++;

    if (!hasTimeForAnotherNap) break;

    currentWakeWindow = nextWakeWindow;
    currentNapStart = addMinutes(napEnd, currentWakeWindow);
  }

  // Always end with bedtime
  schedule.push({
    time: format(roundDateToNearest5Minutes(bedtime), 'h:mm a'),
    event: 'bedtime',
    label: 'Bedtime',
  });

  return schedule;
}

// ─── Active nap helpers ─────────────────────────────────────────

export function shouldCapNap(
  baby: Baby,
  events: SleepEvent[],
  activeNap: SleepEvent,
  now: Date = new Date()
): { capAt: string; reason: string } | null {
  const ageDays = calculateAgeDays(baby.birthdate);
  const napStart = new Date(activeNap.start);
  const elapsed = Math.round((now.getTime() - napStart.getTime()) / 60000);

  const todayNaps = events.filter(
    (e) => e.type === 'nap' && e.end != null && new Date(e.start).toDateString() === now.toDateString()
  );
  const totalPriorNap = todayNaps.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
  const cap = computeNapCap(ageDays, totalPriorNap);

  if (elapsed >= cap) {
    return {
      capAt: addMinutes(napStart, cap).toISOString(),
      reason: `Nap budget reached (${formatDuration(cap)}). Capping to protect bedtime.`,
    };
  }

  return null;
}

export function getSuggestedNapCap(
  baby: Baby,
  events: SleepEvent[],
  activeNap: SleepEvent,
  now: Date = new Date()
): { capAt: string; reason: string; explanation: string } | null {
  if (activeNap.type !== 'nap') return null;

  const ageDays = calculateAgeDays(baby.birthdate);
  const napStart = new Date(activeNap.start);
  const todayNaps = events.filter(
    (e) => e.type === 'nap' && e.end != null && new Date(e.start).toDateString() === now.toDateString()
  );
  const totalPriorNap = todayNaps.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);

  const budget = getDayNapBudget(ageDays);
  const cap = computeNapCap(ageDays, totalPriorNap);
  const capAt = addMinutes(napStart, cap);

  const reason = `Consider waking by ${format(capAt, 'h:mm a')} (${formatDuration(cap)} nap) to protect bedtime.`;
  const explanation = todayNaps.length > 0
    ? `Today's ${todayNaps.length} nap(s) total ${formatDuration(totalPriorNap)} so far. Day budget is ~${formatDuration(budget)}; capping at ${formatDuration(cap)} keeps bedtime on track.`
    : `First nap of the day. Cap at ${formatDuration(cap)} so later naps and bedtime stay consistent.`;

  return { capAt: capAt.toISOString(), reason, explanation };
}

export function formatRecommendationWindow(
  payload: NapRecommendationPayload
): string {
  const start = format(new Date(payload.startWindowBegin), 'h:mm a');
  const end = format(new Date(payload.startWindowEnd), 'h:mm a');
  return `${start} – ${end}`;
}
