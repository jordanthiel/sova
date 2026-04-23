import type { CoachingTurnRequest, CoachingTurnResponse } from '../types/coaching.ts';
import type { ChildProfile } from '../types/aiRequest.ts';
import type { SleepSession } from '../types/sessions.ts';
import { coachingPromptStub } from '../prompts/coachingPrompt.ts';
import type { LlmCaller } from './scheduleRecommendationOrchestrator.ts';

/**
 * Phase 2: full coaching orchestrator (classify → facts → optional recommendation hook → answer).
 * Phase 1 stub: single LLM completion with stub system prompt only — do not use in production chat yet.
 */
export async function runCoachingOrchestratorStub(
  _req: CoachingTurnRequest,
  _profile: ChildProfile,
  _sleepData: SleepSession[],
  _callLLM: LlmCaller,
): Promise<CoachingTurnResponse> {
  void _req;
  void _profile;
  void _sleepData;
  void _callLLM;
  return {
    answer: coachingPromptStub() + ' (stub)',
    reasoning: 'Phase 2 will chain classifier, facts, and optional schedule agent.',
    nextSteps: ['Implement memory profile load', 'Wire recommendation deep-links'],
    watchFors: [],
    confidence: 0,
    dataQualityScore: 0,
    suggestedChips: ['Cap nap', 'How much longer can this nap go?', 'When should bedtime be?', 'Cat nap vs early bed?', 'Review today'],
  };
}
