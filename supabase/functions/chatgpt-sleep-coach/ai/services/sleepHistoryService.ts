import type { SleepSession } from '../types/sessions.ts';
import { NIGHT_SEGMENT_GAP_MS, toLocalDateKey } from '../utils/sleepMath.ts';

export interface DayNapSummary {
  dateKey: string;
  napCount: number;
  totalNapMinutes: number;
  lastNapEnd: string | null;
}

export interface RecentHistoryPack {
  days: number;
  sessions: SleepSession[];
  napSummaries: DayNapSummary[];
  /** 0–1 false start heuristic rate over recent nights with data */
  recentFalseStartRate: number | null;
  /** 0–1 early wake heuristic rate */
  recentEarlyWakeRate: number | null;
}

export function getRecentSleepHistory(
  childId: string,
  sleepData: SleepSession[],
  anchorIso: string,
  timezone: string,
  days: 7 | 14 = 7,
): RecentHistoryPack {
  void childId;
  const cutoff = new Date(anchorIso).getTime() - days * 86400000;
  const sessions = sleepData.filter((s) => new Date(s.start_time).getTime() >= cutoff);

  const napSummaries = buildDayNapSummaries(sessions, timezone);
  const { falseStartRate, earlyWakeRate } = computeNightPatternRates(sessions, anchorIso, timezone);

  return {
    days,
    sessions,
    napSummaries,
    recentFalseStartRate: falseStartRate,
    recentEarlyWakeRate: earlyWakeRate,
  };
}

function buildDayNapSummaries(sessions: SleepSession[], timezone: string): DayNapSummary[] {
  const naps = sessions.filter((s) => s.type === 'nap' && s.end_time);
  const byDay: Record<string, SleepSession[]> = {};
  for (const n of naps) {
    const k = toLocalDateKey(n.start_time, timezone);
    byDay[k] = byDay[k] || [];
    byDay[k].push(n);
  }
  return Object.entries(byDay).map(([dateKey, arr]) => {
    const total = arr.reduce((s, x) => s + (x.duration_minutes ?? 0), 0);
    const last = arr.reduce((a, b) =>
      new Date(a.end_time!).getTime() > new Date(b.end_time!).getTime() ? a : b
    );
    return { dateKey, napCount: arr.length, totalNapMinutes: total, lastNapEnd: last.end_time };
  }).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/**
 * False start: first night segment < 3h then awake gap < 90m then sleep again (same local night run).
 * Early wake: night ends before 6am local and total night < 9h.
 * TODO(product): align precisely with app’s night scoring.
 */
function computeNightPatternRates(
  sessions: SleepSession[],
  anchorIso: string,
  timezone: string,
): { falseStartRate: number | null; earlyWakeRate: number | null } {
  const nights = [...sessions]
    .filter((s) => s.type === 'night' && s.end_time && (s.duration_minutes ?? 0) > 0)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  if (nights.length === 0) return { falseStartRate: null, earlyWakeRate: null };

  const runs = chunkNightRuns(nights);
  let falseStarts = 0;
  let earlyWakes = 0;
  let scored = 0;

  for (const run of runs) {
    if (run.length === 0) continue;
    scored++;
    const firstDur = run[0].duration_minutes ?? 0;
    if (run.length >= 2 && firstDur < 180) {
      const gap = (new Date(run[1].start_time).getTime() - new Date(run[0].end_time!).getTime()) / 60000;
      if (gap >= 20 && gap < 90) falseStarts++;
    }
    const lastSeg = run[run.length - 1];
    const end = new Date(lastSeg.end_time!);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(end);
    const eh = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
    const em = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
    const endMin = eh * 60 + em;
    let total = 0;
    for (const s of run) total += s.duration_minutes ?? 0;
    if (endMin < 6 * 60 && total < 540) earlyWakes++;
  }

  return {
    falseStartRate: scored > 0 ? falseStarts / scored : null,
    earlyWakeRate: scored > 0 ? earlyWakes / scored : null,
  };
}

export function chunkNightRuns(sorted: SleepSession[]): SleepSession[][] {
  const runs: SleepSession[][] = [];
  let run: SleepSession[] = [];
  for (const s of sorted) {
    if (run.length === 0) {
      run = [s];
      continue;
    }
    const prev = run[run.length - 1];
    const gap = new Date(s.start_time).getTime() - new Date(prev.end_time!).getTime();
    if (gap >= 0 && gap <= NIGHT_SEGMENT_GAP_MS) run.push(s);
    else {
      runs.push(run);
      run = [s];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

/**
 * Schedule consistency: inverse stdev of bedtime start times over the last 7 days.
 * Lower stdev = higher consistency. Capped at 0–1.
 */
export function scheduleConsistencyScore(
  sleepData: SleepSession[],
  anchorIso: string,
  timezone: string,
): number | null {
  const now = new Date(anchorIso).getTime();
  const bedtimeClockMinutes: number[] = [];

  for (let d = 0; d < 7; d++) {
    const dayIso = new Date(now - d * 86400000).toISOString();
    const dayKey = toLocalDateKey(dayIso, timezone);

    // Find the first night-start on this local date (the bedtime)
    const nightsStartingThisDay = sleepData.filter(
      (s) => s.type === 'night' && toLocalDateKey(s.start_time, timezone) === dayKey,
    );
    if (nightsStartingThisDay.length === 0) continue;

    // Earliest night start that day is typically bedtime
    const earliest = nightsStartingThisDay.reduce((a, b) =>
      new Date(a.start_time).getTime() < new Date(b.start_time).getTime() ? a : b
    );
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(earliest.start_time));
    const h = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
    bedtimeClockMinutes.push(h * 60 + m);
  }

  if (bedtimeClockMinutes.length < 3) return null;
  const mean = bedtimeClockMinutes.reduce((a, b) => a + b, 0) / bedtimeClockMinutes.length;
  const variance = bedtimeClockMinutes.reduce((s, x) => s + (x - mean) ** 2, 0) / bedtimeClockMinutes.length;
  const stdev = Math.sqrt(variance);
  return Math.max(0, Math.min(1, 1 - stdev / 180));
}
