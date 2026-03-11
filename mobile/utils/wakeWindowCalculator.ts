import type { BabyPreferences } from '@/types/domain';

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
  const now = new Date();
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

