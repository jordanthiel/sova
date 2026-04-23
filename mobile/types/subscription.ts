import type { PremiumFeatureKey } from '@/constants/subscription';
import type { IapSubscriptionDisplay } from '@/services/iapService';

export type AccessSource = 'subscription' | 'trial' | 'none';

export interface EntitlementStatus {
  familyId: string | null;
  hasPremiumAccess: boolean;
  hasSubscriptionAccess: boolean;
  isTrialActive: boolean;
  accessSource: AccessSource;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  subscriptionStatus: 'inactive' | 'active' | 'canceled' | 'past_due' | 'expired';
  subscriptionProvider: 'apple' | 'revenuecat' | null;
  subscriptionProductId: string | null;
  subscriptionExpiresAt: string | null;
}

export interface PremiumAccessContextValue extends EntitlementStatus {
  /** StoreKit reports an active subscription for the configured product IDs. */
  isPro: boolean;
  isReady: boolean;
  isLoading: boolean;
  subscriptionsLoading: boolean;
  /** iOS StoreKit session initialized without a hard failure. */
  iapReady: boolean;
  subscriptionProducts: IapSubscriptionDisplay[];
  refresh: (options?: RefreshSubscriptionOptions) => Promise<EntitlementStatus>;
  /** Subscribe to the default monthly product (or pass an explicit App Store product id). */
  purchase: (productId?: string) => Promise<void>;
  restore: () => Promise<void>;
  showPaywall: (feature?: PremiumFeatureKey) => void;
}

export interface RefreshSubscriptionOptions {
  /** Refetch subscription product metadata from the App Store. */
  loadSubscriptions?: boolean;
}

export interface PaywallRouteParams {
  feature?: PremiumFeatureKey;
}

export class PremiumAccessRequiredError extends Error {
  readonly feature?: PremiumFeatureKey;
  readonly reason: 'subscription_required' | 'trial_expired';

  constructor(reason: 'subscription_required' | 'trial_expired', feature?: PremiumFeatureKey) {
    super(reason === 'trial_expired' ? 'Your free trial has ended.' : 'A premium subscription is required.');
    this.name = 'PremiumAccessRequiredError';
    this.reason = reason;
    this.feature = feature;
  }
}

export function isPremiumAccessRequiredError(error: unknown): error is PremiumAccessRequiredError {
  return error instanceof PremiumAccessRequiredError;
}
