import type { SleepSession } from '../types/sessions.ts';
import {
  inferMorningWakeIsoForLocalDate,
  simpleNightScore,
  toLocalDateKey,
  NIGHT_SEGMENT_GAP_MS,
} from '../utils/sleepMath.ts';
import { getDaytimeNapBudgetMinutes } from '../sleepRules.ts';
import { chunkNightRuns } from './sleepHistoryService.ts';

export interface UsableDayMetrics {
  dateKey: string;
  recencyTier: 1 | 2 | 3;
  recencyWeight: number;
  wakeIso: string;
  bedtimeStartIso: string;
  napCount: number;
  totalDaySleepMinutes: number;
  wakeWindowsMinutes: number[];
  finalWakeWindowMinutes: number | null;
  bedtimeClockMinutes: number;
  nightSleepScore: number;
  falseStartNight: boolean;
  earlyWakeNight: boolean;
  compositeScore: number;
  overnightWakeSegments: number;
}

export interface PatternTrendBlock {
  wake_window_1_median: number | null;
  wake_window_2_median: number | null;
  wake_window_3_median: number | null;
  final_wake_window_median: number | null;
  bedtime_clock_median_minutes: number | null;
  nap_count_median: number | null;
  total_day_sleep_median: number | null;
  summaryLines: string[];
}

export interface SleepPatternAnalysis {
  windowDays: number;
  /** Sessions passed into analysis (client payload or DB fallback). */
  inputSessionCount: number;
  usableDays: UsableDayMetrics[];
  daysAnalyzed: number;
  topDays: UsableDayMetrics[];
  bottomDays: UsableDayMetrics[];
  bestDayTrends: PatternTrendBlock;
  worstDayTrends: PatternTrendBlock;
  keyThresholds: string[];
}

function recencyForIndex(i: number): { tier: 1 | 2 | 3; weight: number } {
  if (i < 7) return { tier: 1, weight: 1 };
  if (i < 14) return { tier: 2, weight: 0.6 };
  return { tier: 3, weight: 0.3 };
}

function clockMinutesFromIso(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
  return h * 60 + m;
}

/**
 * Bedtime night for schedule analysis: first completed night segment that starts after `afterMs`,
 * within `maxGapMs` (default 22h). This catches bedtimes logged just after local midnight on the
 * next calendar day, which `toLocalDateKey(start) === nap day` would miss.
 */
function firstBedtimeNightAfter(
  sleepData: SleepSession[],
  afterMs: number,
  maxGapMs: number = 28 * 60 * 60 * 1000,
): SleepSession | null {
  const nights = sleepData.filter((s) => {
    if (s.type !== 'night' || !s.end_time) return false;
    if ((s.duration_minutes ?? 0) <= 0) return false;
    const start = new Date(s.start_time).getTime();
    return start > afterMs && start <= afterMs + maxGapMs;
  });
  if (nights.length === 0) return null;
  return nights.reduce((a, b) =>
    new Date(a.start_time).getTime() < new Date(b.start_time).getTime() ? a : b
  );
}

function nightRunStartingWith(
  sleepData: SleepSession[],
  firstNight: SleepSession,
): SleepSession[] {
  const nights = [...sleepData]
    .filter((s) => s.type === 'night' && s.end_time && (s.duration_minutes ?? 0) > 0)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const idx = nights.findIndex((n) => n.start_time === firstNight.start_time);
  if (idx < 0) return [firstNight];

  const slice = nights.slice(idx);
  const runs = chunkNightRuns(slice);
  return runs[0] ?? [firstNight];
}

function scoreNightRun(run: SleepSession[], timezone: string): {
  nightSleepScore: number;
  falseStartNight: boolean;
  earlyWakeNight: boolean;
  overnightWakeSegments: number;
  totalSleep: number;
} {
  if (run.length === 0) {
    return { nightSleepScore: 40, falseStartNight: false, earlyWakeNight: false, overnightWakeSegments: 0, totalSleep: 0 };
  }
  let totalSleep = 0;
  let totalAwake = 0;
  for (let i = 0; i < run.length; i++) {
    totalSleep += run[i].duration_minutes ?? 0;
    if (i > 0) {
      const gap = (new Date(run[i].start_time).getTime() - new Date(run[i - 1].end_time!).getTime()) / 60000;
      if (gap > 0) totalAwake += gap;
    }
  }
  const overnightWakeSegments = Math.max(0, run.length - 1);
  let falseStartNight = false;
  if (run.length >= 2) {
    const firstDur = run[0].duration_minutes ?? 0;
    const gap = (new Date(run[1].start_time).getTime() - new Date(run[0].end_time!).getTime()) / 60000;
    if (firstDur < 180 && gap >= 20 && gap < 90) falseStartNight = true;
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
  const earlyWakeNight = endMin < 6 * 60 && totalSleep < 540;

  let nightSleepScore = simpleNightScore(totalSleep, overnightWakeSegments, totalAwake);
  if (falseStartNight) nightSleepScore -= 12;
  if (earlyWakeNight) nightSleepScore -= 10;
  nightSleepScore = Math.max(0, Math.min(100, nightSleepScore));

  return { nightSleepScore, falseStartNight, earlyWakeNight, overnightWakeSegments, totalSleep };
}

function buildDayMetrics(
  sleepData: SleepSession[],
  dateKey: string,
  timezone: string,
  ageDays: number,
  tier: 1 | 2 | 3,
  weight: number,
): UsableDayMetrics | null {
  const wakeIso = inferMorningWakeIsoForLocalDate(sleepData, dateKey, timezone);
  if (!wakeIso) return null;

  const wakeMs = new Date(wakeIso).getTime();
  const naps = sleepData
    .filter(
      (s) =>
        s.type === 'nap' &&
        s.end_time != null &&
        toLocalDateKey(s.start_time, timezone) === dateKey,
    )
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  let firstNight: SleepSession | null = null;
  if (naps.length > 0) {
    const lastNapEndMs = new Date(naps[naps.length - 1].end_time!).getTime();
    firstNight = firstBedtimeNightAfter(sleepData, lastNapEndMs);
  } else {
    firstNight = firstBedtimeNightAfter(sleepData, wakeMs + 25 * 60000, 18 * 60 * 60 * 1000);
  }
  if (!firstNight) return null;

  const bedMs = new Date(firstNight.start_time).getTime();
  if (bedMs <= wakeMs + 30 * 60000) return null;

  if (naps.length === 0) {
    const ww0 = Math.round((bedMs - wakeMs) / 60000);
    if (ww0 < 25 || ww0 > 720) return null;
    const run = nightRunStartingWith(sleepData, firstNight);
    const ns = scoreNightRun(run, timezone);
    const totalDaySleepMinutes = 0;
    const budget = getDaytimeNapBudgetMinutes(ageDays);
    let composite = ns.nightSleepScore;
    if (totalDaySleepMinutes > budget * 1.25) composite -= 8;

    return {
      dateKey,
      recencyTier: tier,
      recencyWeight: weight,
      wakeIso,
      bedtimeStartIso: firstNight.start_time,
      napCount: 0,
      totalDaySleepMinutes,
      wakeWindowsMinutes: [ww0],
      finalWakeWindowMinutes: ww0,
      bedtimeClockMinutes: clockMinutesFromIso(firstNight.start_time, timezone),
      nightSleepScore: ns.nightSleepScore,
      falseStartNight: ns.falseStartNight,
      earlyWakeNight: ns.earlyWakeNight,
      compositeScore: Math.max(0, Math.min(100, composite)),
      overnightWakeSegments: ns.overnightWakeSegments,
    };
  }

  const firstNapStart = new Date(naps[0].start_time).getTime();
  if (firstNapStart <= wakeMs) return null;

  const ww: number[] = [];
  ww.push(Math.round((firstNapStart - wakeMs) / 60000));
  for (let i = 1; i < naps.length; i++) {
    const prevEnd = new Date(naps[i - 1].end_time!).getTime();
    const curStart = new Date(naps[i].start_time).getTime();
    if (curStart <= prevEnd) return null;
    ww.push(Math.round((curStart - prevEnd) / 60000));
  }

  const lastNapEnd = new Date(naps[naps.length - 1].end_time!).getTime();
  if (bedMs <= lastNapEnd) return null;
  const finalWw = Math.round((bedMs - lastNapEnd) / 60000);
  if (finalWw < 20 || finalWw > 480) return null;

  for (const w of ww) {
    if (w < 20 || w > 480) return null;
  }

  const totalDaySleepMinutes = naps.reduce((s, n) => s + (n.duration_minutes ?? 0), 0);
  const run = nightRunStartingWith(sleepData, firstNight);
  const ns = scoreNightRun(run, timezone);

  const budget = getDaytimeNapBudgetMinutes(ageDays);
  let composite = ns.nightSleepScore * 0.55 + 35 * 0.25;
  const ratio = totalDaySleepMinutes / Math.max(budget, 1);
  if (ratio > 1.22) composite -= 10;
  if (ratio < 0.32 && naps.length >= 2) composite -= 6;
  if (ns.falseStartNight) composite -= 5;
  if (ns.earlyWakeNight) composite -= 4;

  composite = Math.max(0, Math.min(100, composite));

  return {
    dateKey,
    recencyTier: tier,
    recencyWeight: weight,
    wakeIso,
    bedtimeStartIso: firstNight.start_time,
    napCount: naps.length,
    totalDaySleepMinutes,
    wakeWindowsMinutes: ww,
    finalWakeWindowMinutes: finalWw,
    bedtimeClockMinutes: clockMinutesFromIso(firstNight.start_time, timezone),
    nightSleepScore: ns.nightSleepScore,
    falseStartNight: ns.falseStartNight,
    earlyWakeNight: ns.earlyWakeNight,
    compositeScore: composite,
    overnightWakeSegments: ns.overnightWakeSegments,
  };
}

function weightedMedian(values: number[], weights: number[]): number | null {
  if (values.length === 0) return null;
  const pairs = values.map((v, i) => ({ v, w: weights[i] ?? 0 })).filter((p) => p.w > 0);
  if (pairs.length === 0) return null;
  pairs.sort((a, b) => a.v - b.v);
  const totalW = pairs.reduce((s, p) => s + p.w, 0);
  let acc = 0;
  const half = totalW / 2;
  for (const p of pairs) {
    acc += p.w;
    if (acc >= half) return p.v;
  }
  return pairs[pairs.length - 1].v;
}

function median(values: (number | null)[]): number | null {
  const nums = values.filter((x): x is number => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function wMedianField(
  days: UsableDayMetrics[],
  pick: (d: UsableDayMetrics) => number | null | undefined,
): number | null {
  const vals: number[] = [];
  const wts: number[] = [];
  for (const d of days) {
    const v = pick(d);
    if (v != null && !Number.isNaN(v)) {
      vals.push(v);
      wts.push(d.recencyWeight);
    }
  }
  return weightedMedian(vals, wts);
}

function extractTrendBlock(days: UsableDayMetrics[], label: string): PatternTrendBlock {
  const weights = days.map((d) => d.recencyWeight);
  const lines: string[] = [];
  const m1 = wMedianField(days, (d) => d.wakeWindowsMinutes[0]);
  const m2 = wMedianField(days, (d) => d.wakeWindowsMinutes[1]);
  const m3 = wMedianField(days, (d) => d.wakeWindowsMinutes[2]);
  const mf = wMedianField(days, (d) => d.finalWakeWindowMinutes);

  const bedM = weightedMedian(days.map((d) => d.bedtimeClockMinutes), weights);
  const napMed = median(days.map((d) => d.napCount));
  const daySleepMed = weightedMedian(days.map((d) => d.totalDaySleepMinutes), weights);

  if (m1 != null) lines.push(`${label}: median wake window 1 ≈ ${m1} min (recency-weighted).`);
  if (m2 != null) lines.push(`${label}: median wake window 2 ≈ ${m2} min.`);
  if (m3 != null) lines.push(`${label}: median wake window 3 ≈ ${m3} min.`);
  if (mf != null) lines.push(`${label}: median final wake window ≈ ${mf} min.`);
  if (bedM != null) {
    const bh = Math.floor(bedM / 60);
    const bm = Math.round(bedM % 60);
    lines.push(`${label}: median bedtime start ≈ ${bh}:${bm.toString().padStart(2, '0')} (local).`);
  }
  if (napMed != null) lines.push(`${label}: median nap count ≈ ${napMed}.`);
  if (daySleepMed != null) lines.push(`${label}: median total daytime sleep ≈ ${Math.round(daySleepMed)} min.`);

  return {
    wake_window_1_median: m1,
    wake_window_2_median: m2,
    wake_window_3_median: m3,
    final_wake_window_median: mf,
    bedtime_clock_median_minutes: bedM,
    nap_count_median: napMed,
    total_day_sleep_median: daySleepMed,
    summaryLines: lines,
  };
}

function compareThresholds(best: PatternTrendBlock, worst: PatternTrendBlock): string[] {
  const out: string[] = [];
  const pairs: [string, number | null, number | null][] = [
    ['Wake window 1', best.wake_window_1_median, worst.wake_window_1_median],
    ['Wake window 2', best.wake_window_2_median, worst.wake_window_2_median],
    ['Wake window 3', best.wake_window_3_median, worst.wake_window_3_median],
    ['Final wake window', best.final_wake_window_median, worst.final_wake_window_median],
  ];
  for (const [name, b, w] of pairs) {
    if (b != null && w != null && w - b >= 25) {
      out.push(
        `On lower-scoring days, ${name} tended to run longer (~${w} min vs ~${b} min on stronger days) — avoid stretching into that zone when possible.`,
      );
    }
  }
  if (
    best.bedtime_clock_median_minutes != null &&
    worst.bedtime_clock_median_minutes != null &&
    Math.abs(worst.bedtime_clock_median_minutes - best.bedtime_clock_median_minutes) >= 35
  ) {
    out.push('Bedtime timing differed meaningfully between strongest and weakest logged days.');
  }
  if (out.length === 0) {
    out.push('Best vs worst days did not show a single dominant wake-window driver — use age bounds and today’s cues.');
  }
  return out;
}

/**
 * Spec: 30-day window, recency-weighted trend extraction, top/bottom day cohorts.
 */
export function analyzeSleepPatterns30d(
  sleepData: SleepSession[],
  anchorIso: string,
  timezone: string,
  ageDays: number,
): SleepPatternAnalysis {
  const now = new Date(anchorIso).getTime();
  const seen = new Set<string>();
  const dateKeys: string[] = [];
  for (let i = 0; i < 30; i++) {
    const k = toLocalDateKey(new Date(now - i * 86400000).toISOString(), timezone);
    if (!seen.has(k)) {
      seen.add(k);
      dateKeys.push(k);
    }
  }

  const usable: UsableDayMetrics[] = [];
  for (let i = 0; i < dateKeys.length; i++) {
    const { tier, weight } = recencyForIndex(i);
    const m = buildDayMetrics(sleepData, dateKeys[i], timezone, ageDays, tier, weight);
    if (m) usable.push(m);
  }

  const sorted = [...usable].sort((a, b) => b.compositeScore - a.compositeScore);
  const topCount = Math.min(5, sorted.length);
  const bottomCount = Math.min(5, sorted.length);
  const topDays = sorted.slice(0, topCount);
  const bottomDays = sorted.slice(-bottomCount).reverse();

  const bestDayTrends = topDays.length ? extractTrendBlock(topDays, 'Stronger-scoring days') : {
    wake_window_1_median: null,
    wake_window_2_median: null,
    wake_window_3_median: null,
    final_wake_window_median: null,
    bedtime_clock_median_minutes: null,
    nap_count_median: null,
    total_day_sleep_median: null,
    summaryLines: [],
  };
  const worstDayTrends = bottomDays.length ? extractTrendBlock(bottomDays, 'Weaker-scoring days') : {
    wake_window_1_median: null,
    wake_window_2_median: null,
    wake_window_3_median: null,
    final_wake_window_median: null,
    bedtime_clock_median_minutes: null,
    nap_count_median: null,
    total_day_sleep_median: null,
    summaryLines: [],
  };

  const keyThresholds = topDays.length && bottomDays.length
    ? compareThresholds(bestDayTrends, worstDayTrends)
    : ['Not enough contrasting days yet to infer thresholds — lean on age-based guardrails.'];

  return {
    windowDays: 30,
    inputSessionCount: sleepData.length,
    usableDays: usable,
    daysAnalyzed: usable.length,
    topDays,
    bottomDays,
    bestDayTrends,
    worstDayTrends,
    keyThresholds,
  };
}
