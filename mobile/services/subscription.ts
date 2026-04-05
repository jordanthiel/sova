import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

import { DEFAULT_OFFERING_ID, PREMIUM_ENTITLEMENT_ID, type PremiumFeatureKey } from '@/constants/subscription';
import { supabase } from '@/lib/supabase';
import type {
  EntitlementStatus,
  PremiumAccessRequiredError,
  RevenueCatCustomerInfo,
  RevenueCatOffering,
  RevenueCatPackage,
} from '@/types/subscription';
import { PremiumAccessRequiredError as PremiumAccessRequiredErrorClass } from '@/types/subscription';

type EntitlementStatusRow = {
  family_id: string;
  has_premium_access: boolean;
  has_subscription_access: boolean;
  is_trial_active: boolean;
  access_source: 'subscription' | 'trial' | 'none';
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_status: EntitlementStatus['subscriptionStatus'];
  subscription_provider: EntitlementStatus['subscriptionProvider'];
  subscription_product_id: string | null;
  subscription_expires_at: string | null;
};

let sdkConfigured = false;
let configuredAppUserId: string | null = null;

function getRevenueCatApiKey(): string | null {
  const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim();
  const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();

  if (Platform.OS === 'ios') return iosKey || null;
  if (Platform.OS === 'android') return androidKey || null;
  return iosKey || androidKey || null;
}

function getSupabaseFunctionsBaseUrl(): string {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54421';
  return `${baseUrl}/functions/v1`;
}

function normalizeEntitlementStatus(row?: EntitlementStatusRow | null): EntitlementStatus {
  return {
    familyId: row?.family_id ?? null,
    hasPremiumAccess: row?.has_premium_access ?? false,
    hasSubscriptionAccess: row?.has_subscription_access ?? false,
    isTrialActive: row?.is_trial_active ?? false,
    accessSource: row?.access_source ?? 'none',
    trialStartedAt: row?.trial_started_at ?? null,
    trialEndsAt: row?.trial_ends_at ?? null,
    subscriptionStatus: row?.subscription_status ?? 'inactive',
    subscriptionProvider: row?.subscription_provider ?? null,
    subscriptionProductId: row?.subscription_product_id ?? null,
    subscriptionExpiresAt: row?.subscription_expires_at ?? null,
  };
}

function hasActiveRevenueCatEntitlement(customerInfo: RevenueCatCustomerInfo | null): boolean {
  if (!customerInfo) return false;
  const active = (customerInfo as any)?.entitlements?.active ?? {};
  return Boolean(active?.[PREMIUM_ENTITLEMENT_ID]);
}

function didUserCancelPurchase(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as Record<string, unknown>;
  return Boolean(value.userCancelled) || value.code === 'PURCHASE_CANCELLED_ERROR';
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function isBillingConfigured(): boolean {
  return Boolean(getRevenueCatApiKey());
}

export async function configureBillingForUser(userId: string | null): Promise<void> {
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    console.warn('[subscription] Missing RevenueCat API key');
    return;
  }

  // Don't initialize the SDK on a signed-out cold start.
  // If RevenueCat is misconfigured for the current environment, configuring here
  // surfaces noisy native errors before the user can even reach auth.
  if (!userId && !sdkConfigured) {
    return;
  }

  if (!sdkConfigured) {
    try {
      (Purchases as any).setLogLevel?.((Purchases as any).LOG_LEVEL?.WARN ?? 'WARN');
    } catch {
      // noop
    }

    await (Purchases as any).configure({
      apiKey,
      appUserID: userId ?? undefined,
    });
    sdkConfigured = true;
    configuredAppUserId = userId;
    return;
  }

  if (!userId && configuredAppUserId) {
    await (Purchases as any).logOut?.();
    configuredAppUserId = null;
    return;
  }

  if (userId && configuredAppUserId !== userId) {
    await (Purchases as any).logIn?.(userId);
    configuredAppUserId = userId;
  }
}

export async function ensureProfileTrial(): Promise<void> {
  const { error } = await supabase.rpc('ensure_profile_trial');
  if (error) throw error;
}

export async function getEntitlementStatus(): Promise<EntitlementStatus> {
  const { data, error } = await supabase.rpc('get_my_family_entitlement_status');
  if (error) throw error;
  const row = Array.isArray(data) ? (data[0] as EntitlementStatusRow | undefined) : undefined;
  return normalizeEntitlementStatus(row);
}

export async function getBabyEntitlementStatus(babyId: string): Promise<EntitlementStatus> {
  const { data, error } = await supabase.rpc('get_baby_entitlement_status', { p_baby_id: babyId });
  if (error) throw error;
  const row = Array.isArray(data) ? (data[0] as EntitlementStatusRow | undefined) : undefined;
  return normalizeEntitlementStatus(row);
}

export async function getOfferings(): Promise<RevenueCatPackage[]> {
  if (!isBillingConfigured()) return [];
  const offerings = await (Purchases as any).getOfferings();
  const currentOffering = ((offerings?.current as RevenueCatOffering | null) ??
    (offerings?.all?.[DEFAULT_OFFERING_ID] as RevenueCatOffering | null) ??
    (Object.values(offerings?.all ?? {})[0] as RevenueCatOffering | undefined) ??
    null);
  return currentOffering?.availablePackages ?? [];
}

export async function getCustomerInfo(): Promise<RevenueCatCustomerInfo | null> {
  if (!isBillingConfigured()) return null;
  return ((await (Purchases as any).getCustomerInfo()) as RevenueCatCustomerInfo | null) ?? null;
}

export async function syncRevenueCatSubscription(babyId?: string | null): Promise<EntitlementStatus> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${getSupabaseFunctionsBaseUrl()}/revenuecat-sync-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ entitlement_id: PREMIUM_ENTITLEMENT_ID, baby_id: babyId ?? null }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { error?: string }).error ?? `Sync failed (${response.status})`;
    throw new Error(message);
  }

  return normalizeEntitlementStatus((payload as { status?: EntitlementStatusRow }).status);
}

export async function refreshPremiumStatus(
  options: { loadOfferings?: boolean; syncPurchases?: boolean; babyId?: string | null } = {}
): Promise<{
  status: EntitlementStatus;
  customerInfo: RevenueCatCustomerInfo | null;
  availablePackages: RevenueCatPackage[];
}> {
  const { loadOfferings = true, syncPurchases = true, babyId = null } = options;
  const customerInfo = await getCustomerInfo();

  let status: EntitlementStatus;
  if (syncPurchases && hasActiveRevenueCatEntitlement(customerInfo)) {
    status = await syncRevenueCatSubscription(babyId);
  } else {
    status = babyId ? await getBabyEntitlementStatus(babyId) : await getEntitlementStatus();
  }

  const availablePackages = loadOfferings ? await getOfferings() : [];
  return { status, customerInfo, availablePackages };
}

export async function purchasePackage(pkg: RevenueCatPackage, babyId?: string | null): Promise<EntitlementStatus> {
  if (!isBillingConfigured()) throw new Error('RevenueCat is not configured');
  try {
    const result = await (Purchases as any).purchasePackage(pkg);
    const customerInfo = ((result?.customerInfo ?? result) as RevenueCatCustomerInfo | null) ?? null;
    if (!hasActiveRevenueCatEntitlement(customerInfo)) {
      return babyId ? getBabyEntitlementStatus(babyId) : getEntitlementStatus();
    }
    return await syncRevenueCatSubscription(babyId);
  } catch (error) {
    if (didUserCancelPurchase(error)) {
      throw error;
    }
    throw error;
  }
}

export async function restorePurchases(babyId?: string | null): Promise<EntitlementStatus> {
  if (!isBillingConfigured()) throw new Error('RevenueCat is not configured');
  const result = await (Purchases as any).restorePurchases();
  const customerInfo = ((result?.customerInfo ?? result) as RevenueCatCustomerInfo | null) ?? null;
  if (hasActiveRevenueCatEntitlement(customerInfo)) {
    return syncRevenueCatSubscription(babyId);
  }
  return babyId ? getBabyEntitlementStatus(babyId) : getEntitlementStatus();
}

export function requirePremiumAccess(
  status: EntitlementStatus,
  feature?: PremiumFeatureKey
): asserts status is EntitlementStatus & { hasPremiumAccess: true } {
  if (status.hasPremiumAccess) return;
  throw new PremiumAccessRequiredErrorClass(status.trialEndsAt ? 'trial_expired' : 'subscription_required', feature);
}

export function toPremiumAccessError(
  status: EntitlementStatus,
  feature?: PremiumFeatureKey
): PremiumAccessRequiredError {
  return new PremiumAccessRequiredErrorClass(
    status.trialEndsAt ? 'trial_expired' : 'subscription_required',
    feature
  );
}

export async function getPremiumAccessErrorFromResponse(
  response: Response,
  feature?: PremiumFeatureKey
): Promise<PremiumAccessRequiredError | null> {
  if (response.status !== 402 && response.status !== 403) return null;
  const payload = await response.json().catch(() => ({}));
  const reason =
    (payload as { code?: string }).code === 'trial_expired'
      ? 'trial_expired'
      : 'subscription_required';
  return new PremiumAccessRequiredErrorClass(reason, feature);
}

export function getTrialDaysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const diffMs = new Date(trialEndsAt).getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}
