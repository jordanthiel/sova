/**
 * Blends model confidence with data quality — prevents overconfident outputs on thin logs.
 */
export function effectiveConfidence(modelConfidence: number, dataQualityScore: number): number {
  const m = clamp01(modelConfidence);
  const d = clamp01(dataQualityScore);
  return round2(Math.sqrt(m * d));
}

export function hedgingPrefix(dataQualityScore: number): string {
  if (dataQualityScore >= 0.72) return '';
  if (dataQualityScore >= 0.5) return `Based on what\u2019s logged so far, `;
  return `The data is a bit thin today, so take this as a gentle guide, not a guarantee: `;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
