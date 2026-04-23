/** Auto-renewable subscription product IDs in App Store Connect (sandbox + production). */
export const SOVA_MONTHLY = 'sova_monthly';
export const SOVA_ANNUAL = 'sova_annual';

/** Default SKU when calling `purchase()` without an argument. */
export const PRO_SUBSCRIPTION_PRODUCT_ID = SOVA_MONTHLY;

export const PRO_SUBSCRIPTION_PRODUCT_IDS = [SOVA_MONTHLY, SOVA_ANNUAL] as const;

export const PREMIUM_FEATURE_LABELS = {
  coach: 'AI Coach',
  recommendations: 'AI Recommendations',
  insights: 'AI Insights',
} as const;

export type PremiumFeatureKey = keyof typeof PREMIUM_FEATURE_LABELS;
