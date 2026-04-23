import type { AgenticRequestType } from '../types/aiRequest.ts';

const TYPE_LIST: AgenticRequestType[] = [
  'NEXT_NAP_RECOMMENDATION',
  'BEDTIME_RECOMMENDATION',
  'FULL_DAY_SCHEDULE_RECOMMENDATION',
  'NAP_CAP_RECOMMENDATION',
  'MAX_NAP_DURATION_RECOMMENDATION',
  'CATNAP_VS_EARLY_BEDTIME',
  'DAY_REVIEW_AND_PREDICTION',
  'CHAT_COACHING',
  'TREND_ANALYSIS',
  'SCHEDULE_ADJUSTMENT',
  'UNKNOWN',
];

export function classifierPrompt(params: {
  message: string;
  requestSource: string;
  ageMonths: number;
  toplineFacts: string;
}): string {
  return `You classify a parent message for a baby sleep coaching app.

Request source: ${params.requestSource}
Child age (months): ${params.ageMonths}
Fact topline:
${params.toplineFacts}

Parent message:
"""${params.message}"""

Choose exactly one requestType from this list:
${TYPE_LIST.join(', ')}

Examples for MAX_NAP_DURATION_RECOMMENDATION:
- "How long should this nap go?"
- "When should I wake him?"
- "Should I cap this nap?"
- "Do I let this nap keep going?"

Rules:
- If the message is general conversation with no schedule nap/bed ask, use CHAT_COACHING.
- If unclear, use UNKNOWN and set needsMoreData true with missingFields listing what would help.
- Never invent sleep events not implied by the message.

Return ONLY JSON:
{
  "requestType": "${TYPE_LIST[0]}",
  "needsMoreData": false,
  "missingFields": [],
  "confidence": 0.0
}`;
}
