import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';

type CoachConversation = Database['public']['Tables']['coach_conversations']['Row'];

export function useCoachConversations(babyId: string | null) {
  const [conversations, setConversations] = useState<CoachConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    if (!babyId) {
      setConversations([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('coach_conversations')
        .select('*')
        .eq('baby_id', babyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConversations(data ?? []);
    } catch (err) {
      console.error('[useCoachConversations]', err);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [babyId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const createConversation = useCallback(async (): Promise<string | null> => {
    if (!babyId) return null;
    const { data, error } = await supabase
      .from('coach_conversations')
      .insert({ baby_id: babyId })
      .select('id')
      .single();
    if (error) {
      console.error('[useCoachConversations] createConversation', error);
      return null;
    }
    setConversations((prev) => (data ? [{ ...data, baby_id: babyId, created_at: new Date().toISOString(), title: null }, ...prev] : prev));
    return data?.id ?? null;
  }, [babyId]);

  return { conversations, loading, createConversation, refetch: loadConversations };
}
