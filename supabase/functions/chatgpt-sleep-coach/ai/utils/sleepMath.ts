import type { SleepSession } from '../types/sessions.ts';

export const NIGHT_SEGMENT_GAP_MS = 2 * 60 * 60 * 1000;

export function startOfDayInTimezone(refTime: Date | string, timezone: string): Date {
  const d = typeof refTime === 'string' ? new Date(refTime) : refTime;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)!.value, 10);
  const offsetFromMidnight =
    (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000 + d.getMilliseconds();
  return new Date(d.getTime() - offsetFromMidnight);
}

export function toLocalDateKey(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function dateKeyMinusOne(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function getUtcOffsetMinutesAt(anchorIso: string, timezone: string): number {
  const nowDate = new Date(anchorIso);
  const tzParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(nowDate);
  const localHour = parseInt(tzParts.find((p) => p.type === 'hour')!.value, 10);
  const localMin = parseInt(tzParts.find((p) => p.type === 'minute')!.value, 10);
  return localHour * 60 + localMin - (nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes());
}

/** Parse "h:mm AM/PM" on the same local calendar day as anchorIso (timezone). Returns epoch ms UTC. */
export function parseAmPmOnLocalCalendarDay(
  timeStr: string,
  anchorIso: string,
  timezone: string,
): number | null {
  const trimmed = String(timeStr).trim().replace(/\s*\(.*\)\s*$/, '');
  const amPmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!amPmMatch) return null;
  let h = parseInt(amPmMatch[1], 10);
  const m = parseInt(amPmMatch[2], 10);
  if (amPmMatch[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (amPmMatch[3].toUpperCase() === 'AM' && h === 12) h = 0;
  const nowDate = new Date(anchorIso);
  const utcOffsetMin = getUtcOffsetMinutesAt(anchorIso, timezone);
  return new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), h, m, 0).getTime() -
    utcOffsetMin * 60000;
}

export function formatLocalTime(isoMs: number, timezone: string): string {
  return new Date(isoMs).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  });
}

export function roundToNearestMinutes(ms: number, stepMin: number): number {
  const step = stepMin * 60000;
  return Math.round(ms / step) * step;
}

export function simpleNightScore(totalSleepMinutes: number, wakeupCount: number, totalAwakeMinutes: number): number {
  const durationPoints = Math.min(40, Math.max(0, ((totalSleepMinutes - 420) / 270) * 40));
  const wakeupPoints = Math.max(0, 35 - wakeupCount * 9);
  const awakePoints = Math.max(0, 25 - totalAwakeMinutes / 3);
  return Math.round(Math.min(100, Math.max(0, durationPoints + wakeupPoints + awakePoints)));
}

export function getLastNightTotalMinutes(sleepData: SleepSession[]): number | null {
  const nightSessions = sleepData
    .filter((s) => s.type === 'night' && s.end_time != null && (s.duration_minutes ?? 0) > 0)
    .sort((a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime());
  if (nightSessions.length === 0) return null;
  let total = 0;
  let prevStart: number | null = null;
  for (const s of nightSessions) {
    const end = new Date(s.end_time!).getTime();
    const start = new Date(s.start_time).getTime();
    if (prevStart != null && prevStart - end > NIGHT_SEGMENT_GAP_MS) break;
    total += s.duration_minutes ?? 0;
    prevStart = start;
  }
  return total > 0 ? total : null;
}

export function inferTodayMorningWakeIso(
  sleepData: SleepSession[],
  currentTime: string,
  timezone: string,
): string | null {
  const nowMs = new Date(currentTime).getTime();
  const todayKey = toLocalDateKey(currentTime, timezone);
  const napsToday = sleepData
    .filter((s) => s.type === 'nap' && s.end_time != null && toLocalDateKey(s.start_time, timezone) === todayKey)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const firstNapStartMs = napsToday.length > 0 ? new Date(napsToday[0].start_time).getTime() : null;

  const nightsEndingToday = sleepData.filter((s) => {
    if (s.type !== 'night' || !s.end_time) return false;
    if (toLocalDateKey(s.end_time, timezone) !== todayKey) return false;
    const endMs = new Date(s.end_time).getTime();
    if (endMs > nowMs) return false;
    if (firstNapStartMs != null && endMs >= firstNapStartMs) return false;
    return true;
  });

  if (nightsEndingToday.length === 0) return null;

  const sorted = [...nightsEndingToday].sort(
    (a, b) => new Date(a.end_time!).getTime() - new Date(b.end_time!).getTime(),
  );
  const chain: SleepSession[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i];
    if (chain.length === 0) {
      chain.unshift(s);
      continue;
    }
    const prev = chain[0];
    const gap = new Date(prev.start_time).getTime() - new Date(s.end_time!).getTime();
    if (gap >= 0 && gap <= NIGHT_SEGMENT_GAP_MS) chain.unshift(s);
    else break;
  }
  return chain.length > 0 ? chain[chain.length - 1].end_time! : sorted[sorted.length - 1].end_time!;
}

/**
 * Morning wake for a completed local calendar day (no "now" cutoff — for historical analysis).
 */
export function inferMorningWakeIsoForLocalDate(
  sleepData: SleepSession[],
  dateKey: string,
  timezone: string,
): string | null {
  const napsOnDay = sleepData
    .filter((s) => s.type === 'nap' && s.end_time != null && toLocalDateKey(s.start_time, timezone) === dateKey)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const firstNapStartMs = napsOnDay.length > 0 ? new Date(napsOnDay[0].start_time).getTime() : null;

  const nightsEnding = sleepData.filter((s) => {
    if (s.type !== 'night' || !s.end_time) return false;
    if (toLocalDateKey(s.end_time, timezone) !== dateKey) return false;
    const endMs = new Date(s.end_time).getTime();
    if (firstNapStartMs != null && endMs >= firstNapStartMs) return false;
    return true;
  });

  if (nightsEnding.length === 0) return null;

  const sorted = [...nightsEnding].sort(
    (a, b) => new Date(a.end_time!).getTime() - new Date(b.end_time!).getTime(),
  );
  const chain: SleepSession[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i];
    if (chain.length === 0) {
      chain.unshift(s);
      continue;
    }
    const prev = chain[0];
    const gap = new Date(prev.start_time).getTime() - new Date(s.end_time!).getTime();
    if (gap >= 0 && gap <= NIGHT_SEGMENT_GAP_MS) chain.unshift(s);
    else break;
  }
  return chain.length > 0 ? chain[chain.length - 1].end_time! : sorted[sorted.length - 1].end_time!;
}

/** Sessions whose start is on local calendar day of `currentTime`. */
export function sessionsStartingToday(
  sleepData: SleepSession[],
  currentTime: string,
  timezone: string,
): SleepSession[] {
  const dayStart = startOfDayInTimezone(currentTime, timezone);
  return sleepData.filter((s) => new Date(s.start_time).getTime() >= dayStart.getTime());
}
