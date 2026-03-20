import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createServiceRoleClient, CORS_HEADERS, jsonResponse, syncRevenueCatSubscriberToFamily } from '../_shared/monetization.ts';

const PREMIUM_ENTITLEMENT_ID = 'premium_ai';

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
    const entitlementId =
      typeof body?.entitlement_id === 'string' && body.entitlement_id.trim() !== ''
        ? body.entitlement_id.trim()
        : PREMIUM_ENTITLEMENT_ID;
    const babyId =
      typeof body?.baby_id === 'string' && body.baby_id.trim() !== ''
        ? body.baby_id.trim()
        : null;

    const status = await syncRevenueCatSubscriberToFamily(user.id, entitlementId, babyId);
    return jsonResponse({ ok: true, status }, 200);
  } catch (error) {
    console.error('revenuecat-sync-subscription error:', error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Failed to sync subscription',
      },
      500
    );
  }
});
