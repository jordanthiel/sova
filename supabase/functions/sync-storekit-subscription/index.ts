import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import {
  applyStoreKitSubscriptionToFamily,
  createServiceRoleClient,
  CORS_HEADERS,
  jsonResponse,
} from '../_shared/monetization.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const supabase = createServiceRoleClient();
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const productId = typeof body?.product_id === 'string' ? body.product_id.trim() : '';
    const subscriptionExpiresAtIso =
      typeof body?.subscription_expires_at === 'string' ? body.subscription_expires_at.trim() : '';
    const babyId =
      typeof body?.baby_id === 'string' && body.baby_id.trim() !== '' ? body.baby_id.trim() : null;

    if (!productId || !subscriptionExpiresAtIso) {
      return jsonResponse({ error: 'product_id and subscription_expires_at are required' }, 400);
    }

    const status = await applyStoreKitSubscriptionToFamily({
      appUserId: user.id,
      babyId,
      productId,
      subscriptionExpiresAtIso,
    });

    return jsonResponse({ ok: true, status }, 200);
  } catch (error) {
    console.error('sync-storekit-subscription error:', error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Failed to sync StoreKit subscription',
      },
      500
    );
  }
});
