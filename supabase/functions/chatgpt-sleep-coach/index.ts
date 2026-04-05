import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─── Environment ─────────────────────────────────────────────────

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
/** Default: Opus 4.6 — override with ANTHROPIC_MODEL if Anthropic renames the API id. */
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-4-6';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// ─── Types ───────────────────────────────────────────────────────

interface SleepSession {
  type: 'nap' | 'night';
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type Provider = 'anthropic' | 'openai' | 'gemini';
type Mode = 'next_sleep' | 'chat' | 'recommendation' | 'nap_evaluation' | 'micro_insight' | 'daily_schedule' | 'forecast' | 'insights_bundle';

interface RequestBody {
  baby_id: string;
  mode?: Mode;
  provider?: Provider;
  message?: string;
  chat_history?: ChatMessage[];
  sleep_history?: SleepSession[];
  baby_age_days?: number;
  current_time?: string;
  timezone?: string;
  last_wake_time?: string | null;
  baby_name?: string;
  user_preferences?: {
    bedtime_type?: 'target' | 'flexible';
    bedtime_target_time?: string | null;
    last_wake_window_minutes?: number | null;
    target_nap_count?: number | null;
    naps_per_day?: number | null;
  };
  memories?: string[];
}

interface EntitlementStatusRow {
  family_id: string;
  has_premium_access: boolean;
  has_subscription_access: boolean;
  is_trial_active: boolean;
  access_source: 'subscription' | 'trial' | 'none';
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_status: 'inactive' | 'active' | 'canceled' | 'past_due' | 'expired';
  subscription_provider: 'revenuecat' | null;
  subscription_product_id: string | null;
  subscription_expires_at: string | null;
}

const PREMIUM_LOCKED_MODES = new Set<Mode>([
  'next_sleep',
  'chat',
  'recommendation',
  'nap_evaluation',
  'micro_insight',
  'daily_schedule',
  'forecast',
  'insights_bundle',
]);

// ─── LLM Abstraction ─────────────────────────────────────────────

function resolveProvider(requested?: Provider): Provider {
  if (requested === 'anthropic' && ANTHROPIC_API_KEY) return 'anthropic';
  if (requested === 'openai' && OPENAI_API_KEY) return 'openai';
  if (requested === 'gemini' && GEMINI_API_KEY) return 'gemini';
  // Default: Anthropic when configured, else OpenAI, else Gemini
  if (ANTHROPIC_API_KEY) return 'anthropic';
  if (OPENAI_API_KEY) return 'openai';
  if (GEMINI_API_KEY) return 'gemini';
  throw new Error('No LLM API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.');
}

interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}

async function callLLM(
  provider: Provider,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: LLMOptions = {}
): Promise<string> {
  if (provider === 'gemini') return callGemini(messages, options);
  if (provider === 'anthropic') return callAnthropic(messages, options);
  return callOpenAI(messages, options);
}

async function callOpenAI(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: LLMOptions = {}
): Promise<string> {
  const { maxTokens = 500, temperature = 0.7, json = false } = options;
  const model = 'gpt-4o';

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: LLMOptions = {}
): Promise<string> {
  const { maxTokens = 500, temperature = 0.7, json = false } = options;
  const model = 'gemini-2.0-flash';

  // Convert messages to Gemini format
  const systemInstruction = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callAnthropic(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: LLMOptions = {}
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  const { maxTokens = 1024, temperature = 0.7, json = false } = options;
  const max_tokens = Math.min(8192, Math.max(maxTokens, 256));

  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const systemWithJson = json
    ? `${system}\n\nReturn ONLY valid JSON (no markdown, no commentary).`
    : system;

  const chatMessages = messages.filter((m) => m.role !== 'system');
  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of chatMessages) {
    const role = m.role === 'assistant' ? 'assistant' as const : 'user' as const;
    const last = merged[merged.length - 1];
    if (last && last.role === role) {
      last.content += '\n\n' + m.content;
    } else {
      merged.push({ role, content: m.content });
    }
  }
  if (merged.length === 0) {
    merged.push({ role: 'user', content: 'Please respond.' });
  }
  if (merged[0].role === 'assistant') {
    merged.unshift({ role: 'user', content: 'Continue.' });
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens,
      temperature,
      system: systemWithJson,
      messages: merged,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const parts = data.content as { type: string; text?: string }[] | undefined;
  if (!Array.isArray(parts)) return '';
  return parts.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
}

// ─── Helpers ─────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), { status, headers: CORS_HEADERS });
}

function premiumLockedResponse(code: 'trial_expired' | 'subscription_required') {
  return new Response(
    JSON.stringify({
      error:
        code === 'trial_expired'
          ? 'Your free trial has ended. Subscribe to keep using AI features.'
          : 'A premium subscription is required for this AI feature.',
      code,
    }),
    {
      status: 402,
      headers: CORS_HEADERS,
    }
  );
}

function extractJsonFromText(raw: string): string {
  let s = raw.trim();
  const open = s.match(/^```(?:json)?\s*\n?/i);
  if (open) s = s.slice(open[0].length);
  const close = s.match(/\n?```\s*$/);
  if (close) s = s.slice(0, -close[0].length);
  s = s.trim();
  if (s && s[0] !== '{') {
    const start = s.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < s.length; i++) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end !== -1) s = s.slice(start, end + 1);
    }
  }
  return s;
}

function fmtTime(dateOrIso: Date | string, tz: string): string {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });
}

function fmtDateTime(dateOrIso: Date | string, tz: string): string {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });
}

function fmtDuration(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return '? min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Age-based wake window reference (minutes). */
function getWakeWindowForAge(ageDays: number): { min: number; max: number; typical: number } {
  if (ageDays < 30) return { min: 45, max: 90, typical: 60 };
  if (ageDays < 60) return { min: 60, max: 120, typical: 90 };
  if (ageDays < 120) return { min: 75, max: 135, typical: 105 };
  if (ageDays < 180) return { min: 120, max: 150, typical: 135 };
  if (ageDays < 270) return { min: 135, max: 180, typical: 150 };
  if (ageDays < 365) return { min: 150, max: 210, typical: 180 };
  return { min: 180, max: 300, typical: 240 };
}

/** Recommended nap count by age. */
function getNapCountForAge(ageDays: number): { min: number; max: number; typical: number } {
  if (ageDays < 120) return { min: 3, max: 5, typical: 4 };
  if (ageDays < 180) return { min: 2, max: 4, typical: 3 };
  if (ageDays < 270) return { min: 2, max: 3, typical: 2 };
  if (ageDays < 450) return { min: 1, max: 2, typical: 2 };
  return { min: 1, max: 1, typical: 1 };
}

/** Max total daytime nap minutes by age. */
function getDayNapBudget(ageDays: number): number {
  if (ageDays < 120) return 210;
  if (ageDays < 270) return 180;
  if (ageDays < 365) return 150;
  return 120;
}

function startOfDayInTimezone(refTime: Date | string, timezone: string): Date {
  const d = typeof refTime === 'string' ? new Date(refTime) : refTime;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)!.value, 10);
  const offsetFromMidnight = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000 + d.getMilliseconds();
  return new Date(d.getTime() - offsetFromMidnight);
}

const NIGHT_SEGMENT_GAP_MS = 2 * 60 * 60 * 1000;

/** Local date key (yyyy-MM-dd) for a timestamp in the given timezone. */
function toLocalDateKey(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Subtract one calendar day from a date key. */
function dateKeyMinusOne(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Simple 0–100 night score from total sleep and wakeup count (mirrors app scoring). */
function simpleNightScore(totalSleepMinutes: number, wakeupCount: number, totalAwakeMinutes: number): number {
  const durationPoints = Math.min(40, Math.max(0, ((totalSleepMinutes - 420) / 270) * 40));
  const wakeupPoints = Math.max(0, 35 - wakeupCount * 9);
  const awakePoints = Math.max(0, 25 - totalAwakeMinutes / 3);
  return Math.round(Math.min(100, Math.max(0, durationPoints + wakeupPoints + awakePoints)));
}

/**
 * Build "schedule → night outcome" summary: what the day-before schedule looked like for
 * the best and worst nights, so we can anchor nap recommendations on trends that led to good night sleep.
 */
function buildScheduleToNightOutcomeBlock(sleepData: SleepSession[], timezone: string): string {
  const nights = sleepData.filter((s) => s.type === 'night' && s.end_time != null && (s.duration_minutes ?? 0) > 0);
  if (nights.length === 0) return '';

  const sorted = [...nights].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const runs: { totalSleep: number; wakeups: number; totalAwake: number; lastEnd: string }[] = [];
  let run: typeof sorted = [];

  for (const s of sorted) {
    const start = new Date(s.start_time).getTime();
    const end = new Date(s.end_time!).getTime();
    const dur = s.duration_minutes ?? Math.round((end - start) / 60000);
    if (run.length === 0) {
      run = [s];
      continue;
    }
    const prevEnd = new Date(run[run.length - 1].end_time!).getTime();
    if (start - prevEnd <= NIGHT_SEGMENT_GAP_MS) {
      run.push(s);
      continue;
    }
    let totalSleep = 0, totalAwake = 0;
    for (let i = 0; i < run.length; i++) {
      totalSleep += run[i].duration_minutes ?? 0;
      if (i > 0) totalAwake += Math.round((new Date(run[i].start_time).getTime() - new Date(run[i - 1].end_time!).getTime()) / 60000);
    }
    runs.push({ totalSleep, wakeups: run.length - 1, totalAwake, lastEnd: run[run.length - 1].end_time! });
    run = [s];
  }
  if (run.length > 0) {
    let totalSleep = 0, totalAwake = 0;
    for (let i = 0; i < run.length; i++) {
      totalSleep += run[i].duration_minutes ?? 0;
      if (i > 0) totalAwake += Math.round((new Date(run[i].start_time).getTime() - new Date(run[i - 1].end_time!).getTime()) / 60000);
    }
    runs.push({ totalSleep, wakeups: run.length - 1, totalAwake, lastEnd: run[run.length - 1].end_time! });
  }

  const naps = sleepData.filter((s) => s.type === 'nap' && s.end_time != null && (s.duration_minutes ?? 0) > 0);
  const entries: { dateKey: string; score: number; totalSleep: number; wakeups: number; prevNapCount: number; prevTotalNapMin: number; prevLastNapEnd: string | null }[] = [];

  for (const r of runs) {
    const lastEnd = new Date(r.lastEnd);
    const shifted = new Date(lastEnd.getTime() - 6 * 60 * 60 * 1000);
    const dateKey = toLocalDateKey(shifted.toISOString(), timezone);
    const prevDayKey = dateKeyMinusOne(dateKey);
    const prevDayNaps = naps.filter((s) => toLocalDateKey(s.start_time, timezone) === prevDayKey);
    const prevNapCount = prevDayNaps.length;
    const prevTotalNapMin = prevDayNaps.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
    const prevLastNapEnd = prevDayNaps.length > 0
      ? prevDayNaps.reduce((latest, s) => (new Date(s.end_time!).getTime() > new Date(latest.end_time!).getTime() ? s : latest)).end_time!
      : null;
    const score = simpleNightScore(r.totalSleep, r.wakeups, r.totalAwake);
    entries.push({ dateKey, score, totalSleep: r.totalSleep, wakeups: r.wakeups, prevNapCount, prevTotalNapMin, prevLastNapEnd });
  }

  if (entries.length === 0) return '';
  const best = entries.filter((e) => e.score >= 70).sort((a, b) => b.score - a.score).slice(0, 5);
  const worst = entries.filter((e) => e.score < 50).sort((a, b) => a.score - b.score).slice(0, 5);

  const lines: string[] = ['--- Schedule → night sleep (anchor recommendations on these trends) ---'];
  if (best.length > 0) {
    const napCounts = best.map((e) => e.prevNapCount);
    const totalMins = best.map((e) => e.prevTotalNapMin);
    const lastEnds = best.filter((e) => e.prevLastNapEnd).map((e) => fmtTime(e.prevLastNapEnd!, timezone));
    lines.push(`Best nights (score ≥70) followed days with: ${napCounts.join(', ')} naps; total nap ~${totalMins.map((m) => fmtDuration(m)).join(', ')}; last nap ended ${lastEnds.length ? 'around ' + [...new Set(lastEnds)].slice(0, 3).join(', ') : 'N/A'}.`);
  }
  if (worst.length > 0) {
    const napCounts = worst.map((e) => e.prevNapCount);
    const totalMins = worst.map((e) => e.prevTotalNapMin);
    lines.push(`Nights that were harder (score <50) followed days with: ${napCounts.join(', ')} naps; total nap ~${totalMins.map((m) => fmtDuration(m)).join(', ')}. Prefer schedules that match the best-night pattern above.`);
  }
  if (best.length === 0 && worst.length === 0) {
    lines.push('Not enough high/low score nights yet; use age-based and historical patterns.');
  }
  return lines.join('\n');
}

function getLastNightTotalMinutes(sleepData: SleepSession[]): number | null {
  const nightSessions = sleepData
    .filter((s) => s.type === 'night' && s.end_time != null && (s.duration_minutes ?? 0) > 0)
    .sort((a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime());
  if (nightSessions.length === 0) return null;
  let total = 0;
  let prevStart = Infinity;
  for (const s of nightSessions) {
    const end = new Date(s.end_time!).getTime();
    const start = new Date(s.start_time).getTime();
    if (prevStart - end > NIGHT_SEGMENT_GAP_MS) break;
    total += s.duration_minutes ?? 0;
    prevStart = start;
  }
  return total > 0 ? total : null;
}

/**
 * Infer today's "morning wake" (end of main night sleep before daytime) for forecast context.
 */
function inferTodayMorningWakeIso(
  sleepData: SleepSession[],
  currentTime: string,
  timezone: string
): string | null {
  const nowMs = new Date(currentTime).getTime();
  const todayKey = toLocalDateKey(currentTime, timezone);
  const napsToday = sleepData
    .filter((s) => s.type === 'nap' && s.end_time != null && toLocalDateKey(s.start_time, timezone) === todayKey)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const firstNapStartMs = napsToday.length > 0 ? new Date(napsToday[0].start_time).getTime() : null;

  const nightsEndingToday = sleepData.filter((s) => {
    if (s.type !== 'night' || !s.end_time) return false;
    if (toLocalDateKey(s.end_time, timezone) !== todayKey) return false;
    const endMs = new Date(s.end_time).getTime();
    if (endMs > nowMs) return false;
    if (firstNapStartMs != null && endMs >= firstNapStartMs) return false;
    return true;
  });

  if (nightsEndingToday.length === 0) return null;

  const sorted = [...nightsEndingToday].sort((a, b) => new Date(a.end_time!).getTime() - new Date(b.end_time!).getTime());
  const chain: SleepSession[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i];
    if (chain.length === 0) {
      chain.unshift(s);
      continue;
    }
    const prev = chain[0];
    const gap = new Date(prev.start_time).getTime() - new Date(s.end_time!).getTime();
    if (gap >= 0 && gap <= NIGHT_SEGMENT_GAP_MS) chain.unshift(s);
    else break;
  }
  const wakeIso = chain.length > 0 ? chain[chain.length - 1].end_time! : sorted[sorted.length - 1].end_time!;
  return wakeIso;
}

/** Compact block for tonight-only forecast: today's wake, naps, last nap / wake window, ongoing status. */
function buildTonightDayPatternSummary(
  sleepData: SleepSession[],
  currentTime: string,
  lastWakeTime: string | null,
  timezone: string,
  babyName: string
): string {
  const nowMs = new Date(currentTime).getTime();
  const todayStart = startOfDayInTimezone(currentTime, timezone);
  const todayKey = toLocalDateKey(currentTime, timezone);

  const morningWake = inferTodayMorningWakeIso(sleepData, currentTime, timezone);
  const wakeSource = lastWakeTime
    ? `Last wake from tracking: ${fmtTime(lastWakeTime, timezone)}`
    : morningWake
    ? `Inferred morning wake (end of night before daytime): ${fmtTime(morningWake, timezone)}`
    : 'Morning wake time: unclear from data (use naps and sessions below)';

  const ongoingNap = sleepData.find((s) => s.type === 'nap' && s.end_time === null);
  const ongoingNight = sleepData.find((s) => s.type === 'night' && s.end_time === null);

  const todayNaps = sleepData.filter((s) => {
    if (s.type !== 'nap') return false;
    return new Date(s.start_time).getTime() >= todayStart.getTime();
  });
  const completedTodayNaps = todayNaps.filter((s) => s.end_time != null);
  let totalNapMin = completedTodayNaps.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
  if (ongoingNap && new Date(ongoingNap.start_time).getTime() >= todayStart.getTime()) {
    totalNapMin += Math.round((nowMs - new Date(ongoingNap.start_time).getTime()) / 60000);
  }
  const napCountForDisplay = completedTodayNaps.length + (ongoingNap && new Date(ongoingNap.start_time).getTime() >= todayStart.getTime() ? 1 : 0);

  let lastNapLine = 'Last nap: none logged yet today';
  if (ongoingNap && new Date(ongoingNap.start_time).getTime() >= todayStart.getTime()) {
    const soFar = Math.round((nowMs - new Date(ongoingNap.start_time).getTime()) / 60000);
    lastNapLine = `Last nap: currently napping (started ${fmtTime(ongoingNap.start_time, timezone)}, ~${fmtDuration(soFar)} so far)`;
  } else if (completedTodayNaps.length > 0) {
    const last = completedTodayNaps.reduce((a, b) =>
      new Date(a.end_time!).getTime() > new Date(b.end_time!).getTime() ? a : b
    );
    lastNapLine = `Last nap ended ${fmtTime(last.end_time!, timezone)} (${fmtDuration(last.duration_minutes)}).`;
  }

  const wakeRef = ongoingNap
    ? ongoingNap.start_time
    : ongoingNight
    ? ongoingNight.start_time
    : lastWakeTime || morningWake;
  let wakeWindowLine = 'Current wake window: unknown (need last sleep end)';
  if (wakeRef) {
    const ww = Math.round((nowMs - new Date(wakeRef).getTime()) / 60000);
    wakeWindowLine = `Time since last sleep ended (wake window context): ${fmtDuration(ww)} (since ${fmtTime(wakeRef, timezone)})`;
  }

  const statusLine = ongoingNight
    ? `*** ${babyName} is asleep for the night right now — forecast describes likely quality/length of THIS ongoing night, not a future night. ***`
    : ongoingNap
    ? `*** ${babyName} is in a nap — bedtime/wake predictions should assume they will wake from this nap first. ***`
    : '';

  return [
    '--- Tonight forecast: focus on THIS local calendar night ---',
    statusLine,
    wakeSource,
    `Daytime so far: ${napCountForDisplay} nap(s), ${fmtDuration(totalNapMin)} total daytime sleep (naps today, incl. ongoing nap if any).`,
    lastNapLine,
    wakeWindowLine,
    `Local "today" date key: ${todayKey}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ─── Tonight forecast JSON (normalized on server) ─────────────────

type NightQuality = 'good' | 'fair' | 'challenging';
type TrendLabel = 'improving' | 'stable' | 'declining' | 'transitioning';
type Confidence = 'high' | 'medium' | 'low';

interface TonightForecastRaw {
  predicted_night_sleep_hours?: unknown;
  bedtime_window_start?: unknown;
  bedtime_window_end?: unknown;
  expected_bedtime?: unknown;
  expected_wakes?: unknown;
  night_quality?: unknown;
  confidence?: unknown;
  summary?: unknown;
  trend?: unknown;
  trend_note?: unknown;
  key_factors?: unknown;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function normalizeTonightForecast(parsed: Record<string, unknown> | null, fallbackSummary: string): {
  predicted_night_sleep_hours: number | null;
  bedtime_window_start: string | null;
  bedtime_window_end: string | null;
  expected_bedtime: string | null;
  expected_wakes: number | null;
  night_quality: NightQuality | null;
  confidence: Confidence;
  summary: string;
  trend: TrendLabel;
  trend_note: string;
  key_factors: string[];
} {
  const empty = {
    predicted_night_sleep_hours: null as number | null,
    bedtime_window_start: null as string | null,
    bedtime_window_end: null as string | null,
    expected_bedtime: null as string | null,
    expected_wakes: null as number | null,
    night_quality: null as NightQuality | null,
    confidence: 'medium' as Confidence,
    summary: fallbackSummary.slice(0, 800),
    trend: 'stable' as TrendLabel,
    trend_note: '',
    key_factors: [] as string[],
  };

  if (!parsed || typeof parsed !== 'object') return empty;

  const p = parsed as TonightForecastRaw;

  let hours: number | null = null;
  if (typeof p.predicted_night_sleep_hours === 'number' && !Number.isNaN(p.predicted_night_sleep_hours)) {
    hours = Math.round(clamp(p.predicted_night_sleep_hours, 3, 14) * 10) / 10;
  }

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, 32) : null;

  let wakes: number | null = null;
  if (typeof p.expected_wakes === 'number' && !Number.isNaN(p.expected_wakes)) {
    wakes = Math.round(clamp(p.expected_wakes, 0, 12));
  }

  const nq = p.night_quality;
  let nightQuality: NightQuality | null = null;
  if (nq === 'good' || nq === 'fair' || nq === 'challenging') nightQuality = nq;

  const conf = p.confidence;
  let confidence: Confidence = 'medium';
  if (conf === 'high' || conf === 'medium' || conf === 'low') confidence = conf;

  const tr = p.trend;
  let trend: TrendLabel = 'stable';
  if (tr === 'improving' || tr === 'stable' || tr === 'declining' || tr === 'transitioning') trend = tr;

  const summary = typeof p.summary === 'string' && p.summary.trim().length > 5 ? p.summary.trim().slice(0, 600) : empty.summary;

  const trend_note =
    typeof p.trend_note === 'string' && p.trend_note.trim().length > 0 ? p.trend_note.trim().slice(0, 280) : '';

  let key_factors: string[] = [];
  if (Array.isArray(p.key_factors)) {
    key_factors = p.key_factors
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim().slice(0, 200))
      .slice(0, 4);
  }
  if (key_factors.length < 2) {
    const pad = ['Recent nap timing and total daytime sleep', 'Typical night pattern for this age'];
    for (const line of pad) {
      if (key_factors.length >= 2) break;
      if (!key_factors.includes(line)) key_factors.push(line);
    }
    key_factors = key_factors.slice(0, 4);
  }

  return {
    predicted_night_sleep_hours: hours,
    bedtime_window_start: str(p.bedtime_window_start),
    bedtime_window_end: str(p.bedtime_window_end),
    expected_bedtime: str(p.expected_bedtime),
    expected_wakes: wakes,
    night_quality: nightQuality,
    confidence,
    summary,
    trend,
    trend_note: trend_note || summary.split('. ')[0] || summary,
    key_factors,
  };
}

// ─── Context Builder ─────────────────────────────────────────────

function buildSleepContext(
  sleepData: SleepSession[],
  currentTime: string,
  lastWakeTime: string | null,
  ageDays: number,
  babyName: string,
  timezone: string
) {
  const ageWeeks = Math.floor(ageDays / 7);
  const ageMonths = Math.floor(ageDays / 30);
  const todayStart = startOfDayInTimezone(currentTime, timezone);
  const wakeWindows = getWakeWindowForAge(ageDays);
  const napCount = getNapCountForAge(ageDays);
  const napBudget = getDayNapBudget(ageDays);
  const nowMs = new Date(currentTime).getTime();

  const ongoingNap = sleepData.find((s) => s.type === 'nap' && s.end_time === null);
  const ongoingNight = sleepData.find((s) => s.type === 'night' && s.end_time === null);

  const todaySessions = sleepData.filter((s) => {
    const sessionDate = new Date(s.start_time);
    return sessionDate >= todayStart;
  });

  const todayNapsCompleted = todaySessions.filter((s) => s.type === 'nap' && s.end_time !== null);
  let totalNapMinutes = todayNapsCompleted.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  if (ongoingNap && new Date(ongoingNap.start_time).getTime() >= todayStart.getTime()) {
    totalNapMinutes += Math.round((nowMs - new Date(ongoingNap.start_time).getTime()) / 60000);
  }
  const todayNapCountDisplay =
    todayNapsCompleted.length + (ongoingNap && new Date(ongoingNap.start_time).getTime() >= todayStart.getTime() ? 1 : 0);
  const lastNightTotalMinutes = getLastNightTotalMinutes(sleepData);

  // Compute average nap durations and wake windows from history
  const completedNaps = sleepData.filter((s) => s.type === 'nap' && s.end_time && s.duration_minutes && s.duration_minutes > 0);
  const avgNapDuration = completedNaps.length > 0
    ? Math.round(completedNaps.slice(0, 20).reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / Math.min(completedNaps.length, 20))
    : null;

  // Compute observed DAYTIME wake windows (gaps between naps, or between night-end and first nap)
  // Exclude gaps between night segments (which are night wakes, not true wake windows)
  const sortedSessions = [...sleepData]
    .filter((s) => s.end_time != null)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const observedWakeWindows: number[] = [];
  for (let i = 1; i < sortedSessions.length; i++) {
    const prev = sortedSessions[i - 1];
    const curr = sortedSessions[i];
    // Skip gaps between consecutive night segments (night wakes)
    if (prev.type === 'night' && curr.type === 'night') continue;
    const prevEnd = new Date(prev.end_time!).getTime();
    const currStart = new Date(curr.start_time).getTime();
    const gap = Math.round((currStart - prevEnd) / 60000);
    if (gap > 15 && gap < 480) observedWakeWindows.push(gap);
  }
  const avgWakeWindow = observedWakeWindows.length > 0
    ? Math.round(observedWakeWindows.reduce((a, b) => a + b, 0) / observedWakeWindows.length)
    : null;

  // Count naps per day over last 7 days
  const sevenDaysAgo = new Date(new Date(currentTime).getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentDayNaps = sleepData.filter(
    (s) => s.type === 'nap' && s.end_time && new Date(s.start_time) >= sevenDaysAgo
  );
  const napsByDay: Record<string, number> = {};
  for (const s of recentDayNaps) {
    const dayKey = new Date(s.start_time).toISOString().slice(0, 10);
    napsByDay[dayKey] = (napsByDay[dayKey] || 0) + 1;
  }
  const daysWithNaps = Object.keys(napsByDay).length;
  const avgNapsPerDay = daysWithNaps > 0
    ? (Object.values(napsByDay).reduce((a, b) => a + b, 0) / daysWithNaps).toFixed(1)
    : null;

  const awakeMinutes = lastWakeTime
    ? Math.round((new Date(currentTime).getTime() - new Date(lastWakeTime).getTime()) / 60000)
    : null;

  const activeStatusLines: string[] = [];
  if (ongoingNight) {
    const soFarMin = Math.round((nowMs - new Date(ongoingNight.start_time).getTime()) / 60000);
    activeStatusLines.push(
      '*** CURRENT STATUS (CRITICAL) ***',
      `${babyName} is CURRENTLY ASLEEP for NIGHT SLEEP — started ${fmtDateTime(ongoingNight.start_time, timezone)} (ongoing, ~${fmtDuration(soFarMin)} on the clock).`,
      'Formal "last wake" in the data is NOT the present state — night sleep has already begun.',
      'Do NOT recommend a new bedtime tonight, naps remaining today, or a schedule that assumes baby is awake right now.',
      'For daily_schedule JSON: set "suggested_bedtime" to null, omit "bedtime" events, use an empty "schedule" array unless you list only post-wake tomorrow items, and explain in "notes".',
    );
  } else if (ongoingNap) {
    const soFarMin = Math.round((nowMs - new Date(ongoingNap.start_time).getTime()) / 60000);
    activeStatusLines.push(
      '*** CURRENT STATUS (CRITICAL) ***',
      `${babyName} is CURRENTLY IN AN ONGOING NAP — started ${fmtDateTime(ongoingNap.start_time, timezone)} (~${fmtDuration(soFarMin)} so far).`,
      'Project the next event as waking from this nap (nap_end), then continue with realistic times for the rest of the day.',
    );
  }
  const activeStatusBlock = activeStatusLines.length > 0 ? `${activeStatusLines.join('\n')}\n\n` : '';

  return {
    todayNaps: todayNapsCompleted,
    totalNapMinutes,
    lastNightTotalMinutes,
    wakeWindows,
    napBudget,
    contextBlock: `${activeStatusBlock}Baby: ${babyName}, ${ageWeeks} weeks (${ageMonths} months, ${ageDays} days old)
Timezone: ${timezone}
Current local time: ${fmtTime(currentTime, timezone)}
${ongoingNight ? 'Baby is asleep for the night right now (see CURRENT STATUS).\n' : ''}${lastWakeTime ? `Last wake before current sleep (from data): ${fmtTime(lastWakeTime, timezone)} (${awakeMinutes != null ? fmtDuration(awakeMinutes) + ' before current time' : 'unknown'})` : 'Last wake time: unknown'}

--- Today's sleep ---
Naps today: ${todayNapCountDisplay} (${fmtDuration(totalNapMinutes)} total; includes current nap duration if napping now)
${lastNightTotalMinutes != null ? `Last night total: ${fmtDuration(lastNightTotalMinutes)}` : 'No night sleep data yet'}

--- Age-based reference ranges ---
Wake window range: ${fmtDuration(wakeWindows.min)} – ${fmtDuration(wakeWindows.max)} (typical: ${fmtDuration(wakeWindows.typical)})
Nap count range: ${napCount.min}–${napCount.max} naps/day (typical: ${napCount.typical})
Total daytime nap budget: ~${fmtDuration(napBudget)} (use to set nap caps so total day stays on goal)
Remaining nap budget today: ${fmtDuration(Math.max(0, napBudget - totalNapMinutes))} (cap this nap so today's total stays within budget)

--- Historical patterns (from recent data) ---
${avgNapDuration != null ? `Average nap duration: ${fmtDuration(avgNapDuration)} (reference only; do not use as nap cap — set cap from budget and best-night patterns)` : 'Avg nap duration: insufficient data'}
${avgWakeWindow != null ? `Average observed wake window: ${fmtDuration(avgWakeWindow)} (reference only — do not use this alone to pick the next nap; weigh age norms, nap-count plan, best-night patterns, and whether baby may be over/undertired)` : 'Avg wake window: insufficient data'}
${avgNapsPerDay != null ? `Average naps/day (last 7d): ${avgNapsPerDay}` : 'Naps/day: insufficient data'}
${observedWakeWindows.length > 3 ? `Recent wake windows: ${observedWakeWindows.slice(-6).map((w) => fmtDuration(w)).join(', ')}` : ''}
${buildScheduleToNightOutcomeBlock(sleepData, timezone)}

--- Recent sessions (newest first) ---
${sleepData.slice(0, 15).map((s) => `${s.type} ${fmtDateTime(s.start_time, timezone)} -> ${s.end_time ? fmtDateTime(s.end_time, timezone) : 'ongoing'} (${fmtDuration(s.duration_minutes)})`).join('\n')}`,
  };
}

function buildPreferencesBlock(body: RequestBody): string {
  const prefs = body.user_preferences;
  const memories = body.memories;
  const parts: string[] = [];
  if (prefs) {
    if (prefs.bedtime_type === 'target' && prefs.bedtime_target_time) {
      const [h, m] = prefs.bedtime_target_time.split(':').map(Number);
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? 'PM' : 'AM';
      parts.push(`Parent's target bedtime: ${hour12}:${String(m).padStart(2, '0')} ${ampm}`);
    }
    if (prefs.last_wake_window_minutes != null && prefs.last_wake_window_minutes > 0) {
      parts.push(`Parent's preferred last wake window before bed: ${fmtDuration(prefs.last_wake_window_minutes)}`);
    }
    if (prefs.target_nap_count != null) {
      parts.push(
        `Parent's target nap count: ${prefs.target_nap_count} (treat as the day's plan — total naps for today should match this unless impossible; explain in reasoning if you must deviate)`
      );
    }
    if (prefs.naps_per_day != null) {
      parts.push(`Baby's profile naps/day setting: ${prefs.naps_per_day}`);
    }
  }
  if (memories?.length) {
    parts.push(`Coach memories from past conversations:\n${memories.map((m) => `  - ${m}`).join('\n')}`);
  }
  if (parts.length === 0) return '';
  return `\n--- Parent preferences & context ---\n${parts.join('\n')}`;
}

function getUtcOffsetMinutesAt(anchorIso: string, timezone: string): number {
  const nowDate = new Date(anchorIso);
  const tzParts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(nowDate);
  const localHour = parseInt(tzParts.find((p) => p.type === 'hour')!.value, 10);
  const localMin = parseInt(tzParts.find((p) => p.type === 'minute')!.value, 10);
  return (localHour * 60 + localMin) - (nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes());
}

/** Parse "h:mm AM/PM" on the same local calendar day as anchorIso (timezone). */
function parseAmPmOnLocalCalendarDay(timeStr: string, anchorIso: string, timezone: string): number | null {
  const trimmed = String(timeStr).trim().replace(/\s*\(.*\)\s*$/, '');
  const amPmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!amPmMatch) return null;
  let h = parseInt(amPmMatch[1], 10);
  const m = parseInt(amPmMatch[2], 10);
  if (amPmMatch[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (amPmMatch[3].toUpperCase() === 'AM' && h === 12) h = 0;
  const nowDate = new Date(anchorIso);
  const utcOffsetMin = getUtcOffsetMinutesAt(anchorIso, timezone);
  return new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), h, m, 0).getTime() - utcOffsetMin * 60000;
}

function formatLocalAmPm(ms: number, timezone: string): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone });
}

function earliestBedtimeMinutesFromMidnight(ageDays: number): number {
  if (ageDays < 120) return 17 * 60 + 30;
  if (ageDays < 365) return 18 * 60;
  return 18 * 60 + 30;
}

function parentTargetBedtimeMinutesFromMidnight(body: RequestBody): number | null {
  const p = body.user_preferences;
  if (p?.bedtime_type !== 'target' || !p.bedtime_target_time) return null;
  const [h, m] = p.bedtime_target_time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Fix impossible bedtimes and per-nap caps before returning to the app. */
function sanitizeNextSleepSchedule(
  parsed: Record<string, unknown>,
  body: RequestBody,
  currentTimeIso: string,
  timezone: string,
  ageDays: number,
  wakeWin: { min: number; max: number; typical: number }
): void {
  if (parsed.should_cap_nap !== false && typeof parsed.cap_at_minutes === 'number' && parsed.cap_at_minutes > 0) {
    const c = Math.round(parsed.cap_at_minutes / 5) * 5;
    parsed.cap_at_minutes = Math.min(180, Math.max(15, c));
  }

  const sched = parsed.rest_of_day_schedule;
  if (!Array.isArray(sched) || sched.length === 0) return;

  const ageEarliestMin = earliestBedtimeMinutesFromMidnight(ageDays);
  const parentBedMin = parentTargetBedtimeMinutesFromMidnight(body);
  const floorClockMin =
    parentBedMin != null ? Math.min(ageEarliestMin, parentBedMin) : ageEarliestMin;

  const minLastWakeMin = Math.max(
    45,
    body.user_preferences?.last_wake_window_minutes != null && body.user_preferences.last_wake_window_minutes > 0
      ? body.user_preferences.last_wake_window_minutes
      : Math.min(180, Math.round(wakeWin.typical * 0.65))
  );

  for (const e of sched) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    if (o.event === 'nap_start' && typeof o.cap_minutes === 'number' && o.cap_minutes > 0) {
      const c = Math.round(o.cap_minutes / 5) * 5;
      o.cap_minutes = Math.min(180, Math.max(15, c));
    }
  }

  const bedtimeIdx = sched.findIndex((x) => x && typeof x === 'object' && (x as { event?: string }).event === 'bedtime');
  if (bedtimeIdx < 0) return;

  let lastNapEndMs: number | null = null;
  for (let i = bedtimeIdx - 1; i >= 0; i--) {
    const ev = sched[i] as Record<string, unknown>;
    if (ev?.event === 'nap_end' && typeof ev.time === 'string') {
      const ms = parseAmPmOnLocalCalendarDay(ev.time, currentTimeIso, timezone);
      if (ms != null) {
        lastNapEndMs = ms;
        break;
      }
    }
  }

  const bedEv = sched[bedtimeIdx] as Record<string, unknown>;
  if (typeof bedEv.time !== 'string') return;

  let bedMs = parseAmPmOnLocalCalendarDay(bedEv.time, currentTimeIso, timezone);
  if (bedMs == null) return;

  const anchorMs = new Date(currentTimeIso).getTime();
  const nowDate = new Date(currentTimeIso);
  const utcOffsetMin = getUtcOffsetMinutesAt(currentTimeIso, timezone);
  const fh = Math.floor(floorClockMin / 60);
  const fm = floorClockMin % 60;
  const floorMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), fh, fm, 0).getTime() - utcOffsetMin * 60000;

  let targetMs = bedMs;
  if (targetMs < floorMs) {
    console.warn('[next_sleep] Bedtime earlier than floor; bumping', { was: bedEv.time, floorClockMin });
    targetMs = floorMs;
  }

  if (lastNapEndMs != null) {
    const needMs = lastNapEndMs + minLastWakeMin * 60000;
    if (targetMs < needMs) {
      console.warn('[next_sleep] Last wake before bed too short; bumping bedtime', { minLastWakeMin });
      targetMs = needMs;
    }
  }

  if (targetMs < anchorMs + 10 * 60000) {
    console.warn('[next_sleep] Bedtime in the past or implausibly soon; nudging forward');
    targetMs = Math.max(targetMs, anchorMs + 25 * 60000);
  }

  const newLabel = formatLocalAmPm(targetMs, timezone);
  if (newLabel !== bedEv.time) {
    bedEv.time = newLabel;
  }
}

// ─── Next Sleep Handler ──────────────────────────────────────────

async function handleNextSleep(
  body: RequestBody,
  sleepData: SleepSession[],
  babyName: string,
  babyAgeDays: number,
  provider: Provider
) {
  const {
    current_time = new Date().toISOString(),
    timezone = 'UTC',
    last_wake_time = null,
  } = body;

  const ctx = buildSleepContext(sleepData, current_time, last_wake_time, babyAgeDays, babyName, timezone);
  const preferencesBlock = buildPreferencesBlock(body);
  const { wakeWindows } = ctx;
  const napsCompletedToday = ctx.todayNaps.length;
  const parentTargetNaps = body.user_preferences?.target_nap_count;
  const earliestReasonableBedtime =
    babyAgeDays < 120 ? '5:30 PM' : babyAgeDays < 365 ? '6:00 PM' : '6:30 PM';
  const parentNapPlanBlock =
    parentTargetNaps != null && parentTargetNaps >= 1 && parentTargetNaps <= 6
      ? `\nPARENT NAP-COUNT PLAN (must follow unless unsafe or impossible): Target ${parentTargetNaps} total naps today. ${napsCompletedToday} already completed. Your rest_of_day_schedule should add up to that target (remaining nap starts before bedtime = ${parentTargetNaps} − ${napsCompletedToday}). If you must deviate (e.g. too late for another nap), say so clearly in reasoning.\n`
      : '';

  const systemMessage = `You are an expert pediatric sleep consultant. Analyze this baby's sleep data and recommend the ideal next sleep.

Use the baby's ACTUAL historical patterns — nap durations, wake windows, nap counts, night sleep — to drive your recommendation. Only fall back to age-based norms when data is insufficient. You are the expert: use your judgment on wake windows, nap caps, and schedule shape based on what the data tells you about THIS baby.

NEXT NAP TIMING — Do not anchor solely on "average observed wake window" or a single number. Use the full picture: age-appropriate ranges, how today has gone, nap-count plan (including parent target if given), schedule→night patterns, and whether a shorter or longer wake window fits (e.g. early nap after rough night vs. stretched window when well-rested). Your wake_window_minutes must reflect the schedule you are recommending, not only a historical average.


NAP CAP (critical): cap_at_minutes and each rest_of_day_schedule cap_minutes are the MAXIMUM duration that nap should be allowed — the true upper limit. If the baby sleeps that long, the parent should wake them. Do NOT set the cap to the baby's average nap length. Set it to the longest this nap should run to: (1) protect night sleep and (2) hit the daytime nap goal (total day within nap budget, and aligned with the total that preceded best nights). Use remaining budget for the day and nap position (later naps = shorter caps). First nap can have a longer cap; last nap of the day should be shortest. You decide the cap based on age, schedule, and best-night patterns — no fixed ceiling. Round caps to the nearest 5 minutes.

BEDTIME REALISM (critical): Do not suggest an unrealistically early bedtime after a short nap chain. For this age, avoid bedtime earlier than about ${earliestReasonableBedtime} unless there is a clear reason (e.g., severe overtiredness, very poor prior night, explicit parent target earlier than this, illness/disruption). If you recommend an earlier bedtime anyway, explicitly justify it in reasoning.

CONSTRAINTS (hard limits only):
- All times in ${timezone}
- Age wake window reference: typical ${wakeWindows.typical} min, usual range about ${wakeWindows.min}–${wakeWindows.max} min — you may recommend outside the usual range when justified (e.g. shorter if overtired, longer if undertired), and explain why in reasoning
- recommended_time must equal the first nap_start (or bedtime) event in rest_of_day_schedule
- If it's too late for a nap (not enough time for nap + wake window before bedtime), recommend bedtime
- Total daytime nap minutes should stay within the nap budget
- Round times to the nearest 5 minutes and cap_at_minutes to the nearest 5
- wake_window_minutes must be in MINUTES (e.g. 150 for 2h30m, not 2.5)

INTERNAL CONSISTENCY (do this before you output JSON):
- rest_of_day_schedule must be strictly chronological; each nap_start → nap_end → next nap_start (or bedtime) with realistic gaps
- After the final nap_end, leave at least a full last wake window before bedtime (use parent last_wake_window if given, otherwise a typical last window for this age — not 20–30 minutes unless baby is a newborn and you justify it)
- Bedtime must not be wildly earlier than a normal evening bedtime for this age (see BEDTIME REALISM above) unless you justify it
- Per-nap cap_minutes: keep between 15 and 180; do not invent multi-hour "micro naps" that imply a 4pm bedtime after one short nap unless data strongly supports it

${parentNapPlanBlock}${ctx.contextBlock}${preferencesBlock}

Return a JSON object:
{
  "recommended_time": "HH:MM AM/PM",
  "sleep_type": "nap" | "bedtime",
  "expected_duration_minutes": number,
  "minutes_from_now": number,
  "urgency": "now" | "soon" | "upcoming" | "not_yet",
  "headline": "short 4-6 word headline",
  "should_cap_nap": boolean,
  "cap_at_minutes": number | null,
  "wake_window_minutes": number (the wake window for the current period, in minutes),
  "summary": "1-2 sentence explanation referencing the baby's actual patterns.",
  "reasoning": "2-3 paragraphs: (a) what the data tells you about this baby, including how today's plan aligns with the schedule patterns that led to the best night sleep scores; (b) why you chose this wake window and cap for this nap; (c) walk through the rest-of-day plan.",
  "cap_reason": "Why this maximum (e.g. to protect night sleep, keep total day within budget / best-night pattern). null if should_cap_nap is false.",
  "rest_of_day_schedule": [
    { "time": "HH:MM AM/PM", "event": "nap_start" | "nap_end" | "bedtime", "label": "e.g. Nap 2 start", "note": "optional", "cap_minutes": number | null (nap_start only: cap for this specific nap), "wake_window_minutes": number | null (nap_start/bedtime only: wake window leading to this event) }
  ]
}

SCHEDULE RULES:
- Number naps based on how many already happened today. If 1 done, next is Nap 2.
- If a parent nap-count target is given above, the full day should reflect that total (completed + planned), unless you recommend bedtime next because the target is already met or time does not allow another nap.
- Include recommended sleep as first event, then all events through bedtime.
- Bedtime should usually not be earlier than ${earliestReasonableBedtime}; if earlier, include a clear reason in reasoning.
- Chronologically ordered.
- "urgency": "now" = 0-5 min or overdue, "soon" = 5-15 min, "upcoming" = 15-60 min, "not_yet" = 60+ min.

Return ONLY valid JSON.`;

  const responseText = await callLLM(
    provider,
    [
      { role: 'system', content: systemMessage },
      { role: 'user', content: `What should ${babyName}'s next sleep be? Analyze the historical data, determine the ideal wake window, plan the rest of the day, and give me your recommendation with full reasoning.` },
    ],
    { maxTokens: 2000, temperature: 0.25, json: true }
  );

  const jsonStr = extractJsonFromText(responseText);
  if (!jsonStr || jsonStr.length < 2) {
    console.error('Next sleep: empty response from model', { responseLength: responseText?.length ?? 0 });
    return { next_sleep: null, error: 'AI returned no usable response', provider };
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';
    const reasoning = typeof parsed?.reasoning === 'string' ? parsed.reasoning.trim() : '';
    if (summary.length < 10) {
      return { next_sleep: null, error: 'AI must provide a summary for the recommendation', provider };
    }
    if (reasoning.length < 30) {
      return { next_sleep: null, error: 'AI must provide reasoning for the recommendation', provider };
    }
    if (parsed.should_cap_nap && (!parsed.cap_reason || String(parsed.cap_reason).trim() === '')) {
      return { next_sleep: null, error: 'AI must provide cap_reason when recommending a cap', provider };
    }

    // Auto-correct: if wake_window_minutes looks like hours (< 10), convert to minutes
    if (typeof parsed.wake_window_minutes === 'number' && parsed.wake_window_minutes > 0 && parsed.wake_window_minutes < 10) {
      console.warn(`wake_window_minutes=${parsed.wake_window_minutes} looks like hours, converting to minutes`);
      parsed.wake_window_minutes = Math.round(parsed.wake_window_minutes * 60);
    }

    // Round cap_at_minutes to nearest 5
    if (typeof parsed.cap_at_minutes === 'number' && parsed.cap_at_minutes > 0) {
      parsed.cap_at_minutes = Math.round(parsed.cap_at_minutes / 5) * 5;
    }

    // Safety floor only: allow LLM-chosen WW below age "min" when justified; only fix absurdly short gaps
    const WAKE_GAP_ABSOLUTE_FLOOR_MIN = 25;
    if (typeof parsed.wake_window_minutes === 'number' && parsed.wake_window_minutes > 0 &&
        parsed.wake_window_minutes < WAKE_GAP_ABSOLUTE_FLOOR_MIN) {
      console.warn(`wake_window_minutes=${parsed.wake_window_minutes} below safety floor ${WAKE_GAP_ABSOLUTE_FLOOR_MIN}, clamping`);
      parsed.wake_window_minutes = WAKE_GAP_ABSOLUTE_FLOOR_MIN;
    }
    if (typeof parsed.wake_window_minutes === 'number' && parsed.wake_window_minutes > wakeWindows.max) {
      parsed.wake_window_minutes = wakeWindows.max;
    }

    // Only bump recommended_time if implied gap is unrealistically short (do not force age-typical WW)
    if (last_wake_time && parsed.recommended_time) {
      const lastWakeMs = new Date(last_wake_time).getTime();
      // Parse recommended_time to a Date
      const recTimeStr = String(parsed.recommended_time).trim().replace(/\s*\(.*\)\s*$/, '');
      const amPmMatch = recTimeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (amPmMatch) {
        let h = parseInt(amPmMatch[1], 10);
        const m = parseInt(amPmMatch[2], 10);
        if (amPmMatch[3].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (amPmMatch[3].toUpperCase() === 'AM' && h === 12) h = 0;
        // Build a Date in UTC from the timezone-local time
        const nowDate = new Date(current_time);
        const tzParts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(nowDate);
        const localHour = parseInt(tzParts.find(p => p.type === 'hour')!.value, 10);
        const localMin = parseInt(tzParts.find(p => p.type === 'minute')!.value, 10);
        const utcOffsetMin = (localHour * 60 + localMin) - (nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes());
        const recUtcMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), h, m, 0).getTime() - utcOffsetMin * 60000;
        const impliedWW = Math.round((recUtcMs - lastWakeMs) / 60000);

        if (impliedWW < WAKE_GAP_ABSOLUTE_FLOOR_MIN) {
          const correctedMs = lastWakeMs + WAKE_GAP_ABSOLUTE_FLOOR_MIN * 60000;
          const correctedDate = new Date(correctedMs);
          const correctedLocal = correctedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone });
          console.warn(`Recommended time implies ${impliedWW}m wake window (floor ${WAKE_GAP_ABSOLUTE_FLOOR_MIN}m). Bumping from ${parsed.recommended_time} to ${correctedLocal}`);
          parsed.recommended_time = correctedLocal;
          parsed.minutes_from_now = Math.round((correctedMs - new Date(current_time).getTime()) / 60000);
          if (parsed.minutes_from_now <= 5) parsed.urgency = 'now';
          else if (parsed.minutes_from_now <= 15) parsed.urgency = 'soon';
          else if (parsed.minutes_from_now <= 60) parsed.urgency = 'upcoming';
          else parsed.urgency = 'not_yet';
        }
      }
    }

    // Normalize rest_of_day_schedule
    if (!Array.isArray(parsed.rest_of_day_schedule)) {
      parsed.rest_of_day_schedule = [];
    }
    parsed.rest_of_day_schedule = parsed.rest_of_day_schedule
      .filter((e: unknown) => e && typeof e === 'object' && typeof (e as any).time === 'string' && typeof (e as any).label === 'string')
      .map((e: any) => {
        const entry: Record<string, unknown> = {
          time: String(e.time).trim(),
          event: typeof e.event === 'string' ? e.event : 'nap_start',
          label: String(e.label).trim(),
          note: typeof e.note === 'string' ? e.note.trim() : undefined,
        };
        // Preserve per-event cap and wake window
        if (typeof e.cap_minutes === 'number' && e.cap_minutes > 0) {
          entry.cap_minutes = Math.round(e.cap_minutes / 5) * 5;
        }
        if (typeof e.wake_window_minutes === 'number' && e.wake_window_minutes > 0) {
          entry.wake_window_minutes = Math.max(25, Math.min(wakeWindows.max, e.wake_window_minutes));
        }
        return entry;
      });


    // First nap of day: align recommended_time with first nap in schedule when LLM said "now" but schedule has a later ideal time
    const nowMs = new Date(current_time).getTime();
    const firstNapInSchedule = parsed.rest_of_day_schedule.find((e: { event?: string }) => e.event === 'nap_start');
    if (last_wake_time && firstNapInSchedule?.time) {
      const recTimeStr = String(parsed.recommended_time || '').trim();
      const amPmRec = recTimeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (amPmRec) {
        let recH = parseInt(amPmRec[1], 10);
        const recM = parseInt(amPmRec[2], 10);
        if (amPmRec[3].toUpperCase() === 'PM' && recH !== 12) recH += 12;
        if (amPmRec[3].toUpperCase() === 'AM' && recH === 12) recH = 0;
        const nowDate = new Date(current_time);
        const tzParts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(nowDate);
        const utcOffsetMin = (parseInt(tzParts.find((p: { type: string }) => p.type === 'hour')!.value, 10) * 60 + parseInt(tzParts.find((p: { type: string }) => p.type === 'minute')!.value, 10)) - (nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes());
        const recMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), recH, recM, 0).getTime() - utcOffsetMin * 60000;
        const scheduleTimeStr = String(firstNapInSchedule.time).trim();
        const amPmSched = scheduleTimeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (amPmSched) {
          let schedH = parseInt(amPmSched[1], 10);
          const schedMin = parseInt(amPmSched[2], 10);
          if (amPmSched[3].toUpperCase() === 'PM' && schedH !== 12) schedH += 12;
          if (amPmSched[3].toUpperCase() === 'AM' && schedH === 12) schedH = 0;
          const schedMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), schedH, schedMin, 0).getTime() - utcOffsetMin * 60000;
          const lastWakeMs = new Date(last_wake_time).getTime();
          const recMinsFromNow = (recMs - nowMs) / 60000;
          const schedMinsFromNow = (schedMs - nowMs) / 60000;
          const schedWakeWindow = (schedMs - lastWakeMs) / 60000;
          if (schedMinsFromNow >= 20 && recMinsFromNow < 30 && schedWakeWindow >= 25) {
            parsed.recommended_time = firstNapInSchedule.time;
            parsed.minutes_from_now = Math.round(schedMinsFromNow);
            if (parsed.minutes_from_now <= 5) parsed.urgency = 'now';
            else if (parsed.minutes_from_now <= 15) parsed.urgency = 'soon';
            else if (parsed.minutes_from_now <= 60) parsed.urgency = 'upcoming';
            else parsed.urgency = 'not_yet';
          }
        }
      }
    }

    sanitizeNextSleepSchedule(parsed, body, current_time, timezone, babyAgeDays, wakeWindows);

    return { next_sleep: parsed, provider };
  } catch (e) {
    console.error('Next sleep parse failed', e);
    console.error('Response preview', typeof responseText === 'string' ? responseText.slice(0, 500) : String(responseText));
    return { next_sleep: null, error: 'Failed to parse AI response', provider };
  }
}

// ─── Chat Handler ────────────────────────────────────────────────

async function handleChat(
  body: RequestBody,
  sleepData: SleepSession[],
  babyName: string,
  babyAgeDays: number,
  userId: string | null,
  provider: Provider
) {
  const {
    message,
    chat_history = [],
    current_time = new Date().toISOString(),
    timezone = 'UTC',
    last_wake_time = null,
  } = body;

  const ctx = buildSleepContext(sleepData, current_time, last_wake_time, babyAgeDays, babyName, timezone);
  const preferencesBlock = buildPreferencesBlock(body);

  const systemMessage = `You are a warm, empathetic, and knowledgeable baby sleep coach. You're having a conversation with a parent about their baby's sleep. All times should be in the user's local timezone (${timezone}).

Current context:
${ctx.contextBlock}${preferencesBlock}

Be conversational, supportive, and practical. Keep responses concise but helpful. When giving advice, reference the baby's actual data when available.`;

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemMessage },
    ...chat_history.slice(-10).map((m) => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.content })),
  ];

  if (message) {
    messages.push({ role: 'user', content: message });
  } else if (chat_history.length === 0) {
    messages.push({ role: 'user', content: "Can you give me an overview of my baby's sleep schedule and any recommendations?" });
  }

  const responseText = await callLLM(provider, messages, { maxTokens: 600 });

  // Extract memories only when the assistant suggested a change/recommendation or the user asked to remember something
  let suggested_memories: string[] = [];
  if (message && responseText) {
    const memoryText = await callLLM(
      provider,
      [
        {
          role: 'system',
          content: `You are a memory extractor for a baby sleep coach app. Only suggest memories when ONE of these is true:
1) The assistant suggested a specific change or recommendation (schedule, routine, timing, etc.) and the user agreed or indicated they will follow it.
2) The user explicitly asked to remember something, stated a preference to save, or said something like "we're doing X" / "remember that" / "note that".

Do NOT suggest memories for: general Q&A, casual chat, one-off questions, or when the user merely shared info without the assistant recommending a change and without the user asking to remember. In those cases return {"memories": []}.

When you do suggest memories: extract 0-3 short sentences — only what the parent stated or clearly agreed to. Return JSON: {"memories": ["memory 1"]}. No other text.`,
        },
        {
          role: 'user',
          content: `User: "${message}"\n\nAssistant: "${responseText.slice(0, 600)}"`,
        },
      ],
      { temperature: 0.2, maxTokens: 200, json: true }
    );
    try {
      const parsed = JSON.parse(memoryText);
      if (Array.isArray(parsed.memories)) {
        suggested_memories = parsed.memories
          .filter((m: unknown) => typeof m === 'string' && m.trim().length > 0)
          .map((m: string) => m.trim())
          .slice(0, 5);
      }
    } catch (_e) { /* ignore */ }
  }

  return {
    response: responseText,
    recommendation: responseText,
    provider,
    ...(suggested_memories.length > 0 ? { suggested_memories } : {}),
  };
}

// ─── Legacy Mode Handlers (kept for client compatibility) ────────

async function handleRecommendation(
  body: RequestBody,
  sleepData: SleepSession[],
  babyName: string,
  babyAgeDays: number,
  provider: Provider
) {
  const { current_time = new Date().toISOString(), timezone = 'UTC', last_wake_time = null } = body;
  const ctx = buildSleepContext(sleepData, current_time, last_wake_time, babyAgeDays, babyName, timezone);
  const preferencesBlock = buildPreferencesBlock(body);

  const responseText = await callLLM(
    provider,
    [
      {
        role: 'system',
        content: `You are an expert pediatric sleep consultant. Provide a comprehensive sleep recommendation. All times in ${timezone}.\n\n${ctx.contextBlock}${preferencesBlock}\n\nProvide: 1) Assessment of current patterns 2) Age-appropriate schedule 3) Actionable tips 4) Concerns to watch for. Be thorough but concise.`,
      },
      { role: 'user', content: "Please analyze my baby's sleep and give recommendations." },
    ],
    { maxTokens: 800, temperature: 0.6 }
  );

  return { recommendation: responseText, provider };
}

async function handleMicroInsight(
  body: RequestBody,
  sleepData: SleepSession[],
  babyName: string,
  babyAgeDays: number,
  provider: Provider
) {
  const { current_time = new Date().toISOString(), timezone = 'UTC', last_wake_time = null } = body;
  const ageMonths = Math.floor(babyAgeDays / 30);
  const ctx = buildSleepContext(sleepData, current_time, last_wake_time, babyAgeDays, babyName, timezone);
  const context_type = (body as any).context_type || 'daily_summary';

  const prompts: Record<string, string> = {
    daily_summary: `Write ONE sentence summarizing ${babyName}'s sleep today compared to typical patterns for a ${ageMonths}-month-old.`,
    weekly_trend: `Write ONE sentence about ${babyName}'s sleep trend over the last few days.`,
    nap_cap: `Write ONE sentence about whether ${babyName}'s daytime naps should be capped to protect night sleep.`,
  };

  const responseText = await callLLM(
    provider,
    [
      { role: 'system', content: `You are a concise baby sleep analyst. ${prompts[context_type] || prompts.daily_summary}\n\n${ctx.contextBlock}\n\nReturn ONLY 1-2 sentences.` },
      { role: 'user', content: 'Give me a quick insight.' },
    ],
    { maxTokens: 100, temperature: 0.6 }
  );

  return { insight: responseText.trim(), context_type, provider };
}

async function handleDailySchedule(
  body: RequestBody,
  sleepData: SleepSession[],
  babyName: string,
  babyAgeDays: number,
  provider: Provider
) {
  const { current_time = new Date().toISOString(), timezone = 'UTC', last_wake_time = null } = body;
  const ctx = buildSleepContext(sleepData, current_time, last_wake_time, babyAgeDays, babyName, timezone);

  const responseText = await callLLM(
    provider,
    [
      {
        role: 'system',
        content: `You are an expert pediatric sleep consultant. Create a projected schedule for the rest of TODAY in ${timezone}, respecting CURRENT STATUS in the context.\n\n${ctx.contextBlock}\n\nRULES:\n- If context says baby is IN ONGOING NIGHT SLEEP: schedule must be [] (empty), suggested_bedtime must be null, notes must say they are already asleep for the night — do NOT invent a bedtime like 10pm.\n- If baby is IN AN ONGOING NAP: first events must reflect waking from that nap (nap_end), then nap_start/nap_end/bedtime as appropriate for after the nap — do not list a "bedtime" that occurs while they are still in the current nap.\n- If baby is awake: only future events (after current local time).\n\nReturn JSON: { "schedule": [{ "time": "HH:MM AM/PM", "event": "nap_start"|"nap_end"|"bedtime", "label": "...", "note": "..." }], "total_naps": number|null, "suggested_bedtime": "HH:MM AM/PM"|null, "notes": "one sentence" }. Return ONLY valid JSON.`,
      },
      { role: 'user', content: "Create today's schedule." },
    ],
    { maxTokens: 400, temperature: 0.4, json: true }
  );

  try {
    return { schedule: JSON.parse(responseText), provider };
  } catch {
    return { schedule: { schedule: [], notes: responseText }, provider };
  }
}

async function handleForecast(
  body: RequestBody,
  sleepData: SleepSession[],
  babyName: string,
  babyAgeDays: number,
  provider: Provider
) {
  const { current_time = new Date().toISOString(), timezone = 'UTC', last_wake_time = null } = body;
  const ctx = buildSleepContext(sleepData, current_time, last_wake_time, babyAgeDays, babyName, timezone);
  const preferencesBlock = buildPreferencesBlock(body);
  const tonightBlock = buildTonightDayPatternSummary(sleepData, current_time, last_wake_time, timezone, babyName);

  const systemMessage = `You are an expert pediatric sleep analyst. Your task: forecast TONIGHT'S sleep for this baby (the upcoming local night — night sleep starting later today or already in progress if context says they are in night sleep).

Anchor your reasoning on:
- Today's wake-up time (use the "Tonight forecast" block and full context — prefer inferred morning wake / last wake from tracking)
- Today's nap count and total daytime sleep so far
- Timing of the last nap (or ongoing nap) and the current wake window / time since last sleep ended
- How recent daytime patterns have correlated with better vs harder nights (see "Schedule → night sleep" in context)
- What parents should realistically expect tonight: bedtime timing, night length, and night wakings — be practical and concise

Rules:
- All times in ${timezone}
- If the baby is already in night sleep, frame predictions as likely duration/quality of this stretch and expected wakes, not a future bedtime
- If data is thin, lower confidence and say what is unknown
- Output must be valid JSON only, no markdown

Return a single JSON object with exactly these keys:
{
  "predicted_night_sleep_hours": number | null,
  "bedtime_window_start": "HH:MM AM/PM" | null,
  "bedtime_window_end": "HH:MM AM/PM" | null,
  "expected_bedtime": "HH:MM AM/PM" | null,
  "expected_wakes": number | null,
  "night_quality": "good" | "fair" | "challenging" | null,
  "confidence": "high" | "medium" | "low",
  "summary": "2-4 sentences: what to expect tonight in parent-friendly language",
  "trend": "improving" | "stable" | "declining" | "transitioning",
  "trend_note": "one short sentence on how today lines up with recent pattern",
  "key_factors": [ "2-4 short bullets tied to TODAY's wake + daytime data and recent day→night correlations" ]
}

${tonightBlock}

${ctx.contextBlock}${preferencesBlock}`;

  const responseText = await callLLM(
    provider,
    [
      { role: 'system', content: systemMessage },
      {
        role: 'user',
        content: `Forecast ${babyName}'s sleep for TONIGHT only — bedtime window, likely night sleep hours, expected wakes, and confidence. Ground every point in today's wake-up and daytime sleep pattern and recent schedule→night trends.`,
      },
    ],
    { maxTokens: 900, temperature: 0.35, json: true }
  );

  const jsonStr = extractJsonFromText(responseText);
  let parsedObj: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(jsonStr);
    parsedObj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    parsedObj = null;
  }

  const fallbackText =
    typeof responseText === 'string' && responseText.trim().length > 0
      ? responseText.trim().slice(0, 1200)
      : 'We could not generate a detailed tonight forecast. Try again in a moment.';

  const normalized = normalizeTonightForecast(parsedObj, fallbackText);

  return { forecast: normalized, provider };
}

async function handleNapEvaluation(
  body: RequestBody,
  sleepData: SleepSession[],
  babyName: string,
  babyAgeDays: number,
  provider: Provider
) {
  const { current_time = new Date().toISOString(), timezone = 'UTC', last_wake_time = null } = body;
  const ctx = buildSleepContext(sleepData, current_time, last_wake_time, babyAgeDays, babyName, timezone);
  const next_nap_time = (body as any).next_nap_time;
  const wake_window_minutes = (body as any).wake_window_minutes;

  const responseText = await callLLM(
    provider,
    [
      {
        role: 'system',
        content: `You are an expert pediatric sleep consultant evaluating a nap window.\n\n${ctx.contextBlock}\n\nRecommended nap at: ${next_nap_time || 'unknown'}, wake window: ${wake_window_minutes || '?'} min.\n\nEvaluate if appropriate. 2-3 short paragraphs.`,
      },
      { role: 'user', content: 'Is this nap time appropriate?' },
    ],
    { maxTokens: 300, temperature: 0.5 }
  );

  return { evaluation: responseText, provider };
}

async function handleInsightsBundle(
  body: RequestBody,
  sleepData: SleepSession[],
  babyName: string,
  babyAgeDays: number,
  provider: Provider
) {
  const {
    current_time = new Date().toISOString(),
    timezone = 'UTC',
    last_wake_time = null,
  } = body;
  const ageMonths = Math.floor(babyAgeDays / 30);
  const ctx = buildSleepContext(sleepData, current_time, last_wake_time, babyAgeDays, babyName, timezone);

  const systemMessage = `You are an expert pediatric sleep consultant who specializes in surfacing NOVEL, DATA-DRIVEN insights that parents rarely think of on their own.

${ctx.contextBlock}

Analyze the sleep data deeply. Look for:
1. **Pattern correlations** - e.g. "When ${babyName}'s first nap starts before 9am, afternoon naps tend to be 25 min longer"
2. **Timing insights** - e.g. "Night sleep is 45 min shorter when total daytime sleep exceeds 3.5 hours — consider capping the last nap"
3. **Consistency observations** - e.g. "Bedtime varies by 90 min across the week; moving to a 15-min window could improve morning wake time"
4. **Age-specific opportunities** - e.g. "At ${ageMonths} months, most babies drop to 2 naps — ${babyName}'s short third nap suggests readiness"
5. **Actionable optimizations** - e.g. "Your best nights (10+ hours) happen when the last nap ends before 4pm — try capping at 3:45pm"

Return a JSON object with exactly 4-5 insights. Each must be:
- NOVEL: Not generic advice — derived from THIS baby's actual data
- SPECIFIC: Include numbers, times, or percentages when possible
- ACTIONABLE: Tell the parent what to do, not just what you observe
- HELPFUL: Something they wouldn't easily notice themselves

{
  "insights": [
    {
      "title": "Short 3-5 word headline",
      "insight": "1-2 sentence explanation with specific data. Include actionable recommendation.",
      "icon": "one emoji like 💡 or 🌙 or 📊"
    }
  ]
}

Return ONLY valid JSON. If there's insufficient data, still return 2-3 insights with the best you can infer, and note data limitations in the insight text.`;

  const responseText = await callLLM(
    provider,
    [
      { role: 'system', content: systemMessage },
      { role: 'user', content: `Generate 4-5 novel, valuable insights about ${babyName}'s sleep. Be specific and actionable.` },
    ],
    { maxTokens: 800, temperature: 0.6, json: true }
  );

  try {
    const parsed = JSON.parse(responseText);
    return { insights_bundle: parsed };
  } catch {
    return { insights_bundle: { insights: [{ title: 'Analysis', insight: responseText, icon: '💡' }] } };
  }
}

// ─── Main Handler ────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body: RequestBody = await req.json();
    const {
      baby_id,
      mode = body.message ? 'chat' : 'next_sleep',
      sleep_history = [],
      baby_age_days = 0,
      baby_name,
    } = body;

    if (!baby_id) return errorResponse('Missing required field: baby_id');

    const provider = resolveProvider(body.provider);

    // ── Resolve baby data ────────────────────────────────────
    let babyAgeDays = baby_age_days;
    let sleepData = sleep_history;
    let babyName = baby_name || 'your baby';
    let userId: string | null = null;

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const authHeader = req.headers.get('Authorization');
      const supabase = authHeader
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            global: {
              headers: {
                Authorization: authHeader,
              },
            },
          })
        : supabaseAdmin;

      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) userId = user.id;
      }

      if (PREMIUM_LOCKED_MODES.has(mode) && !userId) {
        return errorResponse('Authentication required', 401);
      }

      if (PREMIUM_LOCKED_MODES.has(mode) && userId) {
        const { data: entitlementRows, error: entitlementError } = await supabase
          .rpc('get_baby_entitlement_status', { p_baby_id: baby_id });

        if (entitlementError) {
          console.error('Entitlement lookup failed:', entitlementError.message);
          return errorResponse('Failed to verify premium access', 500);
        }

        const entitlement = Array.isArray(entitlementRows)
          ? (entitlementRows[0] as EntitlementStatusRow | undefined)
          : undefined;

        if (!entitlement?.has_premium_access) {
          const trialExpired =
            entitlement?.trial_ends_at != null &&
            new Date(entitlement.trial_ends_at).getTime() <= Date.now();
          return premiumLockedResponse(trialExpired ? 'trial_expired' : 'subscription_required');
        }
      }

      const { data: babyData } = await supabase.from('babies').select('name, birth_date').eq('id', baby_id).single();
      if (babyData) {
        babyName = babyData.name || babyName;
        babyAgeDays = Math.floor((Date.now() - new Date(babyData.birth_date).getTime()) / 86400000);
      }

      if (sleepData.length === 0) {
        const { data: sessions } = await supabase
          .from('sleep_sessions')
          .select('type, start_time, end_time, duration_minutes')
          .eq('baby_id', baby_id)
          .order('start_time', { ascending: false })
          .limit(30);

        if (sessions) {
          sleepData = sessions.map((s: any) => ({
            type: s.type as 'nap' | 'night',
            start_time: s.start_time,
            end_time: s.end_time,
            duration_minutes: s.duration_minutes,
          }));
        }
      }
    }

    // ── Route to handler ─────────────────────────────────────
    let result: Record<string, unknown>;

    switch (mode) {
      case 'next_sleep':
        result = await handleNextSleep(body, sleepData, babyName, babyAgeDays, provider);
        break;
      case 'chat':
        result = await handleChat(body, sleepData, babyName, babyAgeDays, userId, provider);
        break;
      case 'recommendation':
        result = await handleRecommendation(body, sleepData, babyName, babyAgeDays, provider);
        break;
      case 'micro_insight':
        result = await handleMicroInsight(body, sleepData, babyName, babyAgeDays, provider);
        break;
      case 'daily_schedule':
        result = await handleDailySchedule(body, sleepData, babyName, babyAgeDays, provider);
        break;
      case 'forecast':
        result = await handleForecast(body, sleepData, babyName, babyAgeDays, provider);
        break;
      case 'nap_evaluation':
        result = await handleNapEvaluation(body, sleepData, babyName, babyAgeDays, provider);
        break;
      case 'insights_bundle':
        result = await handleInsightsBundle(body, sleepData, babyName, babyAgeDays, provider);
        break;
      default:
        return errorResponse(`Unknown mode: ${mode}`);
    }

    return new Response(JSON.stringify(result), { status: 200, headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: 500, headers: CORS_HEADERS });
  }
});
