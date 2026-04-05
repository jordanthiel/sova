/**
 * Integration-style tests with a mock LLM (no network).
 * deno test --allow-read ai/tests/orchestrator_mock.test.ts
 */
import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runScheduleRecommendationOrchestrator } from '../orchestrators/scheduleRecommendationOrchestrator.ts';
import type { SleepSession } from '../types/sessions.ts';

function makeMockLLM() {
  let call = 0;
  return async () => {
    call++;
    if (call === 1) {
      return JSON.stringify({
        recommendedOptionId: 'nap_start_0',
        fallbackOptionId: 'nap_start_1',
        reasoningSummary: 'Middle option balances wake window and bedtime.',
        confidence: 0.72,
        watchFors: ['Short fuse can mean move earlier.'],
        parentFacingResponse: 'I would aim for the next sleep soon, with flexibility if cues are strong.',
      });
    }
    return JSON.stringify({ approved: true, issues: [], revisions: [] });
  };
}

Deno.test('orchestrator: basic next-nap flow with select + critique', async () => {
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
      end_time: '2026-04-04T13:40:00.000Z',
      duration_minutes: 40,
    },
  ];

  const out = await runScheduleRecommendationOrchestrator({
    body: {
      baby_id: 't1',
      timezone: 'UTC',
      current_time: '2026-04-04T14:00:00.000Z',
      last_wake_time: '2026-04-04T13:40:00.000Z',
      request_source: 'schedule_card',
    },
    sleepData: sessions,
    babyName: 'Baby',
    babyAgeDays: 150,
    callLLM: makeMockLLM(),
    includeDebug: true,
  });

  assertExists(out.selectedCandidate);
  assert(out.response.confidence > 0 && out.response.confidence <= 1);
  assert(out.response.debug?.topCandidates && out.response.debug.topCandidates.length > 0);
  assertEquals(out.requestType, 'NEXT_NAP_RECOMMENDATION');
  assert(out.response.parentFacingResponse.length > 0);
  assert(out.response.watchFors.length > 0);
});

Deno.test('orchestrator: force MAX_NAP_DURATION with ongoing nap', async () => {
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
    { type: 'nap', start_time: '2026-04-04T16:30:00.000Z', end_time: null, duration_minutes: null },
  ];

  let llmCalls = 0;
  const mockLLM = async () => {
    llmCalls++;
    if (llmCalls === 1) {
      return JSON.stringify({
        recommendedOptionId: 'nap_cap_preferred',
        reasoningSummary: 'Preferred cap protects bedtime.',
        confidence: 0.78,
        watchFors: ['Crankiness after wake is normal.'],
        parentFacingResponse: 'Aim to wake by the preferred time.',
      });
    }
    return JSON.stringify({ approved: true, issues: [], revisions: [] });
  };

  const out = await runScheduleRecommendationOrchestrator({
    body: {
      baby_id: 't2',
      timezone: 'UTC',
      current_time: '2026-04-04T17:00:00.000Z',
      last_wake_time: '2026-04-04T14:15:00.000Z',
      force_request_type: 'MAX_NAP_DURATION_RECOMMENDATION',
    },
    sleepData: sessions,
    babyName: 'Baby',
    babyAgeDays: 200,
    callLLM: mockLLM,
    includeDebug: true,
  });

  assertEquals(out.requestType, 'MAX_NAP_DURATION_RECOMMENDATION');
  assert(out.rankedCandidates.length >= 3, 'should have multiple wake options');
  assert(out.rankedCandidates.every((c) => c.actionType === 'WAKE_FROM_NAP'));
  assertExists(out.response.preferredWakeAt);
  assertExists(out.response.softCapAt);
  assertExists(out.response.hardCapAt);
  assertEquals(llmCalls, 2);
});

Deno.test('orchestrator: ongoing night returns blocked response without LLM calls', async () => {
  const sessions: SleepSession[] = [
    { type: 'night', start_time: '2026-04-04T19:30:00.000Z', end_time: null, duration_minutes: null },
  ];

  let llmCalls = 0;
  const mockLLM = async () => {
    llmCalls++;
    return '{}';
  };

  const out = await runScheduleRecommendationOrchestrator({
    body: {
      baby_id: 't3',
      timezone: 'UTC',
      current_time: '2026-04-04T21:00:00.000Z',
    },
    sleepData: sessions,
    babyName: 'Luna',
    babyAgeDays: 180,
    callLLM: mockLLM,
  });

  assertEquals(llmCalls, 0, 'should not call LLM during night');
  assert(out.response.parentFacingResponse.includes('Luna'));
  assertEquals(out.rankedCandidates.length, 0);
  assert(out.response.confidence >= 0.9);
});

Deno.test('orchestrator: empty sleep data falls back to bedtime candidates', async () => {
  const mockLLM = async () => {
    return JSON.stringify({
      recommendedOptionId: 'bedtime_1',
      reasoningSummary: 'With no data, suggest bedtime.',
      confidence: 0.45,
      watchFors: ['Log more to get better guidance.'],
      parentFacingResponse: 'Try bedtime around the usual time.',
    });
  };

  const out = await runScheduleRecommendationOrchestrator({
    body: {
      baby_id: 't4',
      timezone: 'UTC',
      current_time: '2026-04-04T18:00:00.000Z',
    },
    sleepData: [],
    babyName: 'Baby',
    babyAgeDays: 200,
    callLLM: mockLLM,
  });

  assert(out.rankedCandidates.length > 0, 'should fall back to bedtime candidates');
  assert(out.response.dataQualityScore < 0.7, 'data quality should be low');
});

Deno.test('orchestrator: LLM parse failure falls back to deterministic selection', async () => {
  let calls = 0;
  const badLLM = async () => {
    calls++;
    if (calls === 1) return 'This is not JSON at all, totally broken response';
    return JSON.stringify({ approved: true, issues: [], revisions: [] });
  };

  const sessions: SleepSession[] = [
    {
      type: 'nap',
      start_time: '2026-04-04T13:00:00.000Z',
      end_time: '2026-04-04T13:45:00.000Z',
      duration_minutes: 45,
    },
  ];

  const out = await runScheduleRecommendationOrchestrator({
    body: {
      baby_id: 't5',
      timezone: 'UTC',
      current_time: '2026-04-04T15:00:00.000Z',
      last_wake_time: '2026-04-04T13:45:00.000Z',
    },
    sleepData: sessions,
    babyName: 'Baby',
    babyAgeDays: 150,
    callLLM: badLLM,
  });

  assertExists(out.selectedCandidate, 'should have a fallback selection');
  assert(out.response.confidence > 0 && out.response.confidence <= 1);
  assert(out.response.parentFacingResponse.length > 0);
});

Deno.test('orchestrator: critique revision modifies parent-facing text', async () => {
  let call = 0;
  const mockLLM = async () => {
    call++;
    if (call === 1) {
      return JSON.stringify({
        recommendedOptionId: 'nap_start_0',
        reasoningSummary: 'Good option.',
        confidence: 0.7,
        watchFors: [],
        parentFacingResponse: 'Original text from selector.',
      });
    }
    return JSON.stringify({
      approved: false,
      issues: ['Tone too clinical'],
      revisions: ['Here is a softer version of the recommendation.'],
    });
  };

  const sessions: SleepSession[] = [
    {
      type: 'nap',
      start_time: '2026-04-04T13:00:00.000Z',
      end_time: '2026-04-04T13:45:00.000Z',
      duration_minutes: 45,
    },
  ];

  const out = await runScheduleRecommendationOrchestrator({
    body: {
      baby_id: 't6',
      timezone: 'UTC',
      current_time: '2026-04-04T15:00:00.000Z',
      last_wake_time: '2026-04-04T13:45:00.000Z',
    },
    sleepData: sessions,
    babyName: 'Baby',
    babyAgeDays: 150,
    callLLM: mockLLM,
  });

  assert(
    out.response.parentFacingResponse.includes('softer version'),
    'critique revision should replace original text',
  );
});

Deno.test('orchestrator: debug info included when flag set', async () => {
  const out = await runScheduleRecommendationOrchestrator({
    body: {
      baby_id: 't7',
      timezone: 'UTC',
      current_time: '2026-04-04T15:00:00.000Z',
    },
    sleepData: [],
    babyName: 'Baby',
    babyAgeDays: 180,
    callLLM: makeMockLLM(),
    includeDebug: true,
  });

  assertExists(out.response.debug, 'debug should be present');
  assertExists(out.response.debug!.facts);
  assert(Array.isArray(out.response.debug!.topCandidates));
});

Deno.test('orchestrator: debug info excluded when flag not set', async () => {
  const out = await runScheduleRecommendationOrchestrator({
    body: {
      baby_id: 't8',
      timezone: 'UTC',
      current_time: '2026-04-04T15:00:00.000Z',
    },
    sleepData: [],
    babyName: 'Baby',
    babyAgeDays: 180,
    callLLM: makeMockLLM(),
    includeDebug: false,
  });

  assertEquals(out.response.debug, undefined, 'debug should not be present');
});
