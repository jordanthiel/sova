import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';

type Row = Database['public']['Tables']['night_sleep_scores']['Row'];

export type NightSleepScoreRow = Row;

const CHUNK_SIZE = 150;

export const nightSleepScoresRepo = {
  /** Fetch stored scores for a baby and the given date keys (yyyy-MM-dd). Chunks requests to avoid URI/IN limits. */
  async getByDateKeys(babyId: string, dateKeys: string[]): Promise<Record<string, Row>> {
    if (dateKeys.length === 0) return {};
    const out: Record<string, Row> = {};
    for (let i = 0; i < dateKeys.length; i += CHUNK_SIZE) {
      const chunk = dateKeys.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from('night_sleep_scores')
        .select('*')
        .eq('baby_id', babyId)
        .in('date_key', chunk);

      if (error) throw error;
      (data ?? []).forEach((row) => {
        out[row.date_key] = row;
      });
    }
    return out;
  },

  /** Upsert a single night score (called when a night is complete and we have computed the score). */
  async upsert(
    babyId: string,
    dateKey: string,
    payload: {
      score: number;
      total_sleep_minutes: number;
      wakeup_count: number;
      total_awake_minutes: number;
    }
  ): Promise<void> {
    const { error } = await supabase.from('night_sleep_scores').upsert(
      {
        baby_id: babyId,
        date_key: dateKey,
        score: payload.score,
        total_sleep_minutes: payload.total_sleep_minutes,
        wakeup_count: payload.wakeup_count,
        total_awake_minutes: payload.total_awake_minutes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'baby_id,date_key' }
    );
    if (error) throw error;
  },
};
