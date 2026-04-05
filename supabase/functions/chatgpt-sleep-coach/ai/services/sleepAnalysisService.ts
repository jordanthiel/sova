import type { ChildProfile } from '../types/aiRequest.ts';
import type { SleepFacts } from '../types/sleepFacts.ts';
import type { SleepSession } from '../types/sessions.ts';
import { getDaytimeNapBudgetMinutes, getNapCountExpectationForAge, getWakeWindowBandsForAge } from '../sleepRules.ts';
import {
  getLastNightTotalMinutes,
  getUtcOffsetMinutesAt,
  inferTodayMorningWakeIso,
  startOfDayInTimezone,
  sessionsStartingToday,
} from '../utils/sleepMath.ts';
import type { RecentHistoryPack } from './sleepHistoryService.ts';
import { scheduleConsistencyScore } from './sleepHistoryService.ts';

export function computeSleepFacts(
  profile: ChildProfile,
  sleepData: SleepSession[],
  recentPack: RecentHistoryPack,
  nowIso: string,
  lastWakeOverride: string | null,
): SleepFacts {
  const tz = profile.timezone;
  const ageDays = profile.ageDays;
  const nowMs = new Date(nowIso).getTime();
  const dayStart = startOfDayInTimezone(nowIso, tz);

  const todaySessions = sessionsStartingToday(sleepData, nowIso, tz);
  const ongoingNap = sleepData.find((s) => s.type === 'nap' && s.end_time === null);
  const ongoingNight = sleepData.find((s) => s.type === 'night' && s.end_time === null);

  const todayNapsAll = todaySessions.filter((s) => s.type === 'nap');
  const completedTodayNaps = todayNapsAll.filter((s) => s.end_time != null);
  let daytimeSleepMinutes = completedTodayNaps.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
  if (ongoingNap && new Date(ongoingNap.start_time).getTime() >= dayStart.getTime()) {
    daytimeSleepMinutes += Math.round((nowMs - new Date(ongoingNap.start_time).getTime()) / 60000);
  }

  const morningWake = inferTodayMorningWakeIso(sleepData, nowIso, tz);

  // lastWakeIso = last time baby actually woke from sleep (not nap start, not current moment)
  const latestCompletedNapEnd =
    completedTodayNaps.length > 0
      ? completedTodayNaps.reduce((a, b) =>
          new Date(a.end_time!).getTime() > new Date(b.end_time!).getTime() ? a : b
        ).end_time!
      : null;
  const lastWakeIso: string | null = lastWakeOverride ||
    latestCompletedNapEnd ||
    morningWake ||
    null;

  let currentWakeWindowMinutes: number | null = null;
  if (lastWakeIso) {
    if (ongoingNap) {
      // Baby is asleep — wake window = time from lastWake to when nap started
      currentWakeWindowMinutes = Math.max(
        0,
        Math.round((new Date(ongoingNap.start_time).getTime() - new Date(lastWakeIso).getTime()) / 60000),
      );
    } else if (ongoingNight) {
      // Baby is in night sleep — wake window = lastWake to night start
      currentWakeWindowMinutes = Math.max(
        0,
        Math.round((new Date(ongoingNight.start_time).getTime() - new Date(lastWakeIso).getTime()) / 60000),
      );
    } else {
      // Baby is awake — wake window = lastWake to now
      currentWakeWindowMinutes = Math.max(0, Math.round((nowMs - new Date(lastWakeIso).getTime()) / 60000));
    }
  }

  const napCountToday =
    completedTodayNaps.length +
    (ongoingNap && new Date(ongoingNap.start_time).getTime() >= dayStart.getTime() ? 1 : 0);

  let lastNapEndedAt: string | null = null;
  if (completedTodayNaps.length > 0) {
    lastNapEndedAt = completedTodayNaps.reduce((a, b) =>
      new Date(a.end_time!).getTime() > new Date(b.end_time!).getTime() ? a : b
    ).end_time!;
  }

  const ww = getWakeWindowBandsForAge(ageDays);
  const napBudget = getDaytimeNapBudgetMinutes(ageDays);
  const overtiredRisk = clamp01(
    currentWakeWindowMinutes != null
      ? (currentWakeWindowMinutes - ww.typical) / Math.max(ww.max - ww.typical, 45)
      : 0.2,
  );
  const undertiredRisk = clamp01(
    currentWakeWindowMinutes != null
      ? (ww.typical - currentWakeWindowMinutes) / Math.max(ww.typical - ww.min, 30)
      : 0.2,
  );

  const { startIso, endIso } = defaultBedtimeWindowIso(nowIso, profile, tz);
  const lastNight = getLastNightTotalMinutes(sleepData);
  const recoveryNeed = lastNight != null && lastNight < 420 ? 0.65 : lastNight != null && lastNight < 480 ? 0.35 : 0.15;

  const budgetUsed = daytimeSleepMinutes / Math.max(napBudget, 1);
  const bedtimeProtectionPressure = clamp01(budgetUsed * 0.65 + (ongoingNap ? 0.15 : 0) + recoveryNeed * 0.2);
  const napRecoveryPressure = clamp01(recoveryNeed * 0.7 + (1 - budgetUsed) * 0.25);

  const schedulePressure =
    bedtimeProtectionPressure > 0.72 ? 'high' : bedtimeProtectionPressure > 0.45 ? 'medium' : 'low';

  let currentNapDurationMinutes: number | null = null;
  let totalBeforeCurrent: number | null = null;
  let napOrdinal: number | null = null;
  if (ongoingNap && new Date(ongoingNap.start_time).getTime() >= dayStart.getTime()) {
    currentNapDurationMinutes = Math.round((nowMs - new Date(ongoingNap.start_time).getTime()) / 60000);
    totalBeforeCurrent = completedTodayNaps.reduce((s, x) => s + (x.duration_minutes ?? 0), 0);
    napOrdinal = completedTodayNaps.length + 1;
  }

  const projectedIfNapContinues =
    ongoingNap && currentNapDurationMinutes != null
      ? (totalBeforeCurrent ?? 0) + currentNapDurationMinutes + 30
      : null;

  const typicalLastWw = profile.preferences.last_wake_window_minutes && profile.preferences.last_wake_window_minutes > 0
    ? profile.preferences.last_wake_window_minutes
    : Math.round(ww.typical * 0.75);

  const timeUntilBed =
    endIso != null
      ? Math.max(0, Math.round((new Date(endIso).getTime() - nowMs) / 60000) - typicalLastWw)
      : null;

  const dayShape = classifyDayShape({
    napCountToday,
    daytimeSleepMinutes,
    napBudget,
    lastNightMinutes: lastNight,
    undertiredRisk,
    overtiredRisk,
  });

  const laterCatnap = !ongoingNight &&
    timeUntilBed != null &&
    timeUntilBed > 90 &&
    napCountToday < 5 &&
    dayShape !== 'compressed';

  const napDisposition = classifyNapDisposition(
    currentNapDurationMinutes,
    ww.typical,
    napOrdinal,
    budgetUsed,
  );

  const consistency = scheduleConsistencyScore(sleepData, nowIso, tz);
  const napExpect = getNapCountExpectationForAge(ageDays);
  let transitionStrength: number | null = null;
  if (ageDays > 90 && ageDays < 200) {
    const avgNaps = recentPack.napSummaries.length > 0
      ? recentPack.napSummaries.reduce((s, d) => s + d.napCount, 0) / recentPack.napSummaries.length
      : napCountToday;
    transitionStrength = clamp01((napExpect.typical - avgNaps) / 2);
  }

  let suggestedRequest: SleepFacts['suggestedRequestType'] = undefined;
  if (ongoingNight) suggestedRequest = 'CHAT_COACHING';
  else if (ongoingNap) suggestedRequest = 'MAX_NAP_DURATION_RECOMMENDATION';

  return {
    computedAt: nowIso,
    timezone: tz,
    ageDays,
    ageWeeks: Math.floor(ageDays / 7),
    ageMonths: Math.round((ageDays / 30) * 10) / 10,
    morningWakeIso: morningWake,
    wakeTimeToday: morningWake,
    lastWakeIso,
    currentWakeWindowMinutes,
    napCountToday,
    completedNapCountToday: completedTodayNaps.length,
    daytimeSleepMinutes,
    lastNapEndedAt,
    ongoingNight: Boolean(ongoingNight),
    ongoingNapStartIso: ongoingNap ? ongoingNap.start_time : null,
    currentNapInProgress: Boolean(ongoingNap && new Date(ongoingNap.start_time).getTime() >= dayStart.getTime()),
    currentNapDurationMinutes,
    currentNapOrdinalToday: napOrdinal,
    totalDaytimeSleepBeforeCurrentNapMinutes: totalBeforeCurrent,
    projectedDaytimeSleepIfNapContinuesMinutes: projectedIfNapContinues,
    timeUntilBedtimeBasedOnTypicalWindowsMinutes: timeUntilBed,
    overtiredRisk,
    undertiredRisk,
    bedtimeWindow: { startIso, endIso },
    schedulePressure,
    scheduleConsistencyScore: consistency,
    recentFalseStartRate: recentPack.recentFalseStartRate,
    recentEarlyWakeRate: recentPack.recentEarlyWakeRate,
    napTransitionSignalStrength: transitionStrength,
    sleepDebtEstimate: lastNight != null ? clamp01((540 - lastNight) / 300) : null,
    currentDayShape: dayShape,
    napRecoveryPressure,
    bedtimeProtectionPressure,
    currentNapLikelyRestorativeVsDisruptive: napDisposition,
    laterCatnapStillPossible: laterCatnap,
    lastNightTotalSleepMinutes: lastNight,
    suggestedRequestType: suggestedRequest,
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function defaultBedtimeWindowIso(
  nowIso: string,
  profile: ChildProfile,
  tz: string,
): { startIso: string; endIso: string } {
  const p = profile.preferences;
  let targetMin = 19 * 60 + 30;
  if (p.bedtime_type === 'target' && p.bedtime_target_time) {
    const [h, m] = p.bedtime_target_time.split(':').map(Number);
    if (!Number.isNaN(h) && !Number.isNaN(m)) targetMin = h * 60 + m;
  }
  const startClock = Math.max(17 * 60, targetMin - 45);
  const endClock = Math.min(22 * 60, targetMin + 45);

  const anchor = new Date(nowIso);
  const toMs = (ref: Date, clockMin: number) => {
    const fh = Math.floor(clockMin / 60);
    const fm = clockMin % 60;
    const off = getUtcOffsetMinutesAt(ref.toISOString(), tz);
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), fh, fm, 0).getTime() - off * 60000;
  };

  let startMs = toMs(anchor, startClock);
  let endMs = toMs(anchor, endClock);
  if (endMs <= new Date(nowIso).getTime()) {
    const next = new Date(anchor.getTime() + 86400000);
    startMs = toMs(next, startClock);
    endMs = toMs(next, endClock);
  }
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

function classifyDayShape(args: {
  napCountToday: number;
  daytimeSleepMinutes: number;
  napBudget: number;
  lastNightMinutes: number | null;
  undertiredRisk: number;
  overtiredRisk: number;
}): SleepFacts['currentDayShape'] {
  if (args.lastNightMinutes != null && args.lastNightMinutes < 400) return 'recovery';
  if (args.daytimeSleepMinutes > args.napBudget + 25) return 'messy';
  if (args.overtiredRisk > 0.55 && args.napCountToday >= 1) return 'compressed';
  if (args.undertiredRisk > 0.55) return 'messy';
  return 'on_track';
}

function classifyNapDisposition(
  elapsed: number | null,
  typicalWw: number,
  ordinal: number | null,
  budgetUsed: number,
): SleepFacts['currentNapLikelyRestorativeVsDisruptive'] {
  if (elapsed == null || ordinal == null) return 'unknown';
  if (elapsed < typicalWw * 0.35) return 'restorative';
  if (budgetUsed > 0.92 && ordinal >= 2) return 'disruptive';
  return 'balanced';
}
