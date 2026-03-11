export interface Baby {
  id: string;
  name: string;
  birthdate: string;
  photoUrl?: string;
  preferences: BabyPreferences;
  caregivers: Caregiver[];
}

export interface BabyPreferences {
  preferLongerNaps: boolean;
  preferEarlierBedtime: boolean;
  strictSchedule: boolean;
  sleepGoals: string[];
  /** 'target' = use bedtimeTargetTime; 'flexible' = no fixed bedtime target */
  bedtimeType: 'target' | 'flexible';
  /** HH:mm 24h (e.g. "19:30"). Used when bedtimeType === 'target'. */
  bedtimeTargetTime: string | null;
  /** User override: number of naps (1–4). null = use age-based recommendation. */
  targetNapCount: number | null;
  /** Override for last wake window before bed only (minutes). e.g. 180 for 3h. null = use age-based. */
  lastWakeWindowMinutes: number | null;
}

export const DEFAULT_BABY_PREFERENCES: BabyPreferences = {
  preferLongerNaps: false,
  preferEarlierBedtime: false,
  strictSchedule: false,
  sleepGoals: [],
  bedtimeType: 'flexible',
  bedtimeTargetTime: null,
  targetNapCount: null,
  lastWakeWindowMinutes: null,
};

export interface Caregiver {
  id: string;
  name: string;
  role: 'owner' | 'caregiver' | 'viewer';
  permission: 'can_log' | 'can_edit' | 'view_only';
}

export type SleepEventType = 'nap' | 'night';

export interface SleepEvent {
  id: string;
  babyId: string;
  type: SleepEventType;
  start: string;
  end?: string | null;
  createdBy: string;
  note?: string | null;
  durationMinutes?: number | null;
}

export interface NoteEvent {
  id: string;
  babyId: string;
  text: string;
  timestamp: string;
  createdBy: string;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type RecommendationType =
  | 'next_nap'
  | 'cap_nap'
  | 'bedtime'
  | 'schedule_adjustment';

export interface AIRecommendation {
  id: string;
  babyId: string;
  createdAt: string;
  type: RecommendationType;
  payload: NapRecommendationPayload | CapNapPayload | GenericRecommendationPayload;
  confidence: ConfidenceLevel;
}

/** One event in the ideal rest-of-day schedule (from next_sleep AI). */
export interface RestOfDayScheduleEvent {
  time: string;
  event: 'nap_start' | 'nap_end' | 'bedtime' | 'wake';
  label: string;
  note?: string | null;
  /** For nap_start events: how long to cap this specific nap (earlier naps longer, later naps shorter). */
  cap_minutes?: number | null;
  /** For nap_start/bedtime events: the wake window leading up to this event (graduates through the day). */
  wake_window_minutes?: number | null;
}

export interface NapRecommendationPayload {
  startWindowBegin: string;
  startWindowEnd: string;
  recommendedCapMinutes: number;
  /** When false, the LLM recommends letting the baby sleep without a hard cap. */
  shouldCapNap?: boolean;
  expectedBedtime: string;
  /** Short AI explanation (1–2 sentences). Shown when user taps "Why?". */
  explanation?: string | null;
  /** Longer AI reasoning. Optional; can be shown in expanded "Why?" section. */
  reasoning?: string | null;
  /** Ideal rest-of-day schedule if recommendation is followed (nap start/end, bedtime). */
  restOfDaySchedule?: RestOfDayScheduleEvent[] | null;
  /** Wake window in minutes from the LLM (used for StatusCard when present). */
  recommendedWakeWindowMinutes?: number | null;
}

export interface CapNapPayload {
  capAt: string;
  reason: string;
}

export interface GenericRecommendationPayload {
  title: string;
  description: string;
}

export interface Insight {
  id: string;
  babyId: string;
  createdAt: string;
  title: string;
  description: string;
  metricRefs?: string[];
}

export interface AISuggestion {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  preferenceKey?: keyof BabyPreferences;
  preferenceValue?: boolean | string;
}

export type EventLogType =
  | 'nap'
  | 'night'
  | 'feed'
  | 'diaper'
  | 'medication'
  | 'note'
  | 'night_wake';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

export interface NotificationConfig {
  napWindowSoon: boolean;
  capNapReminder: boolean;
  bedtimeReminder: boolean;
  wakeWindowAlert: boolean;
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  napWindowSoon: true,
  capNapReminder: true,
  bedtimeReminder: true,
  wakeWindowAlert: false,
};

export interface RecommendationFeedback {
  id: string;
  recommendationId: string;
  action: 'start' | 'delay' | 'skip';
  timestamp: string;
}
