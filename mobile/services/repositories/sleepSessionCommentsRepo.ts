import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';
import type { SleepSessionComment } from '@/types/domain';

type Row = Database['public']['Tables']['sleep_session_comments']['Row'];

function mapRow(row: Row): SleepSessionComment {
  return {
    id: row.id,
    sleepSessionId: row.sleep_session_id,
    babyId: row.baby_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const sleepSessionCommentsRepo = {
  async listBySession(sessionId: string): Promise<SleepSessionComment[]> {
    const { data, error } = await supabase
      .from('sleep_session_comments')
      .select('*')
      .eq('sleep_session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async add(sessionId: string, body: string): Promise<SleepSessionComment> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('sleep_session_comments')
      .insert({
        sleep_session_id: sessionId,
        author_id: user.id,
        body: body.trim(),
      })
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  },

  async update(commentId: string, body: string): Promise<SleepSessionComment> {
    const { data, error } = await supabase
      .from('sleep_session_comments')
      .update({ body: body.trim() })
      .eq('id', commentId)
      .select()
      .single();

    if (error) throw error;
    return mapRow(data);
  },

  async remove(commentId: string): Promise<void> {
    const { error } = await supabase
      .from('sleep_session_comments')
      .delete()
      .eq('id', commentId);

    if (error) throw error;
  },
};
