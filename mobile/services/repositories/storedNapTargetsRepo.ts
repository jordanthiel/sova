import { supabase } from '@/lib/supabase';
import type { NapRecommendationPayload, RestOfDayScheduleEvent } from '@/types/domain';

export type StoredNapTargetRow = {
  id: string;
  baby_id: string;
  recommendation_type: 'next_nap' | 'bedtime';
  start_window_begin: string;
  start_window_end: string;
  recommended_cap_minutes: number;
  expected_bedtime: string;
  recommended_wake_window_minutes: number | null;
  session_data_key: string | null;
  rest_of_day_schedule: RestOfDayScheduleEvent[] | null;
  explanation: string | null;
  reasoning: string | null;
  created_at: string;
};

function rowToPayload(row: StoredNapTargetRow): NapRecommendationPayload {
  return {
    startWindowBegin: row.start_window_begin,
    startWindowEnd: row.start_window_end,
    recommendedCapMinutes: row.recommended_cap_minutes,
    expectedBedtime: row.expected_bedtime,
    recommendedWakeWindowMinutes: row.recommended_wake_window_minutes ?? undefined,
    restOfDaySchedule: row.rest_of_day_schedule ?? undefined,
    explanation: row.explanation ?? undefined,
    reasoning: row.reasoning ?? undefined,
  };
}

export const storedNapTargetsRepo = {
  /** Get the latest stored recommendation for a baby (most recent by created_at). */
  async get(babyId: string): Promise<{ id: string; payload: NapRecommendationPayload; type: 'next_nap' | 'bedtime'; sessionDataKey: string | null } | null> {
    const { data, error } = await supabase
      .from('stored_nap_targets')
      .select('*')
      .eq('baby_id', babyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as unknown as StoredNapTargetRow;
    return {
      id: row.id,
      payload: rowToPayload(row),
      type: row.recommendation_type,
      sessionDataKey: row.session_data_key ?? null,
    };
  },

  /** Insert a new recommendation (each recommendation is its own row). */
  async insert(
    babyId: string,
    type: 'next_nap' | 'bedtime',
    payload: NapRecommendationPayload,
    sessionDataKey: string
  ): Promise<string> {
    const { data, error } = await supabase
      .from('stored_nap_targets')
      .insert({
        baby_id: babyId,
        recommendation_type: type,
        start_window_begin: payload.startWindowBegin,
        start_window_end: payload.startWindowEnd,
        recommended_cap_minutes: payload.recommendedCapMinutes,
        expected_bedtime: payload.expectedBedtime,
        recommended_wake_window_minutes: payload.recommendedWakeWindowMinutes ?? null,
        session_data_key: sessionDataKey,
        rest_of_day_schedule: payload.restOfDaySchedule ?? null,
        explanation: payload.explanation ?? null,
        reasoning: payload.reasoning ?? null,
      })
      .select('id')
      .single();

    if (error) throw error;
    if (!data?.id) throw new Error('Insert did not return id');
    return data.id as string;
  },

  /** Update an existing row (used only when user explicitly regenerates/refreshes). */
  async update(
    id: string,
    type: 'next_nap' | 'bedtime',
    payload: NapRecommendationPayload,
    sessionDataKey: string
  ): Promise<void> {
    const { error } = await supabase
      .from('stored_nap_targets')
      .update({
        recommendation_type: type,
        start_window_begin: payload.startWindowBegin,
        start_window_end: payload.startWindowEnd,
        recommended_cap_minutes: payload.recommendedCapMinutes,
        expected_bedtime: payload.expectedBedtime,
        recommended_wake_window_minutes: payload.recommendedWakeWindowMinutes ?? null,
        session_data_key: sessionDataKey,
        rest_of_day_schedule: payload.restOfDaySchedule ?? null,
        explanation: payload.explanation ?? null,
        reasoning: payload.reasoning ?? null,
      })
      .eq('id', id);

    if (error) throw error;
  },
};
