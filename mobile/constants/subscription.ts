export const PREMIUM_ENTITLEMENT_ID = 'premium_ai';
export const DEFAULT_OFFERING_ID = 'default';

export const PREMIUM_FEATURE_LABELS = {
  coach: 'AI Coach',
  recommendations: 'AI Recommendations',
  insights: 'AI Insights',
} as const;

export type PremiumFeatureKey = keyof typeof PREMIUM_FEATURE_LABELS;
