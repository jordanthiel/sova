/** Aligned with edge function request `sleep_history` rows and DB `sleep_sessions`. */
export interface SleepSession {
  type: 'nap' | 'night';
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
}

export interface TimelineEvent {
  kind: 'nap_start' | 'nap_end' | 'night_start' | 'night_end' | 'note';
  at: string;
  label: string;
  meta?: Record<string, unknown>;
}
