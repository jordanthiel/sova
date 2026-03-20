import { format } from 'date-fns';

/** Session shape used for night sleep scoring (sleep_sessions row or equivalent). */
export interface NightScoreSession {
  type: 'nap' | 'night';
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
}

/** Gap (ms) between night segments to treat as same night. */
const NIGHT_SEGMENT_GAP_MS = 2 * 60 * 60 * 1000;
/** Small tolerance so parsing/skew doesn't split one night (1 min). */
const GAP_TOLERANCE_MS = 60 * 1000;

/** Compute duration in minutes from start/end times, falling back to stored duration_minutes. */
function effectiveDuration(s: NightScoreSession): number {
  if (s.end_time) {
    const ms = new Date(s.end_time).getTime() - new Date(s.start_time).getTime();
    if (ms > 0) return Math.round(ms / 60000);
  }
  return s.duration_minutes ?? 0;
}

/** 6am on the calendar day after dateKey (yyyy-MM-dd). Used to cap last segment so we don't count sleep past 6am toward that night. */
function get6amCutoffNextDay(dateKey: string): number {
  const d = new Date(dateKey + 'T06:00:00');
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Duration in minutes for a segment, capped at capEndMs so we don't count sleep past 6am toward that night's total. */
function effectiveDurationCappedAt(s: NightScoreSession, capEndMs: number): number {
  if (!s.end_time) return s.duration_minutes ?? 0;
  const startMs = new Date(s.start_time).getTime();
  const endMs = new Date(s.end_time).getTime();
  if (startMs >= capEndMs) return 0;
  if (endMs <= capEndMs) return Math.round((endMs - startMs) / 60000);
  return Math.round((capEndMs - startMs) / 60000);
}

/** Include naps that connect to the run (within 2h) so evening/mislabeled segments count as one night. */
function expandRunWithConnectingNaps(
  run: NightScoreSession[],
  naps: NightScoreSession[]
): NightScoreSession[] {
  if (naps.length === 0) return run;
  const runStart = new Date(run[0].start_time).getTime();
  const runEnd = new Date(run[run.length - 1].end_time!).getTime();
  const used = new Set<string>();
  const added: NightScoreSession[] = [];

  for (const nap of naps) {
    const nStart = new Date(nap.start_time).getTime();
    const nEnd = new Date(nap.end_time!).getTime();
    const key = `${nap.start_time}-${nap.end_time}`;
    if (used.has(key)) continue;

    // Nap ends within 2h before first night segment (evening nap flowing into night)
    if (nEnd <= runStart && runStart - nEnd <= NIGHT_SEGMENT_GAP_MS) {
      used.add(key);
      added.push(nap);
      continue;
    }
    // Nap starts within 2h after last night segment (early morning segment typed as nap)
    if (nStart >= runEnd && nStart - runEnd <= NIGHT_SEGMENT_GAP_MS) {
      used.add(key);
      added.push(nap);
      continue;
    }
    // Nap sits between two night segments (both gaps <= 2h)
    for (let i = 0; i < run.length - 1; i++) {
      const segEnd = new Date(run[i].end_time!).getTime();
      const nextStart = new Date(run[i + 1].start_time).getTime();
      if (nStart >= segEnd && nEnd <= nextStart &&
          nStart - segEnd <= NIGHT_SEGMENT_GAP_MS &&
          nextStart - nEnd <= NIGHT_SEGMENT_GAP_MS) {
        used.add(key);
        added.push(nap);
        break;
      }
    }
  }

  if (added.length === 0) return run;
  const combined = [...run, ...added].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  return combined;
}

export interface NightSummary {
  /** Extended day key (yyyy-MM-dd) for the night that *ends* in the morning of this date. */
  dateKey: string;
  /** Total sleep minutes across all segments of this night. */
  totalSleepMinutes: number;
  /** Number of wakeups (gaps between night segments). */
  wakeupCount: number;
  /** Total minutes awake during the night (sum of gaps between segments). */
  totalAwakeMinutes: number;
  /** Number of night segments (wakeupCount + 1 when segments > 0). */
  segmentCount: number;
  /** ISO timestamp of the last segment's end time — used to determine if night is complete. */
  lastSegmentEndTime: string;
}

/**
 * A night is considered complete once it is past 6am the morning after the extended day.
 * dateKey is the extended day (6am–6am), so 6am the next calendar day marks the boundary.
 */
export function isNightComplete(summary: NightSummary, now?: Date): boolean {
  const refMs = (now ?? new Date()).getTime();
  const nextDay = new Date(summary.dateKey + 'T06:00:00');
  nextDay.setDate(nextDay.getDate() + 1);
  return refMs >= nextDay.getTime();
}

/**
 * Groups night sessions into runs (gap < 2h = same night), then assigns each run
 * to the calendar date of the run's *first* segment start (shifted back 6h). This
 * means a night beginning at 8pm on March 17 always gets dateKey 'March 17',
 * regardless of whether the baby wakes at 5am or 8am the next morning, so
 * isNightComplete (6am on dateKey+1 day) fires at the right time.
 * Includes any nap that connects to the run (within 2h) so evening naps or
 * mislabeled segments are counted as one night and wakeup count is correct.
 */
export function getNightSummaries(
  sessions: NightScoreSession[],
  options?: { maxNights?: number }
): NightSummary[] {
  const nights = sessions.filter(
    (s) => s.type === 'night' && s.end_time != null && effectiveDuration(s) > 0
  );
  if (nights.length === 0) return [];

  const naps = sessions.filter(
    (s) => s.type === 'nap' && s.end_time != null && effectiveDuration(s) > 0
  );

  const sorted = [...nights].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  // Build runs: consecutive segments with gap <= 2h (one continuous night)
  const allRuns: typeof sorted[] = [];
  let run: typeof sorted = [];

  for (const s of sorted) {
    const start = new Date(s.start_time).getTime();
    if (run.length === 0) {
      run = [s];
      continue;
    }
    const prevEnd = new Date(run[run.length - 1].end_time!).getTime();
    const gapMs = start - prevEnd;
    if (gapMs <= NIGHT_SEGMENT_GAP_MS + GAP_TOLERANCE_MS) {
      run.push(s);
      continue;
    }
    allRuns.push(expandRunWithConnectingNaps(run, naps));
    run = [s];
  }
  if (run.length > 0) allRuns.push(expandRunWithConnectingNaps(run, naps));

  // Assign each run to the calendar date when the night *started* (evening).
  // Shift the first segment's start back 6h so that any night beginning before
  // 6am (e.g. 1am, 3am, or even 5:59am) is bucketed into the previous calendar
  // day — the day whose evening the baby fell asleep. This keeps the dateKey
  // stable regardless of what time the baby wakes up in the morning, fixing the
  // bug where a baby waking after 6am would get dateKey = today and not appear
  // as a completed night until 6am the following day.
  const byDateKey = new Map<string, typeof allRuns>();
  for (const runSegs of allRuns) {
    const firstStart = new Date(runSegs[0].start_time);
    const shifted = new Date(firstStart.getTime() - 6 * 60 * 60 * 1000);
    const dateKey = format(shifted, 'yyyy-MM-dd');
    if (!byDateKey.has(dateKey)) byDateKey.set(dateKey, []);
    byDateKey.get(dateKey)!.push(runSegs);
  }

  const result: NightSummary[] = [];
  const keys = Array.from(byDateKey.keys()).sort();

  for (const dateKey of keys) {
    const runs = byDateKey.get(dateKey)!;
    const mergedSummary = mergeRunsIntoOneNight(runs, dateKey);
    result.push(mergedSummary);
  }

  result.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const max = options?.maxNights ?? result.length;
  return result.slice(0, max);
}

/** Combine multiple runs (split by gap > 2h) into a single night: total sleep, total awake, wakeupCount = total segments - 1. */
function mergeRunsIntoOneNight(runs: NightScoreSession[][], dateKey: string): NightSummary {
  if (runs.length === 0) {
    return { dateKey, totalSleepMinutes: 0, wakeupCount: 0, totalAwakeMinutes: 0, segmentCount: 0, lastSegmentEndTime: '' };
  }
  if (runs.length === 1) return summarizeRun(runs[0], dateKey);

  let totalSleepMinutes = 0;
  let totalAwakeMinutes = 0;
  let segmentCount = 0;

  const cap6am = get6amCutoffNextDay(dateKey);
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];
    const isLastRun = r === runs.length - 1;
    for (let i = 0; i < run.length; i++) {
      const isLastSegment = isLastRun && i === run.length - 1;
      totalSleepMinutes += isLastSegment
        ? effectiveDurationCappedAt(run[i], cap6am)
        : effectiveDuration(run[i]);
      if (i > 0) {
        const prevEnd = new Date(run[i - 1].end_time!).getTime();
        const currStart = new Date(run[i].start_time).getTime();
        totalAwakeMinutes += Math.round((currStart - prevEnd) / 60000);
      }
      segmentCount += 1;
    }
    if (r > 0) {
      const prevRunEnd = new Date(runs[r - 1][runs[r - 1].length - 1].end_time!).getTime();
      const thisRunStart = new Date(run[0].start_time).getTime();
      totalAwakeMinutes += Math.round((thisRunStart - prevRunEnd) / 60000);
    }
  }

  const lastRun = runs[runs.length - 1];
  return {
    dateKey,
    totalSleepMinutes,
    wakeupCount: segmentCount - 1,
    totalAwakeMinutes,
    segmentCount,
    lastSegmentEndTime: lastRun[lastRun.length - 1].end_time!,
  };
}

function summarizeRun(segs: NightScoreSession[], dateKey: string): NightSummary {
  let totalSleep = 0;
  let totalAwake = 0;
  const cap6am = get6amCutoffNextDay(dateKey);
  for (let i = 0; i < segs.length; i++) {
    const isLast = i === segs.length - 1;
    totalSleep += isLast
      ? effectiveDurationCappedAt(segs[i], cap6am)
      : effectiveDuration(segs[i]);
    if (i > 0) {
      const prevEnd = new Date(segs[i - 1].end_time!).getTime();
      const currStart = new Date(segs[i].start_time).getTime();
      totalAwake += Math.round((currStart - prevEnd) / 60000);
    }
  }
  return {
    dateKey,
    totalSleepMinutes: totalSleep,
    wakeupCount: segs.length - 1,
    totalAwakeMinutes: totalAwake,
    segmentCount: segs.length,
    lastSegmentEndTime: segs[segs.length - 1].end_time!,
  };
}

/**
 * Computes a 0–100 night sleep score from total sleep, wakeups, and awake time.
 *
 * Target scores for typical nights:
 *   0 wakeups, 11h sleep          → ~95–100
 *   1 wakeup,  10h sleep, 10m aw  → ~80
 *   2 wakeups, 10h sleep, 25m aw  → ~60
 *   3 wakeups,  9h sleep, 40m aw  → ~40–45
 *   4 wakeups,  9h sleep, 60m aw  → ~25–30
 *   5+ wakeups, 7h sleep          → ~10–15
 *
 * Components:
 * - Duration   (0-40): 7h = 0, 11.5h = 40 (linear)
 * - Wakeups    (0-35): 0 = 35, −9 per wakeup (most impactful factor)
 * - Awake time (0-25): 0 min = 25, −1 per 3 min awake
 */
export function computeNightSleepScore(summary: NightSummary): number {
  const sleepMin = summary.totalSleepMinutes;
  const wakeups = summary.wakeupCount;
  const awakeMin = summary.totalAwakeMinutes;

  // Duration: 420 min (7h) = 0 pts, 690 min (11.5h) = 40 pts
  const durationPoints = Math.min(40, Math.max(0, ((sleepMin - 420) / 270) * 40));

  // Wakeups: heaviest penalty — each wakeup costs 9 points
  const wakeupPoints = Math.max(0, 35 - wakeups * 9);

  // Awake time: 0 min = 25, loses 1 point per 3 min awake
  const awakePoints = Math.max(0, 25 - awakeMin / 3);

  const raw = durationPoints + wakeupPoints + awakePoints;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export interface NightSleepScoreResult {
  score: number;
  totalSleepMinutes: number;
  wakeupCount: number;
  totalAwakeMinutes: number;
  dateKey: string;
  label: string;
}

/**
 * Returns the most recent night's sleep score, or null if no completed night.
 */
export function getLastNightScore(
  sessions: NightScoreSession[]
): NightSleepScoreResult | null {
  const summaries = getNightSummaries(sessions, { maxNights: 1 });
  if (summaries.length === 0) return null;
  const s = summaries[0];
  const score = computeNightSleepScore(s);
  const label = formatNightLabel(s.dateKey);
  return {
    score,
    totalSleepMinutes: s.totalSleepMinutes,
    wakeupCount: s.wakeupCount,
    totalAwakeMinutes: s.totalAwakeMinutes,
    dateKey: s.dateKey,
    label,
  };
}

function formatNightLabel(dateKey: string): string {
  // dateKey uses the extended day (6am–6am), so it's the calendar date
  // the night *started* on. "Last night" = yesterday's dateKey.
  const d = new Date(dateKey + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diff <= 1) return 'Last night';
  if (diff === 2) return '2 nights ago';
  return `${diff} nights ago`;
}
