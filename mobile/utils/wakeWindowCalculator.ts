import { getAppNow } from '@/lib/appClock';
import type { BabyPreferences, SleepEvent } from '@/types/domain';

/**
 * Calculate recommended wake window based on baby's age
 */
export function getWakeWindowForAge(ageDays: number): number {
  // Wake windows in minutes based on age
  if (ageDays < 7) {
    return 45; // Newborn: 45-60 minutes
  } else if (ageDays < 14) {
    return 60; // 1-2 weeks: 60-90 minutes
  } else if (ageDays < 30) {
    return 75; // 2-4 weeks: 75-90 minutes
  } else if (ageDays < 60) {
    return 90; // 1-2 months: 90-120 minutes
  } else if (ageDays < 90) {
    return 105; // 2-3 months: 90-120 minutes
  } else if (ageDays < 120) {
    return 120; // 3-4 months: 90-120 minutes
  } else if (ageDays < 180) {
    return 135; // 4-6 months: 2-2.5 hours
  } else if (ageDays < 270) {
    return 150; // 6-9 months: 2-3 hours
  } else if (ageDays < 365) {
    return 180; // 9-12 months: 2.5-3.5 hours
  } else {
    return 240; // 12+ months: 3-4 hours
  }
}

/**
 * Calculate when baby should go down for next nap based on last wake time
 */
export function calculateNextNapTime(lastWakeTime: Date, ageDays: number): Date {
  const wakeWindow = getWakeWindowForAge(ageDays);
  const nextNapTime = new Date(lastWakeTime);
  nextNapTime.setMinutes(nextNapTime.getMinutes() + wakeWindow);
  return nextNapTime;
}

/**
 * Calculate baby's age in days from birth date
 */
export function calculateAgeDays(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = getAppNow();
  const diffTime = Math.abs(now.getTime() - birth.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/** Recommended number of naps by age. Returns a range [min, max] for display (e.g. 6–9 mo: 2–3). */
export function getRecommendedNapCountForAge(ageDays: number): { min: number; max: number; typical: number } {
  if (ageDays < 120) return { min: 3, max: 5, typical: 4 };       // 0–4 mo: 3–5, typical 4
  if (ageDays < 180) return { min: 2, max: 4, typical: 3 };       // 4–6 mo: 2–4, typical 3
  if (ageDays < 270) return { min: 2, max: 3, typical: 2 };       // 6–9 mo: 2–3
  if (ageDays < 450) return { min: 1, max: 2, typical: 2 };       // 9–15 mo: 1–2
  return { min: 1, max: 1, typical: 1 };                          // 15+ mo: 1
}

/** Human-readable insight on when baby might be ready to drop a nap (e.g. 3→2 or 2→1). */
export function getNapTransitionInsight(
  ageDays: number,
  currentNapCount: number
): string | null {
  const { min, max, typical } = getRecommendedNapCountForAge(ageDays);
  if (currentNapCount <= typical) return null;
  if (currentNapCount === 3 && typical <= 2) {
    return 'Many babies drop to 2 naps between 6–9 months. Signs: fighting the 3rd nap, long last wake window, or late bedtime.';
  }
  if (currentNapCount === 2 && typical <= 1) {
    return 'Many babies drop to 1 nap between 12–18 months. Signs: refusing one nap, consolidating to one longer nap.';
  }
  if (currentNapCount === 4 && typical <= 3) {
    return 'Around 4–6 months, babies often consolidate to 3 naps. Watch for longer wake windows and easier scheduling.';
  }
  return null;
}

/**
 * Effective wake window to use: respects parent override for the last wake window before bed.
 * @param ageDays Baby age in days
 * @param preferences Baby preferences (may include lastWakeWindowMinutes from coach)
 * @param isLastWakeWindowBeforeBed True when the next sleep is the last nap before bed or bedtime
 */
export function getEffectiveWakeWindowMinutes(
  ageDays: number,
  preferences: BabyPreferences | null | undefined,
  isLastWakeWindowBeforeBed: boolean
): number {
  if (isLastWakeWindowBeforeBed && preferences?.lastWakeWindowMinutes != null) {
    return preferences.lastWakeWindowMinutes;
  }
  return getWakeWindowForAge(ageDays);
}

/** Median of a numeric array. Returns null if empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Extract observed wake windows (in minutes) after a specific nap-of-day position.
 * napPosition is 1-based: position 1 = gap between nap 1 end and nap 2 start.
 * Only looks at days where a next nap actually occurred after that position.
 */
export function getObservedWakeWindowsForPosition(
  events: SleepEvent[],
  napPosition: number,
  limitDays = 21
): number[] {
  const cutoff = getAppNow();
  cutoff.setDate(cutoff.getDate() - limitDays);

  // Group completed naps by calendar day
  const byDay: Record<string, SleepEvent[]> = {};
  for (const e of events) {
    if (e.type !== 'nap' || !e.end) continue;
    const startDate = new Date(e.start);
    if (startDate < cutoff) continue;
    const day = startDate.toDateString();
    (byDay[day] ??= []).push(e);
  }

  const windows: number[] = [];
  for (const dayNaps of Object.values(byDay)) {
    dayNaps.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const idx = napPosition - 1; // 0-based: nap at this index, wake window to nap at idx+1
    if (idx >= dayNaps.length - 1) continue; // no next nap existed that day
    const ww = Math.round(
      (new Date(dayNaps[idx + 1].start).getTime() - new Date(dayNaps[idx].end!).getTime()) / 60000
    );
    if (ww >= 20 && ww <= 360) windows.push(ww);
  }

  return windows;
}

/**
 * Adaptive wake window: blends this baby's observed historical WW for the given nap position
 * (60% observed median, 40% age baseline), bounded to 65–140% of age baseline.
 * Falls back to the age baseline when fewer than 3 historical data points exist.
 */
export function getAdaptiveWakeWindowMinutes(
  events: SleepEvent[],
  ageDays: number,
  napPosition: number,
  prefs: BabyPreferences | null | undefined,
  isLastBeforeBed: boolean
): number {
  const baseline = getEffectiveWakeWindowMinutes(ageDays, prefs, isLastBeforeBed);
  // If there's an explicit user preference for the last window, always trust it
  if (isLastBeforeBed && prefs?.lastWakeWindowMinutes != null) return baseline;

  const observed = getObservedWakeWindowsForPosition(events, napPosition, 21);
  if (observed.length < 3) return baseline;

  const med = median(observed)!;
  // 60% observed, 40% age-based — adapts to the baby while staying age-appropriate
  const blended = med * 0.6 + baseline * 0.4;
  return Math.round(Math.max(baseline * 0.65, Math.min(baseline * 1.4, blended)));
}

/**
 * Returns the observed median nap count per day from recent history.
 * Excludes today (incomplete data). Returns null when fewer than 5 complete days are available.
 * Useful for detecting when a baby has consistently dropped a nap before the age-typical transition.
 */
export function getObservedDailyNapCount(
  events: SleepEvent[],
  limitDays = 14
): number | null {
  const today = getAppNow().toDateString();
  const cutoff = getAppNow();
  cutoff.setDate(cutoff.getDate() - limitDays);

  const byDay: Record<string, number> = {};
  for (const e of events) {
    if (e.type !== 'nap' || !e.end) continue;
    const startDate = new Date(e.start);
    if (startDate < cutoff) continue;
    const day = startDate.toDateString();
    if (day === today) continue; // today is incomplete
    byDay[day] = (byDay[day] ?? 0) + 1;
  }

  const counts = Object.values(byDay);
  if (counts.length < 5) return null;
  return Math.round(median(counts) ?? 0);
}

