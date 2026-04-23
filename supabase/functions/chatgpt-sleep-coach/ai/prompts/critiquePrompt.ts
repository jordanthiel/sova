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
6) reasoningSummary: every concrete nap/bedtime time and cap for today's plan matches that candidate's clientRestOfDay (if not, revise reasoningSummary to align — keep evidence, fix numbers)
7) reasoningSummary uses a numbered list (1. 2. 3.), not hyphen bullets; durations ≥60 as H:MM, under 60 as compact Xm — not spelled-out "minutes" or bare minute counts

Return ONLY JSON:
{
  "approved": true,
  "issues": [],
  "revisions": ["optional replacement for parentFacingResponse if tone/clarity needs a fix"],
  "reasoningSummaryRevision": "optional full markdown replacement for reasoningSummary when you must fix schedule numbers to match clientRestOfDay; omit if unchanged"
}`;
}
