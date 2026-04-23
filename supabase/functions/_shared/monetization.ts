import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const REVENUECAT_SECRET_API_KEY = Deno.env.get('REVENUECAT_SECRET_API_KEY') ?? '';

export const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export interface EntitlementStatusRow {
  family_id: string;
  has_premium_access: boolean;
  has_subscription_access: boolean;
  is_trial_active: boolean;
  access_source: 'subscription' | 'trial' | 'none';
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_status: 'inactive' | 'active' | 'canceled' | 'past_due' | 'expired';
  subscription_provider: 'revenuecat' | 'apple' | null;
  subscription_product_id: string | null;
  subscription_expires_at: string | null;
}

interface RevenueCatSubscriber {
  entitlements?: Record<string, {
    expires_date?: string | null;
    product_identifier?: string | null;
  }>;
  subscriptions?: Record<string, {
    expires_date?: string | null;
    unsubscribe_detected_at?: string | null;
    billing_issues_detected_at?: string | null;
  }>;
  original_app_user_id?: string | null;
  aliases?: string[];
}

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: CORS_HEADERS,
  });
}

export function createServiceRoleClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase service role configuration');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export function extractSupabaseUserId(candidates: Array<string | null | undefined>): string | null {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const candidate of candidates) {
    if (candidate && uuidPattern.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function toIsoString(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchRevenueCatSubscriber(appUserId: string): Promise<RevenueCatSubscriber> {
  if (!REVENUECAT_SECRET_API_KEY) {
    throw new Error('Missing RevenueCat secret API key');
  }

  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: {
      Authorization: `Bearer ${REVENUECAT_SECRET_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`RevenueCat subscriber lookup failed (${response.status}): ${detail}`);
  }

  const payload = await response.json();
  return (payload?.subscriber ?? {}) as RevenueCatSubscriber;
}

function deriveFamilyUpdate(subscriber: RevenueCatSubscriber, entitlementId: string) {
  const entitlements = subscriber.entitlements ?? {};
  const subscriptions = subscriber.subscriptions ?? {};
  const entitlement =
    entitlements[entitlementId] ??
    Object.values(entitlements)[0] ??
    null;

  const subscriptionProductId =
    (typeof entitlement?.product_identifier === 'string' && entitlement.product_identifier) ||
    Object.keys(subscriptions)[0] ||
    null;

  const subscriptionExpiresAt =
    toIsoString(entitlement?.expires_date) ??
    toIsoString(subscriptionProductId ? subscriptions[subscriptionProductId]?.expires_date : null);

  const matchingSubscription =
    (subscriptionProductId ? subscriptions[subscriptionProductId] : null) ??
    null;

  let subscriptionStatus: EntitlementStatusRow['subscription_status'] = 'inactive';
  if (subscriptionProductId && subscriptionExpiresAt) {
    const hasFutureExpiry = new Date(subscriptionExpiresAt).getTime() > Date.now();
    if (hasFutureExpiry) {
      if (matchingSubscription?.billing_issues_detected_at) {
        subscriptionStatus = 'past_due';
      } else if (matchingSubscription?.unsubscribe_detected_at) {
        subscriptionStatus = 'canceled';
      } else {
        subscriptionStatus = 'active';
      }
    } else {
      subscriptionStatus = 'expired';
    }
  } else if (subscriptionProductId) {
    subscriptionStatus = 'expired';
  }

  return {
    subscription_status: subscriptionStatus,
    subscription_provider: 'revenuecat' as const,
    subscription_product_id: subscriptionProductId,
    subscription_expires_at: subscriptionExpiresAt,
    subscription_updated_at: new Date().toISOString(),
    revenuecat_app_user_id: null,
    revenuecat_customer_id: subscriber.original_app_user_id ?? null,
  };
}

async function resolveFamilyIdForUser(
  supabase: ReturnType<typeof createServiceRoleClient>,
  appUserId: string,
  babyId?: string | null
): Promise<string> {
  if (babyId) {
    const { data: baby, error } = await supabase
      .from('babies')
      .select('family_id')
      .eq('id', babyId)
      .single();

    if (error || !baby?.family_id) {
      throw new Error('Could not resolve family for baby');
    }

    const { data: membership } = await supabase
      .from('family_members')
      .select('id')
      .eq('family_id', baby.family_id)
      .eq('user_id', appUserId)
      .eq('status', 'accepted')
      .maybeSingle();

    if (!membership) {
      throw new Error('User does not belong to this family');
    }

    return baby.family_id;
  }

  const { data: familyRows, error } = await supabase
    .rpc('get_user_family_id', { p_user_id: appUserId });

  if (error || !familyRows) {
    throw new Error(error?.message ?? 'Could not resolve user family');
  }

  return familyRows as unknown as string;
}

const STOREKIT_SUBSCRIPTION_PRODUCT_IDS = new Set(['sova_monthly', 'sova_annual']);

/**
 * Applies an active StoreKit subscription to the user's family row so RPCs like
 * `get_baby_entitlement_status` match device entitlements.
 * Product id must be an allowed SKU; expiry must be in the future (from StoreKit).
 */
export async function applyStoreKitSubscriptionToFamily(params: {
  appUserId: string;
  babyId?: string | null;
  productId: string;
  subscriptionExpiresAtIso: string;
}): Promise<EntitlementStatusRow> {
  if (!STOREKIT_SUBSCRIPTION_PRODUCT_IDS.has(params.productId)) {
    throw new Error('Unsupported StoreKit product id');
  }
  const exp = new Date(params.subscriptionExpiresAtIso);
  if (Number.isNaN(exp.getTime()) || exp.getTime() <= Date.now()) {
    throw new Error('subscription_expires_at must be a future ISO timestamp');
  }

  const supabase = createServiceRoleClient();
  const familyId = await resolveFamilyIdForUser(supabase, params.appUserId, params.babyId);

  await supabase.rpc('ensure_family_trial', { p_family_id: familyId });

  const { error: updateError } = await supabase
    .from('families')
    .update({
      subscription_status: 'active',
      subscription_provider: 'apple',
      subscription_product_id: params.productId,
      subscription_expires_at: params.subscriptionExpiresAtIso,
      subscription_updated_at: new Date().toISOString(),
    })
    .eq('id', familyId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data: statusRows, error: statusError } = await supabase.rpc('get_family_entitlement_status', {
    p_family_id: familyId,
  });

  if (statusError) {
    throw new Error(statusError.message);
  }

  const status = Array.isArray(statusRows) ? (statusRows[0] as EntitlementStatusRow | undefined) : undefined;
  if (!status) {
    throw new Error('Failed to resolve entitlement status');
  }

  return status;
}

export async function syncRevenueCatSubscriberToFamily(
  appUserId: string,
  entitlementId: string,
  babyId?: string | null
): Promise<EntitlementStatusRow> {
  const supabase = createServiceRoleClient();
  const subscriber = await fetchRevenueCatSubscriber(appUserId);
  const familyId = await resolveFamilyIdForUser(supabase, appUserId, babyId);

  await supabase.rpc('ensure_family_trial', { p_family_id: familyId });

  const update = deriveFamilyUpdate(subscriber, entitlementId);
  update.revenuecat_app_user_id = appUserId;
  const { error: updateError } = await supabase
    .from('families')
    .update(update)
    .eq('id', familyId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data: statusRows, error: statusError } = await supabase
    .rpc('get_family_entitlement_status', { p_family_id: familyId });

  if (statusError) {
    throw new Error(statusError.message);
  }

  const status = Array.isArray(statusRows) ? (statusRows[0] as EntitlementStatusRow | undefined) : undefined;
  if (!status) {
    throw new Error('Failed to resolve entitlement status');
  }

  return status;
}
