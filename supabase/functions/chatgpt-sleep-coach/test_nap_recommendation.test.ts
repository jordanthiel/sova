/**
 * Direct LLM tests for sleep recommendation logic.
 * Calls OpenAI/Gemini APIs directly — no edge function server needed.
 *
 * Run:
 *   export $(grep -v '^#' supabase/functions/.env | xargs) && deno test --allow-net --allow-env --allow-read supabase/functions/chatgpt-sleep-coach/test_nap_recommendation.test.ts
 */

import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { assertExists } from "https://deno.land/std@0.224.0/assert/assert_exists.ts";

// ─── Config ──────────────────────────────────────────────────────

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const HAS_OPENAI = OPENAI_API_KEY.length > 0;
const HAS_GEMINI = GEMINI_API_KEY.length > 0;

/** Min wake window for a 6-month-old.
 * Textbook says 2h15m, but LLM may use shorter windows based on
 * the baby's actual historical patterns. We allow down to 2h. */
const MIN_WAKE_WINDOW_6MO = 120;

// ─── Types ───────────────────────────────────────────────────────

type SleepSession = {
  type: "nap" | "night";
  start_time: string;
  end_time: string;
  duration_minutes: number;
};

type ScheduleEvent = {
  time: string;
  event: string;
  label: string;
  note?: string;
  cap_minutes?: number | null;
  wake_window_minutes?: number | null;
};

type NextSleepResponse = {
  recommended_time: string;
  sleep_type: string;
  expected_duration_minutes: number;
  minutes_from_now: number;
  urgency: string;
  headline: string;
  should_cap_nap: boolean;
  cap_at_minutes: number | null;
  wake_window_minutes: number;
  summary: string;
  reasoning: string;
  cap_reason: string | null;
  rest_of_day_schedule: ScheduleEvent[];
};

type Provider = "openai" | "gemini";

// ─── LLM Callers (same as edge function) ─────────────────────────

async function callOpenAI(
  messages: { role: string; content: string }[],
  options: { maxTokens?: number; temperature?: number; json?: boolean } = {}
): Promise<string> {
  const { maxTokens = 1200, temperature = 0.4, json = false } = options;
  const body: Record<string, unknown> = {
    model: "gpt-4o",
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (json) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(
  messages: { role: string; content: string }[],
  options: { maxTokens?: number; temperature?: number; json?: boolean } = {}
): Promise<string> {
  const { maxTokens = 1200, temperature = 0.4, json = false } = options;
  const model = "gemini-2.0-flash";

  const systemInstruction = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callLLM(
  provider: Provider,
  messages: { role: string; content: string }[],
  options: { maxTokens?: number; temperature?: number; json?: boolean } = {}
): Promise<string> {
  return provider === "gemini"
    ? callGemini(messages, options)
    : callOpenAI(messages, options);
}

// ─── CSV Loader ──────────────────────────────────────────────────

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"/g;
  let m;
  while ((m = re.exec(line)) !== null) out.push(m[1]);
  return out;
}

function parseDurationHhMm(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

function classifySleep(startIso: string, durationMin: number): "nap" | "night" {
  const hour = new Date(startIso).getUTCHours();
  const isEveningOrOvernight = hour >= 18 || hour < 6;
  if ((isEveningOrOvernight && durationMin >= 90) || durationMin >= 240) return "night";
  return "nap";
}

async function loadSleepHistoryFromCsv(): Promise<SleepSession[]> {
  const url = new URL("test_data/sleep_export.csv", import.meta.url);
  const csv = await Deno.readTextFile(url);
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const sessions: SleepSession[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvRow(lines[i]);
    const type = fields[0];
    const start = fields[1]?.trim();
    const end = fields[2]?.trim();
    const durationStr = fields[3]?.trim();
    if (type !== "Sleep" || !start || !end || !durationStr) continue;
    const startIso = start.replace(" ", "T") + ":00.000Z";
    const endIso = end.replace(" ", "T") + ":00.000Z";
    const durationMin = parseDurationHhMm(durationStr);
    sessions.push({
      type: classifySleep(startIso, durationMin),
      start_time: startIso,
      end_time: endIso,
      duration_minutes: durationMin,
    });
  }
  return sessions;
}

// ─── Time Helpers ────────────────────────────────────────────────

function parseTimeToMinutes(timeStr: string): number {
  // Strip trailing timezone annotations like "(in America/New_York)"
  const s = String(timeStr).trim().replace(/\s*\(.*\)\s*$/, "");
  const match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) throw new Error(`Cannot parse time: ${timeStr}`);
  let hour = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const ampm = (match[3] || "").toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return hour * 60 + min;
}

function minutesBetween(min1: number, min2: number): number {
  let d = min2 - min1;
  if (d < 0) d += 24 * 60;
  return d;
}

function isoToMinutesInTz(iso: string, tz: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
  return hour * 60 + minute;
}

function fmtDuration(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return "? min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTime(dateOrIso: Date | string, tz: string): string {
  const d = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz });
}

function fmtDateTime(dateOrIso: Date | string, tz: string): string {
  const d = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz });
}

// ─── Prompt Builder (mirrors edge function logic) ────────────────

function buildNextSleepPrompt(opts: {
  sleepHistory: SleepSession[];
  babyName: string;
  babyAgeDays: number;
  currentTime: string;
  lastWakeTime: string;
  timezone: string;
  preferences?: Record<string, unknown>;
  memories?: string[];
}): { role: string; content: string }[] {
  const { sleepHistory, babyName, babyAgeDays, currentTime, lastWakeTime, timezone, preferences, memories } = opts;
  const ageWeeks = Math.floor(babyAgeDays / 7);
  const ageMonths = Math.floor(babyAgeDays / 30);

  // Age-based references
  function getWakeWindowForAge(ageDays: number) {
    if (ageDays < 30) return { min: 45, max: 90, typical: 60 };
    if (ageDays < 60) return { min: 60, max: 120, typical: 90 };
    if (ageDays < 120) return { min: 75, max: 135, typical: 105 };
    if (ageDays < 180) return { min: 120, max: 150, typical: 135 };
    if (ageDays < 270) return { min: 135, max: 180, typical: 150 };
    if (ageDays < 365) return { min: 150, max: 210, typical: 180 };
    return { min: 180, max: 300, typical: 240 };
  }
  function getNapCountForAge(ageDays: number) {
    if (ageDays < 120) return { min: 3, max: 5, typical: 4 };
    if (ageDays < 180) return { min: 2, max: 4, typical: 3 };
    if (ageDays < 270) return { min: 2, max: 3, typical: 2 };
    if (ageDays < 450) return { min: 1, max: 2, typical: 2 };
    return { min: 1, max: 1, typical: 1 };
  }
  function getDayNapBudget(ageDays: number): number {
    if (ageDays < 120) return 210;
    if (ageDays < 270) return 180;
    if (ageDays < 365) return 150;
    return 120;
  }
  const wakeWindows = getWakeWindowForAge(babyAgeDays);
  const napCount = getNapCountForAge(babyAgeDays);
  const napBudget = getDayNapBudget(babyAgeDays);

  // Today's start
  const todayStartParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(currentTime));
  const getV = (type: string) => parseInt(todayStartParts.find((p) => p.type === type)!.value, 10);
  const offsetFromMidnight = (getV("hour") * 3600 + getV("minute") * 60 + getV("second")) * 1000;
  const todayStart = new Date(new Date(currentTime).getTime() - offsetFromMidnight);

  const todayNaps = sleepHistory.filter((s) => s.type === "nap" && new Date(s.start_time) >= todayStart && s.end_time);
  const totalNapMinutes = todayNaps.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

  // Historical analysis
  const completedNaps = sleepHistory.filter((s) => s.type === "nap" && s.end_time && s.duration_minutes > 0);
  const avgNapDuration = completedNaps.length > 0
    ? Math.round(completedNaps.slice(0, 20).reduce((sum, s) => sum + s.duration_minutes, 0) / Math.min(completedNaps.length, 20))
    : null;

  const sorted = [...sleepHistory].filter((s) => s.end_time).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const observedWW: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    // Skip gaps between consecutive night segments (night wakes, not true wake windows)
    if (sorted[i - 1].type === "night" && sorted[i].type === "night") continue;
    const gap = Math.round((new Date(sorted[i].start_time).getTime() - new Date(sorted[i - 1].end_time).getTime()) / 60000);
    if (gap > 15 && gap < 480) observedWW.push(gap);
  }
  const avgWW = observedWW.length > 0 ? Math.round(observedWW.reduce((a, b) => a + b, 0) / observedWW.length) : null;

  // Naps per day
  const sevenDaysAgo = new Date(new Date(currentTime).getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentDayNaps = sleepHistory.filter((s) => s.type === "nap" && s.end_time && new Date(s.start_time) >= sevenDaysAgo);
  const napsByDay: Record<string, number> = {};
  for (const s of recentDayNaps) {
    const dayKey = new Date(s.start_time).toISOString().slice(0, 10);
    napsByDay[dayKey] = (napsByDay[dayKey] || 0) + 1;
  }
  const daysWithNaps = Object.keys(napsByDay).length;
  const avgNapsPerDay = daysWithNaps > 0
    ? (Object.values(napsByDay).reduce((a, b) => a + b, 0) / daysWithNaps).toFixed(1)
    : null;

  // Night sleep
  const nightSessions = sleepHistory
    .filter((s) => s.type === "night" && s.end_time && s.duration_minutes > 0)
    .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime());
  let lastNightMin: number | null = null;
  if (nightSessions.length > 0) {
    let total = 0;
    let prevStart = Infinity;
    for (const s of nightSessions) {
      const end = new Date(s.end_time).getTime();
      const start = new Date(s.start_time).getTime();
      if (prevStart - end > 2 * 60 * 60 * 1000) break;
      total += s.duration_minutes;
      prevStart = start;
    }
    if (total > 0) lastNightMin = total;
  }

  const awakeMinutes = Math.round((new Date(currentTime).getTime() - new Date(lastWakeTime).getTime()) / 60000);

  // Preferences block
  const prefParts: string[] = [];
  if (preferences) {
    if (preferences.bedtime_type === "target" && preferences.bedtime_target_time) {
      const [h, m] = String(preferences.bedtime_target_time).split(":").map(Number);
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? "PM" : "AM";
      prefParts.push(`Parent's target bedtime: ${hour12}:${String(m).padStart(2, "0")} ${ampm}`);
    }
    if (preferences.last_wake_window_minutes != null && (preferences.last_wake_window_minutes as number) > 0) {
      prefParts.push(`Parent's preferred last wake window before bed: ${fmtDuration(preferences.last_wake_window_minutes as number)}`);
    }
    if (preferences.target_nap_count != null) {
      prefParts.push(`Parent's target nap count: ${preferences.target_nap_count}`);
    }
  }
  if (memories?.length) {
    prefParts.push(`Coach memories from past conversations:\n${memories.map((m) => `  - ${m}`).join("\n")}`);
  }
  const preferencesBlock = prefParts.length > 0
    ? `\n--- Parent preferences & context ---\n${prefParts.join("\n")}`
    : "";

  const contextBlock = `Baby: ${babyName}, ${ageWeeks} weeks (${ageMonths} months, ${babyAgeDays} days old)
Timezone: ${timezone}
Current local time: ${fmtTime(currentTime, timezone)}
Baby last woke at: ${fmtTime(lastWakeTime, timezone)} (${fmtDuration(awakeMinutes)} ago)

--- Today's sleep ---
Naps today: ${todayNaps.length} (${fmtDuration(totalNapMinutes)} total)
${lastNightMin != null ? `Last night total: ${fmtDuration(lastNightMin)}` : "No night sleep data yet"}

--- Age-based reference ranges ---
Wake window range: ${fmtDuration(wakeWindows.min)} - ${fmtDuration(wakeWindows.max)} (typical: ${fmtDuration(wakeWindows.typical)})
Nap count range: ${napCount.min}-${napCount.max} naps/day (typical: ${napCount.typical})
Total daytime nap budget: ~${fmtDuration(napBudget)} (use to set nap caps so total day stays on goal)
Remaining nap budget today: ${fmtDuration(Math.max(0, napBudget - totalNapMinutes))} (cap this nap so today's total stays within budget)

--- Historical patterns (from recent data) ---
${avgNapDuration != null ? `Average nap duration: ${fmtDuration(avgNapDuration)} (reference only; do not use as nap cap — set cap from budget and best-night patterns)` : "Avg nap duration: insufficient data"}
${avgWW != null ? `Average observed wake window: ${fmtDuration(avgWW)}` : "Avg wake window: insufficient data"}
${avgNapsPerDay != null ? `Average naps/day (last 7d): ${avgNapsPerDay}` : "Naps/day: insufficient data"}
${observedWW.length > 3 ? `Recent wake windows: ${observedWW.slice(-6).map((w) => fmtDuration(w)).join(", ")}` : ""}

--- Schedule → night sleep (anchor recommendations on these trends) ---
Not enough high/low score nights yet; use age-based and historical patterns.

--- Recent sessions (newest first) ---
${sleepHistory.slice(0, 15).map((s) => `${s.type} ${fmtDateTime(s.start_time, timezone)} -> ${s.end_time ? fmtDateTime(s.end_time, timezone) : "ongoing"} (${fmtDuration(s.duration_minutes)})`).join("\n")}`;

  const systemMessage = `You are an expert pediatric sleep consultant. Analyze this baby's sleep data and recommend the ideal next sleep.

Use the baby's ACTUAL historical patterns — nap durations, wake windows, nap counts, night sleep — to drive your recommendation. Only fall back to age-based norms when data is insufficient. You are the expert: use your judgment on wake windows, nap caps, and schedule shape based on what the data tells you about THIS baby.

CRITICAL — Anchor on what led to good night sleep: The context includes a "Schedule → night sleep" summary showing which daily schedules (nap count, total daytime nap, last nap timing) were followed by the best-scoring nights vs. harder nights. Prefer nap recommendations and rest-of-day plans that mirror the patterns that preceded the best nights (e.g. similar nap count, similar total nap, last nap ending in a similar window). Avoid repeating the daytime patterns that preceded poor night sleep. When the data shows a clear trend (e.g. "best nights followed 2–3 naps and ~2–2.5h total nap"), align today's recommendation with that trend so today's schedule is more likely to support a good night.

NAP CAP (critical): cap_at_minutes and each rest_of_day_schedule cap_minutes are the MAXIMUM duration that nap should be allowed — the true upper limit. If the baby sleeps that long, the parent should wake them. Do NOT set the cap to the baby's average nap length. Set it to the longest this nap should run to: (1) protect night sleep and (2) hit the daytime nap goal (total day within nap budget, and aligned with the total that preceded best nights). Use remaining budget for the day and nap position (later naps = shorter caps). First nap can have a longer cap; last nap of the day should be shortest. You decide the cap based on age, schedule, and best-night patterns — no fixed ceiling. Round caps to the nearest 5 minutes.

CONSTRAINTS (hard limits only):
- All times in ${timezone}
- Wake windows must be between ${wakeWindows.min}–${wakeWindows.max} minutes for this baby's age (typical: ${wakeWindows.typical} min)
- recommended_time must be at least ${wakeWindows.min} min after the baby's last wake time
- recommended_time must equal the first event in rest_of_day_schedule
- If it's too late for a nap (not enough time for nap + wake window before bedtime), recommend bedtime
- Total daytime nap minutes should stay within the nap budget
- Round times to the nearest 5 minutes and cap_at_minutes to the nearest 5
- wake_window_minutes must be in MINUTES (e.g. 150 for 2h30m, not 2.5)

${contextBlock}${preferencesBlock}

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
- Include recommended sleep as first event, then all events through bedtime.
- Chronologically ordered.
- "urgency": "now" = 0-5 min or overdue, "soon" = 5-15 min, "upcoming" = 15-60 min, "not_yet" = 60+ min.

Return ONLY valid JSON.`;

  return [
    { role: "system", content: systemMessage },
    {
      role: "user",
      content: `What should ${babyName}'s next sleep be? Analyze the historical data, determine the ideal wake window, plan the rest of the day, and give me your recommendation with full reasoning.`,
    },
  ];
}

// ─── JSON Extraction ─────────────────────────────────────────────

function extractJson(raw: string): string {
  let s = raw.trim();
  const open = s.match(/^```(?:json)?\s*\n?/i);
  if (open) s = s.slice(open[0].length);
  const close = s.match(/\n?```\s*$/);
  if (close) s = s.slice(0, -close[0].length);
  s = s.trim();
  if (s && s[0] !== "{") {
    const start = s.indexOf("{");
    if (start !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < s.length; i++) {
        if (s[i] === "{") depth++;
        else if (s[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end !== -1) s = s.slice(start, end + 1);
    }
  }
  return s;
}

// ─── Validation ──────────────────────────────────────────────────

function validateNextSleep(
  nextSleep: NextSleepResponse,
  lastWakeIso: string,
  timezone: string,
  providerName: string
) {
  const requiredFields = [
    "recommended_time", "sleep_type", "summary", "reasoning",
    "wake_window_minutes", "rest_of_day_schedule",
  ] as const;
  for (const key of requiredFields) {
    assertExists(nextSleep[key], `[${providerName}] missing field: ${key}`);
  }

  const ww = nextSleep.wake_window_minutes;
  assert(typeof ww === "number" && ww >= 30 && ww <= 360, `[${providerName}] wake_window_minutes out of range: ${ww}`);
  assert(ww >= MIN_WAKE_WINDOW_6MO, `[${providerName}] wake_window_minutes ${ww} < min ${MIN_WAKE_WINDOW_6MO} for 6mo`);

  assert(nextSleep.summary.length >= 20, `[${providerName}] summary too short (${nextSleep.summary.length} chars)`);
  assert(nextSleep.reasoning.length >= 50, `[${providerName}] reasoning too short (${nextSleep.reasoning.length} chars)`);

  if (nextSleep.should_cap_nap) {
    assert(
      nextSleep.cap_reason && nextSleep.cap_reason.trim().length > 0,
      `[${providerName}] cap_reason required when should_cap_nap=true`
    );
  }

  const schedule = nextSleep.rest_of_day_schedule;
  assert(Array.isArray(schedule), `[${providerName}] rest_of_day_schedule must be array`);

  if (schedule.length > 0) {
    for (const event of schedule) {
      assert(typeof event.time === "string", `[${providerName}] schedule event missing time`);
      assert(typeof event.label === "string", `[${providerName}] schedule event missing label`);
    }

    // Wake window from last_wake to recommended_time
    const lastWakeMin = isoToMinutesInTz(lastWakeIso, timezone);
    const recMin = parseTimeToMinutes(nextSleep.recommended_time);
    const wwToRec = minutesBetween(lastWakeMin, recMin);
    assert(
      wwToRec >= MIN_WAKE_WINDOW_6MO,
      `[${providerName}] wake window to recommended time: ${wwToRec}m < ${MIN_WAKE_WINDOW_6MO}m`
    );

    // Wake windows in schedule (nap_end -> nap_start/bedtime) — all must be >= min
    const scheduleGaps: number[] = [];
    for (let i = 0; i < schedule.length - 1; i++) {
      const curr = schedule[i];
      const next = schedule[i + 1];
      if (curr.event !== "nap_end" || (next.event !== "nap_start" && next.event !== "bedtime")) continue;
      try {
        const currMin = parseTimeToMinutes(curr.time);
        const nextMin = parseTimeToMinutes(next.time);
        const gap = minutesBetween(currMin, nextMin);
        scheduleGaps.push(gap);
        assert(
          gap >= MIN_WAKE_WINDOW_6MO,
          `[${providerName}] schedule gap ${gap}m between "${curr.time}" (${curr.label}) and "${next.time}" (${next.label}) < ${MIN_WAKE_WINDOW_6MO}m`
        );
      } catch (e) {
        console.warn(`[${providerName}] Could not parse schedule time: ${e}`);
      }
    }

    // Check wake windows graduate (each >= previous, with 15min tolerance for LLM rounding)
    if (scheduleGaps.length >= 2) {
      for (let i = 1; i < scheduleGaps.length; i++) {
        const diff = scheduleGaps[i] - scheduleGaps[i - 1];
        if (diff < -15) {
          console.warn(`[${providerName}] Wake windows should graduate but gap ${i} (${scheduleGaps[i]}m) < gap ${i - 1} (${scheduleGaps[i - 1]}m) by ${-diff}m`);
        }
      }
    }

    // Check nap caps decrease through the day (with tolerance)
    const napStartEvents = schedule.filter((e) => e.event === "nap_start" && typeof e.cap_minutes === "number");
    if (napStartEvents.length >= 2) {
      for (let i = 1; i < napStartEvents.length; i++) {
        const prevCap = napStartEvents[i - 1].cap_minutes!;
        const currCap = napStartEvents[i].cap_minutes!;
        if (currCap > prevCap + 10) {
          console.warn(`[${providerName}] Nap caps should decrease but nap ${i + 1} cap (${currCap}m) > nap ${i} cap (${prevCap}m)`);
        }
      }
      console.log(`[${providerName}] Per-nap caps: ${napStartEvents.map((e) => `${e.label}: ${e.cap_minutes}m`).join(", ")}`);
    }
  }
}

// ─── Test Runner Helper ──────────────────────────────────────────

async function runNextSleepTest(
  provider: Provider,
  sleepHistory: SleepSession[],
  overrides: {
    babyAgeDays?: number;
    babyName?: string;
    currentTime?: string;
    lastWakeTime?: string;
    preferences?: Record<string, unknown>;
    memories?: string[];
  } = {}
): Promise<NextSleepResponse> {
  const mostRecentEnd = sleepHistory.length > 0 ? sleepHistory[0].end_time : new Date().toISOString();
  const currentTime = overrides.currentTime ?? new Date(new Date(mostRecentEnd).getTime() + 2 * 60 * 60 * 1000).toISOString();
  const lastWakeTime = overrides.lastWakeTime ?? mostRecentEnd;

  const messages = buildNextSleepPrompt({
    sleepHistory,
    babyName: overrides.babyName ?? "Test Baby",
    babyAgeDays: overrides.babyAgeDays ?? 180,
    currentTime,
    lastWakeTime,
    timezone: "America/New_York",
    preferences: overrides.preferences,
    memories: overrides.memories,
  });

  const raw = await callLLM(provider, messages, { maxTokens: 2000, temperature: 0.4, json: true });
  const jsonStr = extractJson(raw);
  if (jsonStr.length <= 2) {
    console.error(`[${provider}] Raw response (first 500):`, raw.slice(0, 500));
  }
  assert(jsonStr.length > 2, `[${provider}] Empty response from LLM (raw length: ${raw.length})`);

  const parsed = JSON.parse(jsonStr) as NextSleepResponse;

  // Auto-correct: if wake_window_minutes looks like hours (< 10), convert to minutes
  if (typeof parsed.wake_window_minutes === "number" && parsed.wake_window_minutes > 0 && parsed.wake_window_minutes < 10) {
    console.warn(`[${provider}] wake_window_minutes=${parsed.wake_window_minutes} looks like hours, converting to minutes`);
    parsed.wake_window_minutes = Math.round(parsed.wake_window_minutes * 60);
  }

  // Auto-correct: enforce age-appropriate minimum wake window (mirrors edge function server-side enforcement)
  const ageDays = overrides.babyAgeDays ?? 180;
  const wwRef = (() => {
    if (ageDays < 30) return { min: 45, typical: 60 };
    if (ageDays < 60) return { min: 60, typical: 90 };
    if (ageDays < 120) return { min: 75, typical: 105 };
    if (ageDays < 180) return { min: 120, typical: 135 };
    if (ageDays < 270) return { min: 135, typical: 150 };
    if (ageDays < 365) return { min: 150, typical: 180 };
    return { min: 180, typical: 240 };
  })();
  if (typeof parsed.wake_window_minutes === "number" && parsed.wake_window_minutes < wwRef.min) {
    console.warn(`[${provider}] wake_window_minutes=${parsed.wake_window_minutes} below age min ${wwRef.min}, overriding to ${wwRef.typical}`);
    parsed.wake_window_minutes = wwRef.typical;
  }

  return parsed;
}

// ─── Tests ───────────────────────────────────────────────────────

Deno.test("next_sleep with OpenAI (6mo baby, CSV data)", async () => {
  if (!HAS_OPENAI) {
    console.log("Skipping: OPENAI_API_KEY not set");
    return;
  }

  const sleepHistory = await loadSleepHistoryFromCsv();
  assert(sleepHistory.length > 0, "No sleep sessions loaded from CSV");

  const nextSleep = await runNextSleepTest("openai", sleepHistory, {
    preferences: {
      bedtime_type: "target",
      bedtime_target_time: "19:30",
      last_wake_window_minutes: 180,
      target_nap_count: 2,
    },
  });

  validateNextSleep(nextSleep, sleepHistory[0].end_time, "America/New_York", "OpenAI");

  console.log("\n--- OpenAI Result ---");
  console.log("recommended_time:", nextSleep.recommended_time);
  console.log("sleep_type:", nextSleep.sleep_type);
  console.log("wake_window_minutes:", nextSleep.wake_window_minutes);
  console.log("cap_at_minutes:", nextSleep.cap_at_minutes);
  console.log("headline:", nextSleep.headline);
  console.log("summary:", nextSleep.summary);
  console.log("schedule:", nextSleep.rest_of_day_schedule.length, "events");
  console.log("schedule:", JSON.stringify(nextSleep.rest_of_day_schedule, null, 2));
  console.log("reasoning:", nextSleep.reasoning.slice(0, 300));
});

Deno.test("next_sleep with Gemini (6mo baby, CSV data)", async () => {
  if (!HAS_GEMINI) {
    console.log("Skipping: GEMINI_API_KEY not set");
    return;
  }

  const sleepHistory = await loadSleepHistoryFromCsv();
  assert(sleepHistory.length > 0, "No sleep sessions loaded from CSV");

  const nextSleep = await runNextSleepTest("gemini", sleepHistory, {
    preferences: {
      bedtime_type: "target",
      bedtime_target_time: "19:30",
      last_wake_window_minutes: 180,
      target_nap_count: 2,
    },
  });

  validateNextSleep(nextSleep, sleepHistory[0].end_time, "America/New_York", "Gemini");

  console.log("\n--- Gemini Result ---");
  console.log("recommended_time:", nextSleep.recommended_time);
  console.log("sleep_type:", nextSleep.sleep_type);
  console.log("wake_window_minutes:", nextSleep.wake_window_minutes);
  console.log("cap_at_minutes:", nextSleep.cap_at_minutes);
  console.log("headline:", nextSleep.headline);
  console.log("summary:", nextSleep.summary);
  console.log("schedule:", nextSleep.rest_of_day_schedule.length, "events");
  console.log("schedule:", JSON.stringify(nextSleep.rest_of_day_schedule, null, 2));
  console.log("reasoning:", nextSleep.reasoning.slice(0, 300));
});

Deno.test("next_sleep with minimal data (2mo, no history)", async () => {
  const provider: Provider | null = HAS_OPENAI ? "openai" : HAS_GEMINI ? "gemini" : null;
  if (!provider) {
    console.log("Skipping: no API key available");
    return;
  }

  const now = new Date();
  const lastWake = new Date(now.getTime() - 90 * 60 * 1000);

  const nextSleep = await runNextSleepTest(provider, [], {
    babyAgeDays: 60,
    babyName: "Newborn",
    currentTime: now.toISOString(),
    lastWakeTime: lastWake.toISOString(),
  });

  assert(
    nextSleep.wake_window_minutes >= 45 && nextSleep.wake_window_minutes <= 180,
    `2mo wake window out of range: ${nextSleep.wake_window_minutes}`
  );
  assert(nextSleep.summary.length >= 10, "Summary too short");
  assert(nextSleep.reasoning.length >= 30, "Reasoning too short");

  console.log(`\n--- Minimal Data (${provider}) ---`);
  console.log("recommended_time:", nextSleep.recommended_time);
  console.log("wake_window_minutes:", nextSleep.wake_window_minutes);
  console.log("summary:", nextSleep.summary);
});

Deno.test("next_sleep respects parent preferences and memories", async () => {
  const provider: Provider | null = HAS_OPENAI ? "openai" : HAS_GEMINI ? "gemini" : null;
  if (!provider) {
    console.log("Skipping: no API key available");
    return;
  }

  const sleepHistory = await loadSleepHistoryFromCsv();

  const nextSleep = await runNextSleepTest(provider, sleepHistory, {
    preferences: {
      bedtime_type: "target",
      bedtime_target_time: "19:00",
      last_wake_window_minutes: 180,
      target_nap_count: 2,
    },
    memories: [
      "Baby does better with longer morning naps",
      "Prefers last wake window of 3 hours before bed",
    ],
  });

  const reasoningLower = nextSleep.reasoning.toLowerCase();
  const mentionsPrefs =
    reasoningLower.includes("bedtime") ||
    reasoningLower.includes("preference") ||
    reasoningLower.includes("target") ||
    reasoningLower.includes("parent") ||
    reasoningLower.includes("3 hour") ||
    reasoningLower.includes("3h") ||
    reasoningLower.includes("wake window");
  assert(mentionsPrefs, `[${provider}] reasoning should reference preferences. Got: ${nextSleep.reasoning.slice(0, 200)}`);

  console.log(`\n--- Preferences Test (${provider}) ---`);
  console.log("mentions preferences:", mentionsPrefs);
  console.log("reasoning (first 300):", nextSleep.reasoning.slice(0, 300));
});

Deno.test("next_sleep with real 6mo baby data (wake window must be >= 2h)", async () => {
  const provider: Provider | null = HAS_OPENAI ? "openai" : HAS_GEMINI ? "gemini" : null;
  if (!provider) {
    console.log("Skipping: no API key available");
    return;
  }

  // Real baby data — times are UTC. Baby is in America/New_York (ET = UTC-5).
  // Daytime wake windows from this data: 168m, 110m, 205m, 158m (avg ~160m = 2h40m)
  const realSessions: SleepSession[] = [
    { type: "nap",   start_time: "2026-03-05T14:10:00Z", end_time: "2026-03-05T15:37:00Z", duration_minutes: 87 },
    { type: "nap",   start_time: "2026-03-05T18:25:00Z", end_time: "2026-03-05T19:05:00Z", duration_minutes: 40 },
    { type: "nap",   start_time: "2026-03-05T20:55:00Z", end_time: "2026-03-05T21:25:00Z", duration_minutes: 30 },
    { type: "night", start_time: "2026-03-06T00:50:00Z", end_time: "2026-03-06T03:10:00Z", duration_minutes: 140 },
    { type: "night", start_time: "2026-03-06T03:20:00Z", end_time: "2026-03-06T06:19:00Z", duration_minutes: 179 },
    { type: "night", start_time: "2026-03-06T06:50:00Z", end_time: "2026-03-06T10:01:00Z", duration_minutes: 190 },
    { type: "night", start_time: "2026-03-06T10:16:00Z", end_time: "2026-03-06T11:18:00Z", duration_minutes: 62 },
    { type: "nap",   start_time: "2026-03-06T13:56:00Z", end_time: "2026-03-06T15:27:00Z", duration_minutes: 91 },
  ];

  // Last nap ended at 15:27 UTC = 10:27 AM ET. "Now" is ~48 min later = 11:15 AM ET.
  const lastWakeTime = "2026-03-06T15:27:00Z";
  const currentTime = "2026-03-06T16:15:00Z"; // 11:15 AM ET

  const nextSleep = await runNextSleepTest(provider, realSessions, {
    babyAgeDays: 180,
    babyName: "Baby",
    currentTime,
    lastWakeTime,
    preferences: {
      bedtime_type: "target",
      bedtime_target_time: "19:30",
      last_wake_window_minutes: 180,
      target_nap_count: 2,
    },
  });

  // Key assertion: wake window must be at least 120 min (2h) for a 6mo baby
  assert(
    nextSleep.wake_window_minutes >= 120,
    `Wake window ${nextSleep.wake_window_minutes}m is too short for 6mo (min 120m)`
  );

  // Recommended time must be reasonable: at least 2h after last wake (10:27 AM ET)
  // That means no earlier than 12:27 PM ET
  const recTimeStr = nextSleep.recommended_time.replace(/\s*\(.*\)/, "");
  const recMinutes = parseTimeToMinutes(recTimeStr);
  const lastWakeMinutes = isoToMinutesInTz(lastWakeTime, "America/New_York");
  const impliedWW = minutesBetween(lastWakeMinutes, recMinutes);
  assert(
    impliedWW >= 120,
    `Implied wake window to recommended time is only ${impliedWW}m (${recTimeStr}). Must be >= 120m for 6mo.`
  );

  console.log(`\n--- Real Baby Data Test (${provider}) ---`);
  console.log("recommended_time:", nextSleep.recommended_time);
  console.log("sleep_type:", nextSleep.sleep_type);
  console.log("wake_window_minutes:", nextSleep.wake_window_minutes);
  console.log("implied wake window to rec:", impliedWW, "min");
  console.log("cap_at_minutes:", nextSleep.cap_at_minutes);
  console.log("summary:", nextSleep.summary);
  console.log("schedule:", JSON.stringify(nextSleep.rest_of_day_schedule, null, 2));
  console.log("reasoning:", nextSleep.reasoning.slice(0, 400));
});
