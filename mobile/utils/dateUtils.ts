import { getAppNow } from '@/lib/appClock';
import { addDays, format, parse } from 'date-fns';

/** Local hour (0–23) when the extended “day” rolls over (e.g. 7 = 7am–7am). */
export const EXTENDED_DAY_START_HOUR = 7;

/**
 * Extended "day" is 7am–7am (e.g. "today" = 7am today through 7am tomorrow).
 * Used consistently for daily stats, averages, and logs.
 */

/** Start of extended day on the given calendar date (local time). */
export function getDayStart6am(date: Date): Date {
  const d = new Date(date);
  d.setHours(EXTENDED_DAY_START_HOUR, 0, 0, 0);
  return d;
}

/** Start of the next extended day after the given calendar date. */
export function getDayEnd6am(date: Date): Date {
  return addDays(getDayStart6am(date), 1);
}

/** Bounds for the extended day for the given calendar date: [start, end). */
export function getExtendedDayBounds(date: Date): { start: Date; end: Date } {
  const start = getDayStart6am(date);
  const end = getDayEnd6am(date);
  return { start, end };
}

/**
 * Extended day key (yyyy-MM-dd) for a timestamp.
 * Times before 7am on a calendar day belong to the previous calendar day's extended day.
 */
export function getExtendedDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const boundary = new Date(y, m, d, EXTENDED_DAY_START_HOUR, 0, 0, 0);
  if (date.getTime() < boundary.getTime()) {
    const prev = new Date(y, m, d - 1);
    return format(prev, 'yyyy-MM-dd');
  }
  return format(date, 'yyyy-MM-dd');
}

/** Local midnight on the calendar day that anchors the extended day containing `from` (for pickers / selected-day state). */
export function getExtendedDayCalendarDate(from: Date): Date {
  const key = getExtendedDayKey(from);
  return parse(key, 'yyyy-MM-dd', from);
}

/** True if a session [start, end] overlaps the extended day [dayStart6am, dayEnd6am). */
export function sessionOverlapsExtendedDay(
  sessionStart: Date | string,
  sessionEnd: Date | string | null,
  dayStart: Date,
  dayEnd: Date
): boolean {
  const st = typeof sessionStart === 'string' ? new Date(sessionStart) : sessionStart;
  const et = sessionEnd
    ? typeof sessionEnd === 'string'
      ? new Date(sessionEnd)
      : sessionEnd
    : getAppNow();
  return st.getTime() < dayEnd.getTime() && et.getTime() > dayStart.getTime();
}
