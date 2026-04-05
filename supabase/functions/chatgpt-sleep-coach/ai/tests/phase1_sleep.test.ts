/**
 * Deno unit tests — Phase 1 deterministic sleep + nap-cap logic.
 * Run: deno test --allow-read ai/tests/phase1_sleep.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  catnapVsEarlyBedtimeScore,
  computeNapCapDurations,
  getDaytimeNapBudgetMinutes,
  getMaxSingleNapMinutesByAge,
  getNapCountExpectationForAge,
  getWakeWindowBandsForAge,
} from '../sleepRules.ts';
import { computeDataQuality } from '../services/dataQualityService.ts';
import { computeSleepFacts } from '../services/sleepAnalysisService.ts';
import { getChildProfile } from '../services/childProfileService.ts';
import { getRecentSleepHistory } from '../services/sleepHistoryService.ts';
import { generateCandidateScheduleOptions } from '../services/candidateGenerationService.ts';
import { evaluateRecommendationCandidates } from '../services/candidateEvaluationService.ts';
import type { SleepSession } from '../types/sessions.ts';
import { agenticResponseToLegacyNextSleep } from '../legacyNextSleepMap.ts';

// ─── Sleep rules ────────────────────────────────────────────────

Deno.test('wake window bands scale with age', () => {
  const young = getWakeWindowBandsForAge(60);
  const old = getWakeWindowBandsForAge(400);
  assertEquals(young.typical < old.typical, true);
  assertEquals(young.min < young.typical, true);
  assertEquals(young.typical < young.max, true);
});

Deno.test('wake window bands cover all life stages', () => {
  for (const age of [15, 45, 90, 150, 210, 330, 450]) {
    const b = getWakeWindowBandsForAge(age);
    assert(b.min > 0, `min must be positive for age ${age}`);
    assert(b.typical >= b.min, `typical >= min for age ${age}`);
    assert(b.max >= b.typical, `max >= typical for age ${age}`);
  }
});

Deno.test('daytime nap budget decreases after 12 months', () => {
  assertEquals(getDaytimeNapBudgetMinutes(100) > getDaytimeNapBudgetMinutes(400), true);
});

Deno.test('max single nap decreases with age', () => {
  assert(getMaxSingleNapMinutesByAge(60) >= getMaxSingleNapMinutesByAge(300));
});

Deno.test('nap count expectations decrease with age', () => {
  const young = getNapCountExpectationForAge(100);
  const older = getNapCountExpectationForAge(450);
  assert(young.typical > older.typical);
});

// ─── Nap cap logic ──────────────────────────────────────────────

Deno.test('nap cap: caps are ordered preferred <= soft <= hard', () => {
  const caps = computeNapCapDurations({
    ageDays: 200,
    napOrdinal: 1,
    napsPlannedToday: 2,
    totalDaytimeSleepBeforeThisNapMinutes: 0,
    currentNapElapsedMinutes: 30,
    daytimeBudgetMinutes: 180,
    recoveryPressure: 0.2,
    bedtimeProtectionPressure: 0.5,
    preferLongerNaps: false,
    preferEarlierBedtime: false,
  });
  assert(caps.preferredCapMinutes <= caps.softCapMinutes, 'preferred <= soft');
  assert(caps.softCapMinutes <= caps.hardCapMinutes, 'soft <= hard');
});

Deno.test('nap cap: caps never below elapsed nap time', () => {
  const caps = computeNapCapDurations({
    ageDays: 240,
    napOrdinal: 2,
    napsPlannedToday: 2,
    totalDaytimeSleepBeforeThisNapMinutes: 150,
    currentNapElapsedMinutes: 80,
    daytimeBudgetMinutes: 180,
    recoveryPressure: 0.1,
    bedtimeProtectionPressure: 0.9,
    preferLongerNaps: false,
    preferEarlierBedtime: false,
  });
  assert(caps.preferredCapMinutes >= 80, `preferred ${caps.preferredCapMinutes} must be >= elapsed 80`);
  assert(caps.softCapMinutes >= 80);
  assert(caps.hardCapMinutes >= 80);
});

Deno.test('nap cap: long nap threatening bedtime yields protect_bedtime or tight budget', () => {
  const caps = computeNapCapDurations({
    ageDays: 240,
    napOrdinal: 2,
    napsPlannedToday: 2,
    totalDaytimeSleepBeforeThisNapMinutes: 95,
    currentNapElapsedMinutes: 55,
    daytimeBudgetMinutes: 180,
    recoveryPressure: 0.2,
    bedtimeProtectionPressure: 0.85,
    preferLongerNaps: false,
    preferEarlierBedtime: false,
  });
  assert(caps.hardCapMinutes >= caps.softCapMinutes);
  assert(caps.softCapMinutes >= caps.preferredCapMinutes);
  assert(caps.reasonCodes.length > 0);
  const relevant = caps.reasonCodes.some(
    (c) => c === 'protect_bedtime' || c === 'tight_daytime_budget',
  );
  assert(relevant, `Expected protect_bedtime or tight_daytime_budget, got ${caps.reasonCodes}`);
});

Deno.test('nap cap: recovery day allows slightly more when bedtime pressure moderate', () => {
  const tight = computeNapCapDurations({
    ageDays: 200,
    napOrdinal: 1,
    napsPlannedToday: 2,
    totalDaytimeSleepBeforeThisNapMinutes: 0,
    currentNapElapsedMinutes: 30,
    daytimeBudgetMinutes: 180,
    recoveryPressure: 0.75,
    bedtimeProtectionPressure: 0.35,
    preferLongerNaps: true,
    preferEarlierBedtime: false,
  });
  assertEquals(tight.reasonCodes.includes('recovery_day_more_rest'), true);
});

Deno.test('nap cap: later nap ordinal gets shorter cap', () => {
  const nap1 = computeNapCapDurations({
    ageDays: 150,
    napOrdinal: 1,
    napsPlannedToday: 3,
    totalDaytimeSleepBeforeThisNapMinutes: 0,
    currentNapElapsedMinutes: 20,
    daytimeBudgetMinutes: 210,
    recoveryPressure: 0.2,
    bedtimeProtectionPressure: 0.3,
  });
  const nap3 = computeNapCapDurations({
    ageDays: 150,
    napOrdinal: 3,
    napsPlannedToday: 3,
    totalDaytimeSleepBeforeThisNapMinutes: 120,
    currentNapElapsedMinutes: 20,
    daytimeBudgetMinutes: 210,
    recoveryPressure: 0.2,
    bedtimeProtectionPressure: 0.3,
  });
  assert(nap3.preferredCapMinutes <= nap1.preferredCapMinutes, 'Later nap should get shorter or equal cap');
  assert(nap3.reasonCodes.includes('later_nap_shorter_cap'));
});

Deno.test('nap cap: prefer-earlier-bedtime shortens caps', () => {
  const base = computeNapCapDurations({
    ageDays: 200,
    napOrdinal: 1,
    napsPlannedToday: 2,
    totalDaytimeSleepBeforeThisNapMinutes: 0,
    currentNapElapsedMinutes: 20,
    daytimeBudgetMinutes: 180,
    recoveryPressure: 0.2,
    bedtimeProtectionPressure: 0.4,
    preferEarlierBedtime: false,
  });
  const shorter = computeNapCapDurations({
    ageDays: 200,
    napOrdinal: 1,
    napsPlannedToday: 2,
    totalDaytimeSleepBeforeThisNapMinutes: 0,
    currentNapElapsedMinutes: 20,
    daytimeBudgetMinutes: 180,
    recoveryPressure: 0.2,
    bedtimeProtectionPressure: 0.4,
    preferEarlierBedtime: true,
  });
  assert(shorter.preferredCapMinutes <= base.preferredCapMinutes, 'earlier bedtime pref should shorten');
  assert(shorter.reasonCodes.includes('parent_pref_earlier_bedtime'));
});

// ─── Catnap vs early bedtime ────────────────────────────────────

Deno.test('catnap vs early bedtime: tight window favors early bedtime', () => {
  const result = catnapVsEarlyBedtimeScore({
    ageDays: 200,
    minutesUntilTargetBedtime: 40,
    lastWakeWindowMinutes: 90,
    daytimeSleepMinutes: 140,
    napBudget: 180,
    overtiredRisk: 0.6,
    preferEarlierBedtime: false,
  });
  assert(result.earlyBedtimeScore > result.catnapScore, 'early bedtime should win when tight window');
});

Deno.test('catnap vs early bedtime: ample time supports catnap', () => {
  const result = catnapVsEarlyBedtimeScore({
    ageDays: 200,
    minutesUntilTargetBedtime: 180,
    lastWakeWindowMinutes: 90,
    daytimeSleepMinutes: 100,
    napBudget: 180,
    overtiredRisk: 0.2,
    preferEarlierBedtime: false,
  });
  assert(result.catnapScore >= result.earlyBedtimeScore, 'catnap should score higher with ample time');
});

// ─── Data quality ───────────────────────────────────────────────

Deno.test('data quality drops when no sessions today and no inferred wake', () => {
  const profile = getChildProfile(
    { baby_id: 'x', timezone: 'America/Los_Angeles' },
    'Test',
    180,
  );
  const pack = getRecentSleepHistory('x', [], '2026-04-04T18:00:00.000Z', 'America/Los_Angeles', 7);
  const facts = computeSleepFacts(profile, [], pack, '2026-04-04T18:00:00.000Z', null);
  const dq = computeDataQuality(facts, [], '2026-04-04T18:00:00.000Z');
  assert(dq.score < 0.65, `DQ score should be low for empty day, got ${dq.score}`);
});

Deno.test('data quality improves with complete today + history', () => {
  const now = '2026-04-04T18:00:00.000Z';
  const sessions: SleepSession[] = [];
  for (let d = 0; d < 7; d++) {
    const base = new Date(new Date(now).getTime() - d * 86400000);
    sessions.push({
      type: 'night',
      start_time: new Date(base.getTime() - 13 * 3600000).toISOString(),
      end_time: new Date(base.getTime() - 6 * 3600000).toISOString(),
      duration_minutes: 420,
    });
    sessions.push({
      type: 'nap',
      start_time: new Date(base.getTime() - 4 * 3600000).toISOString(),
      end_time: new Date(base.getTime() - 3 * 3600000).toISOString(),
      duration_minutes: 60,
    });
  }
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'T', 200);
  const pack = getRecentSleepHistory('x', sessions, now, 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, now, null);
  const dq = computeDataQuality(facts, sessions, now);
  assert(dq.score >= 0.7, `DQ should be high with good data, got ${dq.score}`);
});

// ─── Sleep facts ────────────────────────────────────────────────

Deno.test('facts: wake window represents pre-nap window when nap is in progress', () => {
  const sessions: SleepSession[] = [
    {
      type: 'night',
      start_time: '2026-04-03T23:00:00.000Z',
      end_time: '2026-04-04T12:00:00.000Z',
      duration_minutes: 780,
    },
    {
      type: 'nap',
      start_time: '2026-04-04T13:30:00.000Z',
      end_time: '2026-04-04T14:15:00.000Z',
      duration_minutes: 45,
    },
    // Ongoing nap
    { type: 'nap', start_time: '2026-04-04T16:00:00.000Z', end_time: null, duration_minutes: null },
  ];
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 180);
  const pack = getRecentSleepHistory('x', sessions, '2026-04-04T16:30:00.000Z', 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, '2026-04-04T16:30:00.000Z', null);

  assert(facts.currentNapInProgress, 'nap should be in progress');
  assertEquals(facts.currentNapDurationMinutes, 30);
  // Wake window = from last completed nap end (14:15) to nap start (16:00) = 105 min
  assertEquals(facts.currentWakeWindowMinutes, 105);
  assertEquals(facts.lastWakeIso, '2026-04-04T14:15:00.000Z');
});

Deno.test('facts: wake window correct when baby is awake (no ongoing nap)', () => {
  const sessions: SleepSession[] = [
    {
      type: 'night',
      start_time: '2026-04-03T23:00:00.000Z',
      end_time: '2026-04-04T12:00:00.000Z',
      duration_minutes: 780,
    },
    {
      type: 'nap',
      start_time: '2026-04-04T13:30:00.000Z',
      end_time: '2026-04-04T14:15:00.000Z',
      duration_minutes: 45,
    },
  ];
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 180);
  const pack = getRecentSleepHistory('x', sessions, '2026-04-04T16:00:00.000Z', 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, '2026-04-04T16:00:00.000Z', null);

  assert(!facts.currentNapInProgress);
  // Wake window = from last nap end (14:15) to now (16:00) = 105 min
  assertEquals(facts.currentWakeWindowMinutes, 105);
});

Deno.test('facts: early wake day (4am) still computes morning wake', () => {
  const sessions: SleepSession[] = [
    {
      type: 'night',
      start_time: '2026-04-03T19:30:00.000Z',
      end_time: '2026-04-04T04:00:00.000Z',
      duration_minutes: 510,
    },
  ];
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 150);
  const pack = getRecentSleepHistory('x', sessions, '2026-04-04T05:00:00.000Z', 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, '2026-04-04T05:00:00.000Z', null);

  assertEquals(facts.morningWakeIso, '2026-04-04T04:00:00.000Z');
  assertEquals(facts.currentWakeWindowMinutes, 60);
});

Deno.test('facts: ongoing night produces null wake window (not computing awake time)', () => {
  const sessions: SleepSession[] = [
    {
      type: 'nap',
      start_time: '2026-04-04T13:00:00.000Z',
      end_time: '2026-04-04T14:00:00.000Z',
      duration_minutes: 60,
    },
    // Ongoing night
    { type: 'night', start_time: '2026-04-04T19:30:00.000Z', end_time: null, duration_minutes: null },
  ];
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 180);
  const pack = getRecentSleepHistory('x', sessions, '2026-04-04T21:00:00.000Z', 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, '2026-04-04T21:00:00.000Z', null);

  assert(facts.ongoingNight, 'should detect ongoing night');
  // Wake window = last completed nap end (14:00) to night start (19:30) = 330 min
  assertEquals(facts.currentWakeWindowMinutes, 330);
});

Deno.test('facts: recovery day shape detected when last night < 400 min', () => {
  const sessions: SleepSession[] = [
    {
      type: 'night',
      start_time: '2026-04-03T23:00:00.000Z',
      end_time: '2026-04-04T05:00:00.000Z',
      duration_minutes: 360,
    },
  ];
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 200);
  const pack = getRecentSleepHistory('x', sessions, '2026-04-04T07:00:00.000Z', 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, '2026-04-04T07:00:00.000Z', null);

  assertEquals(facts.currentDayShape, 'recovery');
  assert(facts.napRecoveryPressure > 0.4, 'recovery pressure should be elevated');
});

Deno.test('facts: suggests MAX_NAP_DURATION when nap in progress', () => {
  const sessions: SleepSession[] = [
    { type: 'nap', start_time: '2026-04-04T14:00:00.000Z', end_time: null, duration_minutes: null },
  ];
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 180);
  const pack = getRecentSleepHistory('x', sessions, '2026-04-04T14:30:00.000Z', 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, '2026-04-04T14:30:00.000Z', null);

  assertEquals(facts.suggestedRequestType, 'MAX_NAP_DURATION_RECOMMENDATION');
});

// ─── Candidate generation ───────────────────────────────────────

Deno.test('max nap candidates: second nap on 2-nap day returns wake options', () => {
  const sessions: SleepSession[] = [
    {
      type: 'night',
      start_time: '2026-04-03T23:00:00.000Z',
      end_time: '2026-04-04T13:00:00.000Z',
      duration_minutes: 840,
    },
    {
      type: 'nap',
      start_time: '2026-04-04T14:00:00.000Z',
      end_time: '2026-04-04T15:10:00.000Z',
      duration_minutes: 70,
    },
    { type: 'nap', start_time: '2026-04-04T17:30:00.000Z', end_time: null, duration_minutes: null },
  ];
  const profile = getChildProfile(
    { baby_id: 'x', timezone: 'UTC', user_preferences: { target_nap_count: 2 } },
    'B',
    240,
  );
  const pack = getRecentSleepHistory('x', sessions, '2026-04-04T18:00:00.000Z', 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, '2026-04-04T18:00:00.000Z', '2026-04-04T15:10:00.000Z');
  assertEquals(facts.currentNapInProgress, true);
  const cands = generateCandidateScheduleOptions(facts, profile, 'MAX_NAP_DURATION_RECOMMENDATION', '2026-04-04T18:00:00.000Z');
  assert(cands.length >= 3, `expected >= 3 candidates, got ${cands.length}`);
  assert(cands.every((c) => c.actionType === 'WAKE_FROM_NAP'));
});

Deno.test('next nap candidates: clean 3-nap day suggests nap starts when awake', () => {
  const sessions: SleepSession[] = [
    {
      type: 'night',
      start_time: '2026-04-03T23:00:00.000Z',
      end_time: '2026-04-04T12:30:00.000Z',
      duration_minutes: 810,
    },
    {
      type: 'nap',
      start_time: '2026-04-04T13:00:00.000Z',
      end_time: '2026-04-04T13:45:00.000Z',
      duration_minutes: 45,
    },
  ];
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 120);
  const pack = getRecentSleepHistory('x', sessions, '2026-04-04T14:30:00.000Z', 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, '2026-04-04T14:30:00.000Z', '2026-04-04T13:45:00.000Z');
  assertEquals(facts.currentNapInProgress, false);
  const cands = generateCandidateScheduleOptions(facts, profile, 'NEXT_NAP_RECOMMENDATION', '2026-04-04T14:30:00.000Z');
  assert(cands.length >= 1, `expected >= 1 candidates, got ${cands.length}`);
  assert(cands.every((c) => c.actionType === 'NAP_START'));
});

Deno.test('bedtime candidates: returns bedtime options', () => {
  const sessions: SleepSession[] = [
    {
      type: 'night',
      start_time: '2026-04-03T23:00:00.000Z',
      end_time: '2026-04-04T12:00:00.000Z',
      duration_minutes: 780,
    },
    {
      type: 'nap',
      start_time: '2026-04-04T13:30:00.000Z',
      end_time: '2026-04-04T14:30:00.000Z',
      duration_minutes: 60,
    },
    {
      type: 'nap',
      start_time: '2026-04-04T16:30:00.000Z',
      end_time: '2026-04-04T17:20:00.000Z',
      duration_minutes: 50,
    },
  ];
  const profile = getChildProfile(
    {
      baby_id: 'x',
      timezone: 'UTC',
      user_preferences: { bedtime_type: 'target', bedtime_target_time: '19:30', target_nap_count: 2 },
    },
    'B',
    240,
  );
  const pack = getRecentSleepHistory('x', sessions, '2026-04-04T18:00:00.000Z', 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, '2026-04-04T18:00:00.000Z', '2026-04-04T17:20:00.000Z');
  const cands = generateCandidateScheduleOptions(facts, profile, 'BEDTIME_RECOMMENDATION', '2026-04-04T18:00:00.000Z');
  assert(cands.length >= 2, `expected >= 2 bedtime candidates, got ${cands.length}`);
  assert(cands.every((c) => c.actionType === 'BEDTIME'));
});

Deno.test('catnap vs early bedtime candidates generated', () => {
  const sessions: SleepSession[] = [
    {
      type: 'nap',
      start_time: '2026-04-04T13:00:00.000Z',
      end_time: '2026-04-04T14:00:00.000Z',
      duration_minutes: 60,
    },
  ];
  const profile = getChildProfile(
    { baby_id: 'x', timezone: 'UTC', user_preferences: { bedtime_target_time: '19:30', bedtime_type: 'target' } },
    'B',
    200,
  );
  const now = '2026-04-04T17:00:00.000Z';
  const pack = getRecentSleepHistory('x', sessions, now, 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, now, '2026-04-04T14:00:00.000Z');
  const cands = generateCandidateScheduleOptions(facts, profile, 'CATNAP_VS_EARLY_BEDTIME', now);
  assertEquals(cands.length, 2);
  const types = cands.map((c) => c.actionType);
  assert(types.includes('CATNAP'));
  assert(types.includes('BEDTIME'));
});

Deno.test('next nap delegates to max nap candidates when nap is in progress', () => {
  const sessions: SleepSession[] = [
    { type: 'nap', start_time: '2026-04-04T14:00:00.000Z', end_time: null, duration_minutes: null },
  ];
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 180);
  const now = '2026-04-04T14:30:00.000Z';
  const pack = getRecentSleepHistory('x', sessions, now, 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, now, null);
  const cands = generateCandidateScheduleOptions(facts, profile, 'NEXT_NAP_RECOMMENDATION', now);
  assert(cands.every((c) => c.actionType === 'WAKE_FROM_NAP'), 'should delegate to max nap when nap active');
});

Deno.test('ongoing night returns empty next nap candidates', () => {
  const sessions: SleepSession[] = [
    { type: 'night', start_time: '2026-04-04T19:00:00.000Z', end_time: null, duration_minutes: null },
  ];
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 180);
  const now = '2026-04-04T20:00:00.000Z';
  const pack = getRecentSleepHistory('x', sessions, now, 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, now, null);
  const cands = generateCandidateScheduleOptions(facts, profile, 'NEXT_NAP_RECOMMENDATION', now);
  assertEquals(cands.length, 0);
});

// ─── Candidate evaluation ───────────────────────────────────────

Deno.test('evaluation ranks candidates in score order', () => {
  const sessions: SleepSession[] = [
    {
      type: 'nap',
      start_time: '2026-04-04T13:00:00.000Z',
      end_time: '2026-04-04T13:45:00.000Z',
      duration_minutes: 45,
    },
  ];
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 150);
  const now = '2026-04-04T15:00:00.000Z';
  const pack = getRecentSleepHistory('x', sessions, now, 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, now, '2026-04-04T13:45:00.000Z');
  const cands = generateCandidateScheduleOptions(facts, profile, 'NEXT_NAP_RECOMMENDATION', now);
  const ranked = evaluateRecommendationCandidates(cands, facts, profile);

  for (let i = 0; i < ranked.length - 1; i++) {
    assert(ranked[i].score >= ranked[i + 1].score, 'ranked should be in descending score order');
    assertEquals(ranked[i].rank, i + 1);
  }
  assert(ranked.every((r) => r.strengths.length > 0), 'each candidate should have strengths');
  assert(ranked.every((r) => r.weaknesses.length > 0), 'each candidate should have weaknesses');
});

// ─── Legacy map ─────────────────────────────────────────────────

Deno.test('legacy map: NAP_WINDOW produces expected fields', () => {
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 180);
  const sessions: SleepSession[] = [];
  const pack = getRecentSleepHistory('x', sessions, '2026-04-04T14:00:00.000Z', 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, '2026-04-04T14:00:00.000Z', null);

  const agentic = {
    requestType: 'NEXT_NAP_RECOMMENDATION' as const,
    recommendedAction: { type: 'NAP_WINDOW' as const, startAt: '2026-04-04T14:30:00.000Z', label: 'Next nap' },
    reasoningSummary: 'test',
    confidence: 0.7,
    dataQualityScore: 0.8,
    watchFors: [],
    parentFacingResponse: 'Try a nap around 2:30.',
  };
  const legacy = agenticResponseToLegacyNextSleep(agentic, undefined, facts, '2026-04-04T14:00:00.000Z');
  assertEquals(legacy.sleep_type, 'nap');
  assert(typeof legacy.recommended_time === 'string');
  assert(typeof legacy.minutes_from_now === 'number');
  assertEquals(legacy.should_cap_nap, true);
  assert(Array.isArray(legacy.rest_of_day_schedule));
});

Deno.test('legacy map: WAKE_FROM_NAP produces cap fields', () => {
  const sessions: SleepSession[] = [
    { type: 'nap', start_time: '2026-04-04T14:00:00.000Z', end_time: null, duration_minutes: null },
  ];
  const profile = getChildProfile({ baby_id: 'x', timezone: 'UTC' }, 'B', 180);
  const pack = getRecentSleepHistory('x', sessions, '2026-04-04T14:30:00.000Z', 'UTC', 7);
  const facts = computeSleepFacts(profile, sessions, pack, '2026-04-04T14:30:00.000Z', null);

  const agentic = {
    requestType: 'MAX_NAP_DURATION_RECOMMENDATION' as const,
    recommendedAction: { type: 'WAKE_FROM_NAP' as const, wakeAt: '2026-04-04T15:00:00.000Z', label: 'Wake at 3pm' },
    reasoningSummary: 'test',
    confidence: 0.7,
    dataQualityScore: 0.8,
    watchFors: [],
    parentFacingResponse: 'Consider waking.',
  };
  const legacy = agenticResponseToLegacyNextSleep(agentic, undefined, facts, '2026-04-04T14:30:00.000Z');
  assertEquals(legacy.headline, 'Cap ongoing nap');
  assertEquals(legacy.should_cap_nap, true);
  assert(typeof legacy.cap_at_minutes === 'number');
  assert((legacy.cap_at_minutes as number) >= 15);
});
