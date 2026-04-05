import type { ContextPacket } from '../services/contextPacketService.ts';
import type { LlmSelectionOutput } from '../types/recommendation.ts';

export function critiquePrompt(packet: ContextPacket, selection: LlmSelectionOutput): string {
  return `Review a baby-sleep recommendation for consistency and tone.

Context:
${JSON.stringify(packet, null, 2)}

Model output:
${JSON.stringify(selection, null, 2)}

Check:
1) recommendedOptionId exists in rankedCandidates
2) reasoning does not invent missing logs
3) wording is not overly certain given dataQuality
4) no medical claims
5) tone is gentle/non-judgmental

Return ONLY JSON:
{
  "approved": true,
  "issues": [],
  "revisions": ["optional short fixes to parentFacingResponse or reasoningSummary"]
}`;
}
