/**
 * Notify other caregivers of a baby that sleep state changed (nap started/ended)
 * so they can refresh their Live Activity without opening the app.
 *
 * Invoke after inserting or updating a sleep_session:
 *   body: { babyId: string, excludeUserId?: string }  // excludeUserId = user who made the change
 *
 * Sends a push to each other caregiver's device with data: { type: 'live_activity_refresh', babyId }.
 * The app's addLiveActivityRefreshListener() will call refreshNapLiveActivityFromServer(babyId).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface RequestBody {
  babyId: string;
  excludeUserId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { babyId, excludeUserId } = body;
  if (!babyId) {
    return jsonResponse({ error: "babyId is required" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: baby, error: babyError } = await supabase
    .from("babies")
    .select("family_id")
    .eq("id", babyId)
    .single();

  if (babyError || !baby?.family_id) {
    console.error("notify-live-activity-refresh baby error:", babyError?.message);
    return jsonResponse({ error: "Failed to fetch family for baby" }, 500);
  }

  const { data: members, error: membersError } = await supabase
    .from("family_members")
    .select("user_id")
    .eq("family_id", baby.family_id)
    .eq("status", "accepted");

  if (membersError) {
    console.error("notify-live-activity-refresh family members error:", membersError.message);
    return jsonResponse({ error: "Failed to fetch family members" }, 500);
  }

  let userIds = (members ?? []).map((p) => p.user_id);
  if (excludeUserId) {
    userIds = userIds.filter((id) => id !== excludeUserId);
  }
  if (userIds.length === 0) {
    return jsonResponse({ ok: true, sent: 0 }, 200);
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, expo_push_token")
    .in("id", userIds);

  if (profilesError) {
    console.error("notify-live-activity-refresh profiles error:", profilesError.message);
    return jsonResponse({ error: "Failed to fetch push tokens" }, 500);
  }

  const tokens = (profiles ?? [])
    .map((p) => (p as { expo_push_token?: string | null }).expo_push_token)
    .filter((t): t is string => typeof t === "string" && t.startsWith("ExponentPushToken"));

  if (tokens.length === 0) {
    return jsonResponse({ ok: true, sent: 0 }, 200);
  }

  const messages = tokens.map((to) => ({
    to,
    sound: "default" as const,
    title: "Sleep status updated",
    body: "Tap to refresh",
    data: { type: "live_activity_refresh", babyId },
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Expo push error:", res.status, text);
      return jsonResponse({ error: "Failed to send push", detail: text }, 500);
    }

    const result = (await res.json()) as { data?: { status?: string }[] };
    const sent = result?.data?.filter((d) => d?.status === "ok").length ?? 0;
    return jsonResponse({ ok: true, sent }, 200);
  } catch (err) {
    console.error("notify-live-activity-refresh send error:", err);
    return jsonResponse(
      { error: "Failed to send push", detail: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
