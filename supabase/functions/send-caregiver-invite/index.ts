import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INVITE_FROM_EMAIL =
  Deno.env.get("INVITE_FROM_EMAIL") ?? "Sova <onboarding@resend.dev>";

interface RequestBody {
  babyId: string;
  inviteeEmail: string;
  inviteToSignUp?: boolean;
}

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (err) {
    console.error("send-caregiver-invite error:", err);
    return jsonResponse(
      {
        error: "Failed to send invitation email",
        detail: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});

async function handleRequest(req: Request) {
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

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return jsonResponse({ error: "Email service not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { babyId, inviteeEmail, inviteToSignUp } = body;
  if (!babyId || !inviteeEmail || !inviteeEmail.includes("@")) {
    return jsonResponse(
      { error: "babyId and inviteeEmail (valid email) are required" },
      400
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const normalizedEmail = inviteeEmail.trim().toLowerCase();

  // Verify the request is from an authenticated user
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }

  // Fetch baby/family and verify inviter is a family admin.
  const { data: baby, error: babyError } = await supabase
    .from("babies")
    .select("name, family_id")
    .eq("id", babyId)
    .single();

  if (babyError || !baby || !baby.family_id) {
    return jsonResponse({ error: "Baby not found" }, 404);
  }

  const { data: membership } = await supabase
      .from("family_members")
      .select("id")
      .eq("family_id", baby.family_id)
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .eq("role", "admin")
      .maybeSingle();
  if (!membership) {
      return jsonResponse({ error: "Not authorized to invite to this baby" }, 403);
  }

  // For new users: store family invitation by email so signup converts it to a pending family membership.
  if (inviteToSignUp) {
    const { error: insertError } = await supabase
      .from("family_invitations")
      .upsert(
        {
          family_id: baby.family_id,
          email: normalizedEmail,
          invited_by: user.id,
        },
        { onConflict: "family_id,email", ignoreDuplicates: true }
      );
    if (insertError) {
      console.error("family_invitations insert error:", insertError);
      return jsonResponse(
        { error: "Failed to save invitation" },
        500
      );
    }
  }

  // Fetch inviter's display name
  const { data: inviterProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const babyName = baby.name ?? "your baby";
  const inviterName =
    (inviterProfile as { full_name?: string } | null)?.full_name?.trim() ||
    "A family admin";

  const subject = inviteToSignUp
    ? `${inviterName} invited you to join a Sova family`
    : `${inviterName} invited you to join a Sova family`;

  const html = inviteToSignUp
    ? `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;max-width:480px;margin:0 auto;color:#333;">
  <p style="font-size:16px;line-height:1.6;">
    <strong>${inviterName}</strong> invited you to join the family for <strong>${babyName}</strong> in Sova.
  </p>
  <p style="font-size:16px;line-height:1.6;">
    Download the Sova app and sign up with this email address to join the family and access all of that family's babies together.
  </p>
</body>
</html>
`
    : `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;max-width:480px;margin:0 auto;color:#333;">
  <p style="font-size:16px;line-height:1.6;">
    <strong>${inviterName}</strong> invited you to join the family for <strong>${babyName}</strong> in Sova.
  </p>
  <p style="font-size:16px;line-height:1.6;">
    Open the Sova app to accept the invitation and access all babies in the family.
  </p>
  <p style="font-size:14px;color:#666;margin-top:24px;">
    If you don't have the Sova app yet, download it first, create an account with this email address, then you'll be able to accept the invitation.
  </p>
</body>
</html>
`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: INVITE_FROM_EMAIL,
      to: [inviteeEmail.trim().toLowerCase()],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let errDetail: string;
    try {
      const parsed = JSON.parse(errText);
      errDetail = parsed.message || parsed.error || errText;
    } catch {
      errDetail = errText || `HTTP ${res.status}`;
    }
    console.error("Resend API error:", res.status, errDetail);
    return jsonResponse(
      {
        error: "Failed to send invitation email",
        detail: errDetail,
      },
      500
    );
  }

  let result: { id?: string };
  try {
    result = (await res.json()) as { id?: string };
  } catch {
    result = {};
  }
  return jsonResponse({ success: true, id: result?.id }, 200);
}
