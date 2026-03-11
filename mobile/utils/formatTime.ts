/**
 * Centralized time/duration formatting for the entire app.
 *
 * Rules:
 *  - >= 60 minutes → "1h 36m" (or "2h" if 0 remaining minutes)
 *  - < 60 minutes  → "45m"
 *  - 0 or negative → "0m"
 */

/** Round a number to the nearest 5 (e.g. 56 → 55, 58 → 60). */
export function roundToNearest5(n: number): number {
  if (!Number.isFinite(n)) return n;
  return Math.round(n / 5) * 5;
}

/** Round a date's time to the nearest 5 minutes (e.g. 9:48 → 9:50). Seconds and ms set to 0. */
export function roundDateToNearest5Minutes(d: Date): Date {
  const out = new Date(d);
  const m = out.getMinutes();
  const rounded = Math.round(m / 5) * 5;
  out.setMinutes(rounded === 60 ? 0 : rounded, 0, 0);
  if (rounded === 60) out.setHours(out.getHours() + 1, 0, 0, 0);
  return out;
}

/**
 * Parse a time string like "9:48 AM" or "7:20 AM", round to nearest 5 minutes, return formatted "9:50 AM".
 * Uses refDate for the calendar day when building the date.
 */
export function roundTimeStringToNearest5(timeStr: string, refDate: Date): string {
  const parsed = parseTimeStringToDate(timeStr, refDate);
  if (!parsed) return timeStr;
  const rounded = roundDateToNearest5Minutes(parsed);
  return rounded.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function parseTimeStringToDate(timeStr: string, refDate: Date): Date | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  const amPm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!amPm) return null;
  let h = parseInt(amPm[1], 10);
  const m = parseInt(amPm[2], 10);
  if (amPm[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (amPm[3].toUpperCase() === 'AM' && h === 12) h = 0;
  const d = new Date(refDate);
  d.setHours(h, m, 0, 0);
  return d;
}

export function formatDuration(minutes: number): string {
  const rounded = roundToNearest5(minutes);
  if (rounded <= 0) return '0m';
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Format a "time until" value.
 * Same h/m rules as formatDuration but reads naturally in context
 * ("1h 12m" or "45m").
 */
export function formatTimeUntil(minutes: number): string {
  if (minutes <= 0) return '0m';
  return formatDuration(minutes);
}
