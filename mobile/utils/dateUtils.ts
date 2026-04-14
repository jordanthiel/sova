import { getAppNow } from '@/lib/appClock';
import { addDays, format, parse } from 'date-fns';

/**
 * Extended "day" is 6am–6am (e.g. "today" = 6am today through 6am tomorrow).
 * Used consistently for daily stats, averages, and logs.
 */

/** 6am on the given calendar date (local time). */
export function getDayStart6am(date: Date): Date {
  const d = new Date(date);
  d.setHours(6, 0, 0, 0);
  return d;
}

/** 6am on the day after the given calendar date (start of next extended day). */
export function getDayEnd6am(date: Date): Date {
  return addDays(getDayStart6am(date), 1);
}

/** Bounds for the extended day that contains the given calendar date: [6am, 6am next day). */
export function getExtendedDayBounds(date: Date): { start: Date; end: Date } {
  const start = getDayStart6am(date);
  const end = getDayEnd6am(date);
  return { start, end };
}

/**
 * Extended day key (yyyy-MM-dd) for a timestamp.
 * Times before 6am on a calendar day belong to the previous calendar day's extended day.
 */
export function getExtendedDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const sixAm = new Date(y, m, d, 6, 0, 0, 0);
  if (date.getTime() < sixAm.getTime()) {
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
