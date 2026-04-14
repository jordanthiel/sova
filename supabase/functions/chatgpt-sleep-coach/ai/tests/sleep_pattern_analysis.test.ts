/**
 * Run: deno test --allow-read --no-check ai/tests/sleep_pattern_analysis.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { analyzeSleepPatterns30d } from '../services/sleepPatternAnalysisService.ts';
import { buildSleepEngineGuidance } from '../services/sleepRecommendationEngine.ts';
import { getChildProfile } from '../services/childProfileService.ts';
import type { SleepSession } from '../types/sessions.ts';

function night(start: string, end: string, min: number): SleepSession {
  return { type: 'night', start_time: start, end_time: end, duration_minutes: min };
}

function nap(start: string, end: string, min: number): SleepSession {
  return { type: 'nap', start_time: start, end_time: end, duration_minutes: min };
}

Deno.test('30d analysis returns cohorts when history is rich enough', () => {
  const tz = 'UTC';
  const sessions: SleepSession[] = [];
  for (let d = 0; d < 14; d++) {
    const dayNum = 18 - d;
    const ymd = `2026-03-${dayNum.toString().padStart(2, '0')}`;
    const prev = `2026-03-${(dayNum - 1).toString().padStart(2, '0')}`;
    sessions.push(
      night(`${prev}T22:00:00.000Z`, `${ymd}T08:00:00.000Z`, 600 + (d % 2) * 5),
    );
    sessions.push(nap(`${ymd}T10:00:00.000Z`, `${ymd}T11:00:00.000Z`, 60));
    sessions.push(nap(`${ymd}T14:00:00.000Z`, `${ymd}T15:15:00.000Z`, 75));
    sessions.push(night(`${ymd}T19:00:00.000Z`, `${ymd}T19:01:00.000Z`, 600));
  }

  const analysis = analyzeSleepPatterns30d(sessions, '2026-03-18T15:00:00.000Z', tz, 120);
  assert(analysis.daysAnalyzed >= 3, 'expected several usable days');
  assertEquals(analysis.windowDays, 30);
  assert(analysis.topDays.length >= 1);
  assert(analysis.bottomDays.length >= 1);
});

Deno.test('bedtime night after local midnight still pairs with that calendar day’s naps', () => {
  const tz = 'UTC';
  const sessions: SleepSession[] = [
    night('2026-04-12T22:00:00.000Z', '2026-04-13T08:00:00.000Z', 600),
    nap('2026-04-13T10:00:00.000Z', '2026-04-13T11:00:00.000Z', 60),
    nap('2026-04-13T18:00:00.000Z', '2026-04-13T20:00:00.000Z', 120),
    night('2026-04-14T00:30:00.000Z', '2026-04-14T08:00:00.000Z', 450),
  ];
  const analysis = analyzeSleepPatterns30d(sessions, '2026-04-13T18:00:00.000Z', tz, 120);
  const apr13 = analysis.usableDays.find((d) => d.dateKey === '2026-04-13');
  assert(apr13 != null, 'expected Apr 13 to be usable when bedtime starts after midnight');
  assertEquals(apr13.napCount, 2);
});

Deno.test('engine guidance clamps to age floor and marks weak personalization when thin', () => {
  const profile = getChildProfile(
    { baby_id: '1', timezone: 'UTC' },
    'Test',
    120,
  );
  profile.timezone = 'UTC';
  const analysis = analyzeSleepPatterns30d([], '2026-01-15T12:00:00.000Z', 'UTC', 120);
  const facts = {
    ageDays: 120,
    ageMonths: 4,
    overtiredRisk: 0.2,
    undertiredRisk: 0.2,
    currentDayShape: 'on_track' as const,
    napTransitionSignalStrength: null,
    bedtimeWindow: { startIso: '2026-01-15T23:00:00.000Z', endIso: '2026-01-16T00:30:00.000Z' },
    daytimeSleepMinutes: 60,
    completedNapCountToday: 1,
    currentNapInProgress: false,
    currentNapOrdinalToday: null,
  } as import('../types/sleepFacts.ts').SleepFacts;

  const g = buildSleepEngineGuidance(analysis, facts, profile);
  assertEquals(g.personalizationStrength, 'weak');
  assert(g.targetWakeWindowMinutes >= 75);
  assert(g.targetWakeWindowMinutes <= 135);
});
