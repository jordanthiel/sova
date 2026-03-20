import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import {
  CORS_HEADERS,
  extractSupabaseUserId,
  jsonResponse,
  syncRevenueCatSubscriberToFamily,
} from '../_shared/monetization.ts';

const PREMIUM_ENTITLEMENT_ID = 'premium_ai';
const REVENUECAT_WEBHOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';

interface RevenueCatWebhookBody {
  event?: {
    app_user_id?: string | null;
    original_app_user_id?: string | null;
    aliases?: string[] | null;
    entitlement_ids?: string[] | null;
  };
}

function isWebhookAuthorized(authHeader: string | null): boolean {
  if (!REVENUECAT_WEBHOOK_AUTH) return true;
  if (!authHeader) return false;
  if (authHeader === REVENUECAT_WEBHOOK_AUTH) return true;
  if (authHeader === `Bearer ${REVENUECAT_WEBHOOK_AUTH}`) return true;
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!isWebhookAuthorized(req.headers.get('Authorization'))) {
    return jsonResponse({ error: 'Unauthorized webhook request' }, 401);
  }

  try {
    const body = (await req.json()) as RevenueCatWebhookBody;
    const event = body?.event ?? {};
    const userId = extractSupabaseUserId([
      event.app_user_id,
      event.original_app_user_id,
      ...(event.aliases ?? []),
    ]);

    if (!userId) {
      return jsonResponse({ ok: true, skipped: true, reason: 'No Supabase user id found in webhook event' }, 200);
    }

    const entitlementId =
      event.entitlement_ids?.find((value) => typeof value === 'string' && value.trim() !== '') ??
      PREMIUM_ENTITLEMENT_ID;

    const status = await syncRevenueCatSubscriberToFamily(userId, entitlementId);
    return jsonResponse({ ok: true, status }, 200);
  } catch (error) {
    console.error('revenuecat-webhook error:', error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Failed to process RevenueCat webhook',
      },
      500
    );
  }
});
