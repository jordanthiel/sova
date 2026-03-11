import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Webhook } from 'npm:svix@1';
import { parseSleepCsv, type ParsedSleepRow } from '../_shared/sleepCsvImport.ts';

const RESEND_WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const INBOUND_EMAIL_DOMAIN = Deno.env.get('INBOUND_EMAIL_DOMAIN') ?? '';

const BATCH_SIZE = 50;

interface EmailReceivedData {
  email_id: string;
  from: string;
  to: string[];
  subject?: string;
  attachments?: { id: string; filename: string; content_type?: string }[];
}

interface ResendWebhookEvent {
  type: string;
  data: EmailReceivedData;
}

/** Extract email address from "Name <email@domain.com>" or return as-is. */
function parseFromAddress(from: string): string {
  const trimmed = (from ?? '').trim();
  const match = trimmed.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return trimmed.toLowerCase();
}

/** Extract import code from recipient if it matches import+CODE@domain. */
function extractImportCode(toAddresses: string[], domain: string): string | null {
  const domainLower = domain.toLowerCase().trim();
  for (const addr of toAddresses) {
    const a = (addr ?? '').trim().toLowerCase();
    if (!a.includes('@')) continue;
    const [localPart, host] = a.split('@');
    if (host !== domainLower && !host.endsWith('.' + domainLower)) continue;
    if (localPart.startsWith('import+')) {
      const code = localPart.slice(7).trim();
      if (code) return code;
    }
  }
  return null;
}

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, svix-id, svix-timestamp, svix-signature' } });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const rawBody = await req.text();
  if (!rawBody) {
    return jsonResponse({ error: 'Missing body' }, 400);
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!RESEND_WEBHOOK_SECRET || !svixId || !svixTimestamp || !svixSignature) {
    console.error('Missing webhook secret or Svix headers');
    return jsonResponse({ error: 'Invalid webhook configuration' }, 500);
  }

  let event: ResendWebhookEvent;
  try {
    const wh = new Webhook(RESEND_WEBHOOK_SECRET);
    event = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookEvent;
  } catch (e) {
    console.error('Webhook verification failed:', e);
    return jsonResponse({ error: 'Invalid signature' }, 401);
  }

  if (event.type !== 'email.received') {
    return jsonResponse({ received: true }, 200);
  }

  const { from, to, email_id } = event.data;
  if (!email_id || !to?.length) {
    return jsonResponse({ error: 'Missing email_id or to' }, 400);
  }

  if (!INBOUND_EMAIL_DOMAIN) {
    console.error('INBOUND_EMAIL_DOMAIN not set');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const code = extractImportCode(to, INBOUND_EMAIL_DOMAIN);
  if (!code) {
    return jsonResponse({ error: 'Invalid or expired import address. Use the address from the app.' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: importRow, error: codeError } = await supabase
    .from('sleep_import_codes')
    .select('user_id, baby_id')
    .eq('code', code)
    .single();

  if (codeError || !importRow) {
    return jsonResponse({ error: 'Invalid or expired import address.' }, 400);
  }

  const senderEmail = parseFromAddress(from);
  const { data: profile } = await supabase.from('profiles').select('email, timezone').eq('id', importRow.user_id).single();
  const profileEmail = (profile as { email?: string } | null)?.email?.trim().toLowerCase();
  if (profileEmail !== senderEmail) {
    return jsonResponse({ error: 'Send the email from the account that owns this import address.' }, 403);
  }
  const userTimezone = (profile as { timezone?: string | null } | null)?.timezone?.trim() || 'UTC';

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const listRes = await fetch(`https://api.resend.com/emails/receiving/${email_id}/attachments`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  if (!listRes.ok) {
    console.error('Resend attachments list failed:', listRes.status, await listRes.text());
    return jsonResponse({ error: 'Could not fetch email attachments.' }, 502);
  }

  const listJson = (await listRes.json()) as { data?: Array<{ id: string; filename: string; content_type?: string; download_url: string }> };
  const attachments = listJson.data ?? [];
  const csvAttachment = attachments.find(
    (a) =>
      (a.filename && (a.filename.endsWith('.csv') || a.filename.toLowerCase().endsWith('.csv'))) ||
      (a.content_type && ['text/csv', 'application/csv', 'text/plain'].includes(a.content_type))
  );
  if (!csvAttachment?.download_url) {
    return jsonResponse({ error: 'No CSV attachment found. Attach a sleep export CSV and try again.' }, 400);
  }

  const fileRes = await fetch(csvAttachment.download_url);
  if (!fileRes.ok) {
    console.error('Failed to download attachment:', fileRes.status);
    return jsonResponse({ error: 'Could not download attachment.' }, 502);
  }
  const csvBytes = await fileRes.arrayBuffer();
  const csvText = new TextDecoder('utf-8').decode(csvBytes);

  const { rows, errors: parseErrors } = parseSleepCsv(csvText, userTimezone);
  if (rows.length === 0) {
    const msg = parseErrors.length > 0 ? parseErrors.slice(0, 3).join(' ') : 'No valid sleep rows (Type=Sleep with Start/End).';
    return jsonResponse({ error: `No sleep data found. ${msg}` }, 400);
  }

  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE) as ParsedSleepRow[];
    const inserts = batch.map((r) => ({
      baby_id: importRow.baby_id,
      logged_by: importRow.user_id,
      type: r.type,
      start_time: r.startTime.toISOString(),
      end_time: r.endTime.toISOString(),
      duration_minutes: r.durationMinutes,
      notes: r.notes,
    }));

    const { error: insertError } = await supabase.from('sleep_sessions').insert(inserts);

    if (insertError) {
      failed += batch.length;
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertError.message}`);
    } else {
      imported += batch.length;
    }
  }

  return jsonResponse({ imported, failed, errors }, 200);
});
