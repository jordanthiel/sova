/**
 * Parse sleep data from CSV export (e.g. Huckleberry / generic format).
 * Expected columns: Type, Start, End, Duration, Start Condition, Start Location, End Condition, Notes
 * We only import rows where Type === "Sleep".
 * Shared with Edge Function import-sleep-email (Deno).
 * When timezone is provided (e.g. "America/New_York"), CSV datetimes are interpreted as local time in that zone and converted to UTC.
 */

import { DateTime } from 'npm:luxon@3';

export interface ParsedSleepRow {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  type: 'nap' | 'night';
  notes: string | null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === ',') {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseDurationToMinutes(dur: string): number {
  const trimmed = (dur || '').trim();
  const match = trimmed.match(/^(?:(\d+):)?(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return 0;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const mins = match[2] ? parseInt(match[2], 10) : 0;
  const secs = match[3] ? parseInt(match[3], 10) : 0;
  return hours * 60 + mins + Math.round(secs / 60);
}

/** Parse datetime string. If timezone is set, treat as local time in that IANA zone and return UTC Date; else use new Date(s) (server local). */
function parseDateTime(str: string, timezone?: string | null): Date | null {
  const s = (str || '').trim();
  if (!s) return null;
  if (timezone) {
    let dt = DateTime.fromFormat(s, 'yyyy-MM-dd HH:mm', { zone: timezone });
    if (!dt.isValid) {
      dt = DateTime.fromFormat(s.replace(' ', 'T'), "yyyy-MM-dd'T'HH:mm", { zone: timezone });
    }
    if (!dt.isValid) {
      dt = DateTime.fromISO(s.replace(' ', 'T'), { zone: timezone });
    }
    if (!dt.isValid) return null;
    return dt.toJSDate();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Classify as nap vs night: daytime = start after 6:30 AM and before 5:30 PM; daytime + duration < 5h → nap; else night. If timezone given, use local time in that zone. */
function classifySleepType(start: Date, durationMinutes: number, timezone?: string | null): 'nap' | 'night' {
  let hour: number;
  let minute: number;
  if (timezone) {
    const dt = DateTime.fromJSDate(start, { zone: timezone });
    hour = dt.hour;
    minute = dt.minute;
  } else {
    hour = start.getHours();
    minute = start.getMinutes();
  }
  const atOrAfter630 = hour > 6 || (hour === 6 && minute >= 30);
  const before530 = hour < 17 || (hour === 17 && minute < 30);
  const isDaytime = atOrAfter630 && before530;
  const underFiveHours = durationMinutes < 5 * 60;
  if (isDaytime && underFiveHours) return 'nap';
  return 'night';
}

export interface ParseSleepCsvResult {
  rows: ParsedSleepRow[];
  skipped: number;
  errors: string[];
}

/**
 * Parse CSV text and return sleep rows only.
 * Skips non-Sleep types and rows with invalid/missing Start or End.
 * @param csvText - Raw CSV content
 * @param timezone - Optional IANA timezone (e.g. America/New_York). If set, Start/End are interpreted as local time in this zone and converted to UTC for storage.
 */
export function parseSleepCsv(csvText: string, timezone?: string | null): ParseSleepCsvResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  const rows: ParsedSleepRow[] = [];
  const errors: string[] = [];
  let skipped = 0;

  const headerCols = lines[0] ? parseCsvLine(lines[0]).map((c) => c.toLowerCase()) : [];
  const col = (name: string, fallback: number) => {
    const i = headerCols.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const typeIdx = col('type', 0);
  const startIdx = col('start', 1);
  const endIdx = col('end', 2);
  const durationIdx = col('duration', 3);
  const notesIdx = headerCols.length > 7 ? 7 : col('notes', 7);

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const type = (cols[typeIdx] ?? '').trim();
    if (type.toLowerCase() !== 'sleep') {
      skipped++;
      continue;
    }

    const startStr = cols[startIdx] ?? '';
    const endStr = cols[endIdx] ?? '';
    const start = parseDateTime(startStr, timezone);
    const end = parseDateTime(endStr, timezone);

    if (!start) {
      errors.push(`Row ${i + 1}: invalid Start "${startStr}"`);
      skipped++;
      continue;
    }
    if (!end) {
      errors.push(`Row ${i + 1}: invalid End "${endStr}" (skipped)`);
      skipped++;
      continue;
    }
    if (end.getTime() < start.getTime()) {
      errors.push(`Row ${i + 1}: End before Start (skipped)`);
      skipped++;
      continue;
    }

    const durationStr = cols[durationIdx] ?? '';
    let durationMinutes = parseDurationToMinutes(durationStr);
    if (durationMinutes <= 0) {
      durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    }
    const notes = (cols[notesIdx] ?? '').trim() || null;
    const sleepType = classifySleepType(start, durationMinutes, timezone);

    rows.push({
      startTime: start,
      endTime: end,
      durationMinutes,
      type: sleepType,
      notes,
    });
  }

  return { rows, skipped, errors };
}
