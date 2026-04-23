import { supabase } from '@/lib/supabase';
import type { PremiumFeatureKey } from '@/constants/subscription';
import type { EntitlementStatus, PremiumAccessRequiredError } from '@/types/subscription';
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
