import { supabase } from '@/lib/supabase';
import type { SleepEvent, NoteEvent } from '@/types/domain';
import { startOfDay, endOfDay } from 'date-fns';

function mapRow(row: any): SleepEvent {
  return {
    id: row.id,
    babyId: row.baby_id,
    type: row.type,
    start: row.start_time,
    end: row.end_time,
    createdBy: row.logged_by,
    note: row.notes,
    durationMinutes: row.duration_minutes,
  };
}

export const eventsRepo = {
  async listByDay(babyId: string, date: Date): Promise<SleepEvent[]> {
    const dayStart = startOfDay(date).toISOString();
    const dayEnd = endOfDay(date).toISOString();

    const { data, error } = await supabase
      .from('sleep_sessions')
      .select('*')
      .eq('baby_id', babyId)
      .gte('start_time', dayStart)
      .lte('start_time', dayEnd)
      .order('start_time', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapRow);
  },

  async listByDateRange(babyId: string, start: Date, end: Date): Promise<SleepEvent[]> {
    const startStr = startOfDay(start).toISOString();
    const endStr = endOfDay(end).toISOString();

    const { data, error } = await supabase
      .from('sleep_sessions')
      .select('*')
      .eq('baby_id', babyId)
      .gte('start_time', startStr)
      .lte('start_time', endStr)
      .order('start_time', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapRow);
  },

  /** Events that overlap [start, end]: start_time < end AND (end_time >= start OR end_time IS NULL). */
  async listByDateRangeOverlap(babyId: string, start: Date, end: Date): Promise<SleepEvent[]> {
    const startStr = startOfDay(start).toISOString();
    const endStr = endOfDay(end).toISOString();

    const { data, error } = await supabase
      .from('sleep_sessions')
      .select('*')
      .eq('baby_id', babyId)
      .lt('start_time', endStr)
      .or(`end_time.gte.${startStr},end_time.is.null`)
      .order('start_time', { ascending: true });

    if (error) {
      console.warn('listByDateRangeOverlap failed, falling back to listByDateRange:', error.message);
      return this.listByDateRange(babyId, start, end);
    }
    return (data || []).map(mapRow);
  },

  async getLastCompletedNight(babyId: string): Promise<SleepEvent | null> {
    const { data, error } = await supabase
      .from('sleep_sessions')
      .select('*')
      .eq('baby_id', babyId)
      .eq('type', 'night')
      .not('end_time', 'is', null)
      .order('end_time', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!data || data.length === 0) return null;
    return mapRow(data[0]);
  },

  async create(event: Omit<SleepEvent, 'id' | 'durationMinutes'>): Promise<SleepEvent> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('sleep_sessions')
      .insert({
        baby_id: event.babyId,
        type: event.type,
        start_time: event.start,
        end_time: event.end ?? null,
        logged_by: user.id,
        notes: event.note ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  },

  async update(
    id: string,
    patch: Partial<Pick<SleepEvent, 'end' | 'note' | 'type'>>
  ): Promise<SleepEvent> {
    const updates: Record<string, unknown> = {};
    if (patch.end !== undefined) updates.end_time = patch.end;
    if (patch.note !== undefined) updates.notes = patch.note;
    if (patch.type !== undefined) updates.type = patch.type;

    if (updates.end_time && typeof updates.end_time === 'string') {
      const start = await supabase
        .from('sleep_sessions')
        .select('start_time')
        .eq('id', id)
        .single();
      if (start.data) {
        const dur = Math.round(
          (new Date(updates.end_time as string).getTime() -
            new Date(start.data.start_time).getTime()) /
            60000
        );
        updates.duration_minutes = dur;
      }
    }

    const { data, error } = await supabase
      .from('sleep_sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  },

  async getActiveNap(babyId: string): Promise<SleepEvent | null> {
    const { data, error } = await supabase
      .from('sleep_sessions')
      .select('*')
      .eq('baby_id', babyId)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!data || data.length === 0) return null;
    return mapRow(data[0]);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('sleep_sessions')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
