import type {
  AgenticRequestType,
  ChildProfile,
  CoachingMemoryProfile,
  UserPreferencesSlice,
} from '../types/aiRequest.ts';

/** Request body shape minimal fields from edge function */
export interface ProfileRequestBody {
  baby_id: string;
  baby_name?: string;
  baby_age_days?: number;
  timezone?: string;
  current_time?: string;
  last_wake_time?: string | null;
  request_source?: 'schedule_card' | 'chat' | 'api';
  user_message?: string;
  message?: string;
  force_request_type?: AgenticRequestType;
  user_preferences?: UserPreferencesSlice;
  memories?: string[];
}

export function getChildProfile(body: ProfileRequestBody, resolvedName: string, resolvedAgeDays: number): ChildProfile {
  const memory = buildMemoryProfileFromRequest(body);
  return {
    childId: body.baby_id,
    name: resolvedName,
    ageDays: resolvedAgeDays,
    timezone: body.timezone || 'UTC',
    preferences: body.user_preferences ?? {},
    memory,
  };
}

/**
 * Phase 1: structured memory is light — map explicit prefs + coarse tags from free-text memories.
 * Phase 2: load `baby_sleep_memory` / prefs table; do not rely on prompt-only memory.
 */
function buildMemoryProfileFromRequest(body: ProfileRequestBody): CoachingMemoryProfile | undefined {
  const p = body.user_preferences;
  const recurring: CoachingMemoryProfile['recurringIssues'] = [];
  const mem: CoachingMemoryProfile = {
    preferredBedtimeTarget: p?.bedtime_type === 'target' ? p.bedtime_target_time ?? null : null,
    preferEarlyBedtimeOverCatnaps: p?.prefer_earlier_bedtime === true,
    toleranceForFussiness: null,
    napEnvironmentNotes: null,
    feedingNotesRelevantToSchedule: null,
    recurringIssues: recurring.length ? recurring : undefined,
  };
  const textBlob = (body.memories?.join(' ') ?? joinsafe(body)).toLowerCase();
  if (textBlob.includes('false start')) recurring.push('false_starts');
  if (textBlob.includes('short nap')) recurring.push('short_naps');
  if (textBlob.includes('early wake')) recurring.push('early_wakes');
  if (textBlob.includes('split night')) recurring.push('split_nights');

  const hasAny =
    mem.preferredBedtimeTarget ||
    mem.preferEarlyBedtimeOverCatnaps ||
    (mem.recurringIssues && mem.recurringIssues.length > 0);
  return hasAny ? mem : undefined;
}

function joinsafe(body: ProfileRequestBody): string {
  return (body.memories ?? []).join(' ');
}
