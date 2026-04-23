import { supabase } from '@/lib/supabase';

/**
 * Pushes the active StoreKit subscription to the user's family row so edge functions
 * (`get_baby_entitlement_status`) align with the device.
 *
 * Uses explicit `fetch` with `apikey` + user JWT — matches how `chatgpt-sleep-coach` is called
 * and avoids relying on `functions.invoke` behavior across supabase-js versions.
 */
export async function syncStoreKitSubscriptionToBackend(
  babyId: string | null | undefined,
  payload: { productId: string; subscriptionExpiresAt: string },
  accessTokenOverride?: string | null
): Promise<boolean> {
  const accessToken =
    accessTokenOverride ??
    (await supabase.auth.getSession()).data.session?.access_token ??
    null;

  if (!accessToken) {
    console.warn('[subscription] No access token; skipping StoreKit sync');
    return false;
  }

  const baseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!baseUrl || !anonKey) {
    console.warn('[subscription] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
    return false;
  }

  try {
    const res = await fetch(`${baseUrl}/functions/v1/sync-storekit-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        baby_id: babyId ?? null,
        product_id: payload.productId,
        subscription_expires_at: payload.subscriptionExpiresAt,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[subscription] StoreKit sync HTTP', res.status, text);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[subscription] StoreKit sync error', e);
    return false;
  }
}
