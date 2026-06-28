import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';
import type { SleepPlan, SleepPlanInstruction } from '@/types/domain';

type Row = Database['public']['Tables']['sleep_plans']['Row'];

function normalizeInstructions(value: unknown): SleepPlanInstruction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      const body = typeof raw.body === 'string' ? raw.body.trim() : '';
      if (!title || !body) return null;
      return {
        title,
        body,
        timeOfDay: typeof raw.timeOfDay === 'string' ? raw.timeOfDay : null,
      };
    })
    .filter(Boolean) as SleepPlanInstruction[];
}

function mapRow(row: Row): SleepPlan {
  return {
    id: row.id,
    babyId: row.baby_id,
    authorId: row.author_id,
    authorType: row.author_type,
    title: row.title,
    summary: row.summary,
    instructions: normalizeInstructions(row.instructions),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    status: row.status,
    clientVisible: row.client_visible,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type UpsertPayload = {
  title: string;
  summary?: string | null;
  instructions?: SleepPlanInstruction[];
  startsOn?: string | null;
  endsOn?: string | null;
  status?: SleepPlan['status'];
  clientVisible?: boolean;
  authorType?: SleepPlan['authorType'];
};

export const sleepPlansRepo = {
  async listForBaby(babyId: string): Promise<SleepPlan[]> {
    const { data, error } = await supabase
      .from('sleep_plans')
      .select('*')
      .eq('baby_id', babyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async getActiveForBaby(babyId: string): Promise<SleepPlan | null> {
    const { data, error } = await supabase
      .from('sleep_plans')
      .select('*')
      .eq('baby_id', babyId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw error;
    return data ? mapRow(data) : null;
  },

  async create(babyId: string, payload: UpsertPayload): Promise<SleepPlan> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('sleep_plans')
      .insert({
        baby_id: babyId,
        author_id: user.id,
        author_type: payload.authorType ?? 'trainer',
        title: payload.title.trim(),
        summary: payload.summary?.trim() || null,
        instructions: payload.instructions ?? [],
        starts_on: payload.startsOn ?? null,
        ends_on: payload.endsOn ?? null,
        status: payload.status ?? 'draft',
        client_visible: payload.clientVisible ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  },

  async update(planId: string, payload: Partial<UpsertPayload>): Promise<SleepPlan> {
    const updates: Database['public']['Tables']['sleep_plans']['Update'] = {};
    if (payload.title !== undefined) updates.title = payload.title.trim();
    if (payload.summary !== undefined) updates.summary = payload.summary?.trim() || null;
    if (payload.instructions !== undefined) updates.instructions = payload.instructions;
    if (payload.startsOn !== undefined) updates.starts_on = payload.startsOn;
    if (payload.endsOn !== undefined) updates.ends_on = payload.endsOn;
    if (payload.status !== undefined) updates.status = payload.status;
    if (payload.clientVisible !== undefined) updates.client_visible = payload.clientVisible;
    if (payload.authorType !== undefined) updates.author_type = payload.authorType;

    const { data, error } = await supabase
      .from('sleep_plans')
      .update(updates)
      .eq('id', planId)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  },

  async archive(planId: string): Promise<void> {
    const { error } = await supabase
      .from('sleep_plans')
      .update({ status: 'archived' })
      .eq('id', planId);

    if (error) throw error;
  },
};
