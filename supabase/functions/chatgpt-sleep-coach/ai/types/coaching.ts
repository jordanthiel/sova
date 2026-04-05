import type { AgenticScheduleResponse } from './recommendation.ts';

/**
 * Phase 2: structured coaching turn. Phase 1 exports types + stub orchestrator only.
 */
export interface CoachingTurnRequest {
  message: string;
  threadSummary?: string;
}

export interface CoachingTurnResponse {
  answer: string;
  reasoning: string;
  nextSteps: string[];
  watchFors: string[];
  confidence: number;
  dataQualityScore: number;
  linkedRecommendation?: Partial<AgenticScheduleResponse>;
  suggestedChips?: string[];
}
