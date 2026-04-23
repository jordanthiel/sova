/**
 * Central place for age- and product-tunable heuristics.
 * TODO(product): Move bands to remote config or per-family calibration.
 */

export function getWakeWindowBandsForAge(ageDays: number): { min: number; max: number; typical: number } {
  if (ageDays < 30) return { min: 45, max: 90, typical: 60 };
  if (ageDays < 60) return { min: 60, max: 120, typical: 90 };
  if (ageDays < 120) return { min: 75, max: 135, typical: 105 };
  if (ageDays < 180) return { min: 120, max: 150, typical: 135 };
  if (ageDays < 270) return { min: 135, max: 180, typical: 150 };
  if (ageDays < 365) return { min: 150, max: 210, typical: 180 };
  return { min: 180, max: 300, typical: 240 };
}

export function getNapCountExpectationForAge(ageDays: number): { min: number; max: number; typical: number } {
  if (ageDays < 120) return { min: 3, max: 5, typical: 4 };
  if (ageDays < 180) return { min: 2, max: 4, typical: 3 };
  if (ageDays < 270) return { min: 2, max: 3, typical: 2 };
  if (ageDays < 450) return { min: 1, max: 2, typical: 2 };
  return { min: 1, max: 1, typical: 1 };
}

/** Total daytime nap budget (completed + ongoing), minutes. */
export function getDaytimeNapBudgetMinutes(ageDays: number): number {
  if (ageDays < 120) return 210;
  if (ageDays < 270) return 180;
  if (ageDays < 365) return 150;
  return 120;
}

/** Single-nap ceiling before rules tighten (not the only cap driver). */
export function getMaxSingleNapMinutesByAge(ageDays: number): number {
  if (ageDays < 120) return 120;
  if (ageDays < 270) return 90;
  if (ageDays < 365) return 75;
  return 60;
}

export function earliestReasonableBedtimeClockMinutes(ageDays: number): number {
  if (ageDays < 120) return 17 * 60 + 30;
  if (ageDays < 365) return 18 * 60;
  return 18 * 60 + 30;
}

export interface NapCapRuleInput {
  ageDays: number;
  napOrdinal: number;
  napsPlannedToday: number;
  totalDaytimeSleepBeforeThisNapMinutes: number;
  currentNapElapsedMinutes: number;
  daytimeBudgetMinutes: number;
  /** 0–1 higher = need more recovery sleep today */
  recoveryPressure: number;
  /** 0–1 higher = protect bedtime */
  bedtimeProtectionPressure: number;
  preferLongerNaps?: boolean;
  preferEarlierBedtime?: boolean;
}

/**
 * Derive soft/hard cap offsets (minutes from nap start) and human-facing reason codes.
 * Returns durations from nap start for preferred, soft, hard wake targets.
 */
export function computeNapCapDurations(input: NapCapRuleInput): {
  preferredCapMinutes: number;
  softCapMinutes: number;
  hardCapMinutes: number;
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];
  const maxSingle = getMaxSingleNapMinutesByAge(input.ageDays);
  const remainingBudget = Math.max(0, input.daytimeBudgetMinutes - input.totalDaytimeSleepBeforeThisNapMinutes);

  // Base: min remaining budget chunk, single-nap max, ordinal shortening
  let ordinalMax = maxSingle;
  if (input.napOrdinal >= 3) {
    ordinalMax = Math.min(ordinalMax, 75);
    reasonCodes.push('later_nap_shorter_cap');
  }
  if (input.napsPlannedToday <= 2 && input.napOrdinal >= 2) {
    ordinalMax = Math.min(ordinalMax, 105);
  }

  // Recovery day: allow more if recovery pressure high and bedtime pressure moderate
  let recoveryBoost = 0;
  if (input.recoveryPressure > 0.55 && input.bedtimeProtectionPressure < 0.75) {
    recoveryBoost = 15;
    reasonCodes.push('recovery_day_more_rest');
  }

  let preferredCap = Math.min(ordinalMax, remainingBudget + input.currentNapElapsedMinutes, maxSingle + recoveryBoost);
  preferredCap = Math.max(20, Math.round(preferredCap / 5) * 5);

  // Soft = a bit more room; hard = don't exceed without likely bedtime cost
  const stretch =
    input.preferLongerNaps && input.bedtimeProtectionPressure < 0.55 ? 15 : 10;
  let softCap = Math.min(preferredCap + stretch, remainingBudget + input.currentNapElapsedMinutes + 10, maxSingle + 25);
  softCap = Math.max(preferredCap, Math.round(softCap / 5) * 5);

  let hardCap = softCap;
  if (input.bedtimeProtectionPressure > 0.65) {
    hardCap = Math.min(hardCap + 10, softCap + 20);
    reasonCodes.push('protect_bedtime');
  } else {
    hardCap = softCap + 15;
  }
  hardCap = Math.max(softCap, Math.round(hardCap / 5) * 5);

  if (input.preferEarlierBedtime) {
    preferredCap = Math.max(20, preferredCap - 10);
    softCap = Math.max(preferredCap + 5, softCap - 10);
    hardCap = Math.max(softCap, hardCap - 5);
    reasonCodes.push('parent_pref_earlier_bedtime');
  }

  if (remainingBudget < 45) {
    reasonCodes.push('tight_daytime_budget');
    preferredCap = Math.min(preferredCap, input.currentNapElapsedMinutes + Math.max(remainingBudget, 25));
    softCap = Math.min(softCap, preferredCap + 10);
    hardCap = Math.min(hardCap, softCap + 15);
  }

  // Caps must never be lower than the elapsed nap time (can't un-sleep)
  const elapsed = input.currentNapElapsedMinutes;
  if (elapsed > 0) {
    preferredCap = Math.max(preferredCap, elapsed);
    softCap = Math.max(softCap, elapsed);
    hardCap = Math.max(hardCap, elapsed);
  }

  // Final rounding pass
  preferredCap = Math.round(preferredCap / 5) * 5;
  softCap = Math.round(softCap / 5) * 5;
  hardCap = Math.round(hardCap / 5) * 5;

  // Enforce ordering after all adjustments
  softCap = Math.max(softCap, preferredCap);
  hardCap = Math.max(hardCap, softCap);

  return { preferredCapMinutes: preferredCap, softCapMinutes: softCap, hardCapMinutes: hardCap, reasonCodes };
}

/**
 * Heuristic: is a rescue catnap feasible, or should we skip to early bedtime?
 * Used for CATNAP_VS_EARLY_BEDTIME candidate scoring.
 */
export function catnapVsEarlyBedtimeScore(params: {
  ageDays: number;
  minutesUntilTargetBedtime: number;
  lastWakeWindowMinutes: number;
  daytimeSleepMinutes: number;
  napBudget: number;
  overtiredRisk: number;
  preferEarlierBedtime: boolean;
}): { catnapScore: number; earlyBedtimeScore: number; reasonCodes: string[] } {
  const reasons: string[] = [];
  const minCatnap = 15;
  const maxCatnap = 30;
  const minLastWw = Math.max(60, params.lastWakeWindowMinutes * 0.65);

  // Time available after a hypothetical catnap + last wake window
  const timeAfterCatnap = params.minutesUntilTargetBedtime - minCatnap - minLastWw;
  const catnappable = timeAfterCatnap >= 0 && params.daytimeSleepMinutes < params.napBudget - 10;

  let catnapScore = catnappable ? 0.55 : 0.25;
  let earlyBedtimeScore = 0.45;

  if (params.overtiredRisk > 0.55) {
    earlyBedtimeScore += 0.15;
    reasons.push('overtired_leans_early_bed');
  }
  if (params.minutesUntilTargetBedtime < minLastWw + minCatnap + 20) {
    earlyBedtimeScore += 0.18;
    reasons.push('not_enough_time_for_catnap');
  }
  if (params.preferEarlierBedtime) {
    earlyBedtimeScore += 0.1;
    reasons.push('parent_pref_earlier_bedtime');
  }
  if (catnappable && params.overtiredRisk < 0.3) {
    catnapScore += 0.12;
    reasons.push('low_overtired_supports_catnap');
  }

  return {
    catnapScore: Math.min(1, Math.max(0, catnapScore)),
    earlyBedtimeScore: Math.min(1, Math.max(0, earlyBedtimeScore)),
    reasonCodes: reasons,
  };
}
