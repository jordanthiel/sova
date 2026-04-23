/** Post-process parent-facing strings — lightweight keyword guard (not a substitute for review). */

const MEDICAL_HINTS = /\b(medication|medicine|illness|fever|sick|doctor|diagnosis|apnea|seizure)\b/i;

export function scrubMedicalClaims(text: string): string {
  if (!MEDICAL_HINTS.test(text)) return text;
  return `${text}\n\n(Reminder: I’m not a medical professional — ask your clinician if you’re worried about health.)`;
}

export function hasJudgmentShameLanguage(text: string): boolean {
  return /\b(you should have|bad parent|ruin(?:ed)? their sleep|doing it wrong|selfish)\b/i.test(text);
}
