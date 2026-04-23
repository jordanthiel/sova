/** High-level routing for agentic sleep AI. */
export type AgenticRequestType =
  | 'NEXT_NAP_RECOMMENDATION'
  | 'BEDTIME_RECOMMENDATION'
  | 'FULL_DAY_SCHEDULE_RECOMMENDATION'
  | 'NAP_CAP_RECOMMENDATION'
  | 'MAX_NAP_DURATION_RECOMMENDATION'
  | 'CATNAP_VS_EARLY_BEDTIME'
  | 'DAY_REVIEW_AND_PREDICTION'
  | 'CHAT_COACHING'
  | 'TREND_ANALYSIS'
  | 'SCHEDULE_ADJUSTMENT'
  | 'UNKNOWN';

export type RequestSource = 'schedule_card' | 'chat' | 'api';

export interface ClassifierResult {
  requestType: AgenticRequestType;
  needsMoreData: boolean;
  missingFields: string[];
  /** 0–1 how sure the classifier is */
  confidence: number;
}

export interface UserPreferencesSlice {
  bedtime_type?: 'target' | 'flexible';
  bedtime_target_time?: string | null;
  last_wake_window_minutes?: number | null;
  target_nap_count?: number | null;
  naps_per_day?: number | null;
  /** Mirrors app `BabyPreferences` when passed from mobile */
  prefer_longer_naps?: boolean;
  prefer_earlier_bedtime?: boolean;
}

/** Structured parent-facing memory/preferences appended to context (Phase 2 expands). */
export interface CoachingMemoryProfile {
  preferredBedtimeTarget?: string | null;
  preferEarlyBedtimeOverCatnaps?: boolean;
  toleranceForFussiness?: 'low' | 'medium' | 'high' | null;
  napEnvironmentNotes?: string | null;
  feedingNotesRelevantToSchedule?: string | null;
  recurringIssues?: Array<'false_starts' | 'short_naps' | 'early_wakes' | 'split_nights'>;
}

export interface ChildProfile {
  childId: string;
  name: string;
  ageDays: number;
  timezone: string;
  preferences: UserPreferencesSlice;
  /** App-level structured memory — populate from DB in Phase 2; kept optional now. */
  memory?: CoachingMemoryProfile;
}
