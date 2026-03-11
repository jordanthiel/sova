import type { ChatMessage, SleepEvent, Baby, AIRecommendation } from '@/types/domain';
import { calculateAgeDays, getWakeWindowForAge } from '@/utils/wakeWindowCalculator';
import { formatDuration } from '@/utils/formatTime';
import { supabase } from '@/lib/supabase';

export interface CoachContext {
  baby: Baby;
  recentEvents: SleepEvent[];
  activeNap?: SleepEvent | null;
  awakeMinutes?: number;
  totalDaySleepMinutes?: number;
  /** Saved memories from past coach conversations (used to personalize responses) */
  memories?: string[];
}

export interface ExtractedPreferences {
  last_wake_window_minutes?: number | null;
  bedtime_target_time?: string | null;
}

export interface ChatResult {
  message: ChatMessage;
  extracted_preferences?: ExtractedPreferences;
  /** LLM-extracted memories from this turn; user can choose to save or discard */
  suggested_memories?: string[];
}

/**
 * Send a message to the AI coach.
 * Tries the Supabase edge function (real AI) first, falls back to local stub.
 */
export async function chat(
  thread: ChatMessage[],
  context: CoachContext
): Promise<ChatResult> {
  try {
    const remote = await remoteChat(thread, context);
    if (remote) return remote;
  } catch (err) {
    console.warn('[coach] Remote chat failed, using local stub:', err);
  }
  const localMessage = await localChat(thread, context);
  return { message: localMessage };
}

/**
 * Explain an AI recommendation.
 * Tries remote first, falls back to local.
 */
export async function explain(
  recommendation: AIRecommendation,
  context: CoachContext
): Promise<ChatMessage> {
  const explainMessage: ChatMessage = {
    id: `explain_req_${Date.now()}`,
    role: 'user',
    content: `Please explain this recommendation: ${recommendation.type} (confidence: ${recommendation.confidence})`,
    timestamp: new Date().toISOString(),
  };

  try {
    const remote = await remoteChat([explainMessage], context);
    if (remote) return remote.message;
  } catch (err) {
    console.warn('[coach] Remote explain failed, using local stub:', err);
  }
  return localExplain(recommendation, context);
}

async function remoteChat(
  thread: ChatMessage[],
  context: CoachContext
): Promise<ChatResult | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const ageDays = calculateAgeDays(context.baby.birthdate);
  const lastMessage = thread[thread.length - 1];

  const endedSessions = context.recentEvents
    .filter((e) => e.end != null)
    .sort((a, b) => new Date(b.end!).getTime() - new Date(a.end!).getTime());
  const lastWakeTime = endedSessions.length > 0 ? endedSessions[0].end : null;

  const chatHistory = thread.slice(-10).map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54421';
  const res = await fetch(`${supabaseUrl}/functions/v1/chatgpt-sleep-coach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      baby_id: context.baby.id,
      mode: 'chat',
      message: lastMessage?.content || '',
      chat_history: chatHistory,
      sleep_history: context.recentEvents
        .filter((e) => e.end != null)
        .slice(0, 10)
        .map((e) => ({
          type: e.type,
          start_time: e.start,
          end_time: e.end,
          duration_minutes: e.durationMinutes,
        })),
      baby_age_days: ageDays,
      baby_name: context.baby.name,
      current_time: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      last_wake_time: lastWakeTime,
      user_preferences: {
        bedtime_type: context.baby.preferences.bedtimeType ?? undefined,
        bedtime_target_time: context.baby.preferences.bedtimeTargetTime ?? undefined,
        last_wake_window_minutes: context.baby.preferences.lastWakeWindowMinutes ?? undefined,
        target_nap_count: context.baby.preferences.targetNapCount ?? undefined,
      },
      memories: context.memories ?? [],
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const content = data?.response || data?.message || data?.recommendation;
  if (!content) return null;

  const extracted_preferences = data?.extracted_preferences as ExtractedPreferences | undefined;
  const hasExtracted =
    extracted_preferences &&
    (extracted_preferences.last_wake_window_minutes != null ||
      (extracted_preferences.bedtime_target_time != null && extracted_preferences.bedtime_target_time !== ''));
  const suggested_memories = data?.suggested_memories as string[] | undefined;
  const hasSuggestedMemories = Array.isArray(suggested_memories) && suggested_memories.length > 0;

  return {
    message: {
      id: `msg_remote_${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
    },
    ...(hasExtracted ? { extracted_preferences } : {}),
    ...(hasSuggestedMemories ? { suggested_memories } : {}),
  };
}

async function localChat(
  thread: ChatMessage[],
  context: CoachContext
): Promise<ChatMessage> {
  await simulateDelay();

  const lastMessage = thread[thread.length - 1];
  const ageDays = calculateAgeDays(context.baby.birthdate);
  const wakeWindow = getWakeWindowForAge(ageDays);
  const babyName = context.baby.name;
  const awake = context.awakeMinutes ?? 0;
  const daySleep = context.totalDaySleepMinutes ?? 0;

  let content: string;
  const query = lastMessage?.content?.toLowerCase() ?? '';

  if (query.includes('why this nap') || query.includes('why?')) {
    content =
      `Based on ${babyName}'s age (${Math.floor(ageDays / 30)} months), ` +
      `the recommended wake window is about ${formatDuration(wakeWindow)}. ` +
      `${babyName} has been awake for ${formatDuration(awake)}, ` +
      `which is ${awake >= wakeWindow ? 'at or past' : 'approaching'} the optimal window. ` +
      `Today's total day sleep is ${formatDuration(daySleep)}, so ` +
      `${daySleep > 120 ? 'we might want to keep the next nap short to protect bedtime.' : 'there is still room for a good nap.'}`;
  } else if (query.includes('bedtime') || query.includes('earlier')) {
    content =
      `For a baby ${babyName}'s age, a bedtime between 7:00–8:00 PM is typical. ` +
      `With ${formatDuration(daySleep)} of day sleep so far, ` +
      `${daySleep > 150 ? 'you might consider pushing bedtime a bit later tonight.' : 'an earlier bedtime around 7:00–7:30 PM could work well.'}` +
      ` I'll adjust my recommendations accordingly if you prefer earlier bedtimes.`;
  } else if (query.includes('early wake') || query.includes('waking up early')) {
    content =
      `Early wakeups (before 6 AM) are common. For ${babyName}, consider:\n\n` +
      `1. Ensure the room is very dark\n` +
      `2. Check that the last wake window before bed is long enough (${formatDuration(wakeWindow)} at this age)\n` +
      `3. Total day sleep of ${formatDuration(daySleep)} today—if this is consistently high, shortening naps may help\n` +
      `4. A consistent bedtime routine signals "night sleep" vs. naps`;
  } else if (query.includes('transition') || query.includes('2 nap')) {
    content =
      `Most babies transition from 3 to 2 naps around 7–9 months. ` +
      `At ${Math.floor(ageDays / 30)} months, ${babyName} ${ageDays > 210 ? 'may be ready' : 'is a bit young still'}. ` +
      `Signs to watch: consistently fighting the 3rd nap, wake windows stretching to 3+ hours, ` +
      `and the 3rd nap pushing bedtime too late. Want me to help plan the transition schedule?`;
  } else {
    content =
      `Great question about ${babyName}'s sleep! ` +
      `At ${Math.floor(ageDays / 30)} months old, here's what I'm seeing:\n\n` +
      `• Wake window target: ${formatDuration(wakeWindow)}\n` +
      `• Current awake time: ${formatDuration(awake)}\n` +
      `• Total day sleep today: ${formatDuration(daySleep)}\n\n` +
      `Everything looks ${awake <= wakeWindow * 1.1 ? 'on track' : 'like the wake window is getting stretched'}. ` +
      `Feel free to ask me anything specific about nap timing, bedtime, or sleep patterns!`;
  }

  return {
    id: `msg_local_${Date.now()}`,
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
  };
}

function localExplain(
  recommendation: AIRecommendation,
  context: CoachContext
): ChatMessage {
  const ageDays = calculateAgeDays(context.baby.birthdate);
  const wakeWindow = getWakeWindowForAge(ageDays);
  const babyName = context.baby.name;

  const content =
    `Here's why I suggested this for ${babyName}:\n\n` +
    `• At ${Math.floor(ageDays / 30)} months, the ideal wake window is ~${formatDuration(wakeWindow)}\n` +
    `• Based on today's sleep pattern (${context.recentEvents.filter((e) => e.type === 'nap' && e.end).length} naps so far)\n` +
    `• Confidence: ${recommendation.confidence}\n\n` +
    `This recommendation aims to balance adequate day sleep with a healthy bedtime. ` +
    `Would you like me to adjust based on your preferences?`;

  return {
    id: `msg_explain_${Date.now()}`,
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
  };
}

function simulateDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 600));
}
