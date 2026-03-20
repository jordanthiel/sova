import type { PremiumFeatureKey } from '@/constants/subscription';

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
  subscriptionProvider: 'revenuecat' | null;
  subscriptionProductId: string | null;
  subscriptionExpiresAt: string | null;
}

export interface PremiumAccessContextValue extends EntitlementStatus {
  isReady: boolean;
  isLoading: boolean;
  offeringsLoading: boolean;
  billingConfigured: boolean;
  availablePackages: RevenueCatPackage[];
  refresh: (options?: RefreshSubscriptionOptions) => Promise<EntitlementStatus>;
  purchasePackage: (pkg: RevenueCatPackage) => Promise<void>;
  restorePurchases: () => Promise<void>;
  showPaywall: (feature?: PremiumFeatureKey) => void;
}

export interface RefreshSubscriptionOptions {
  loadOfferings?: boolean;
  syncPurchases?: boolean;
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

export interface RevenueCatCustomerInfo {
  entitlements?: {
    active?: Record<string, unknown>;
  };
}

export interface RevenueCatPackage {
  identifier: string;
  packageType?: string;
  product?: {
    identifier?: string;
    title?: string;
    description?: string;
    priceString?: string;
  };
}

export interface RevenueCatOffering {
  availablePackages: RevenueCatPackage[];
}
