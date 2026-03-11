import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type CoachMemory = {
  id: string;
  baby_id: string;
  content: string;
  created_at: string;
};

export function useCoachMemories(babyId: string | null) {
  const [memories, setMemories] = useState<CoachMemory[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    if (!babyId) {
      setMemories([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('coach_memories')
      .select('id, baby_id, content, created_at')
      .eq('baby_id', babyId)
      .order('created_at', { ascending: false });
    if (!error) setMemories(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refetch();
  }, [babyId]);

  const addMemory = async (content: string): Promise<CoachMemory | null> => {
    if (!babyId || !content.trim()) return null;
    const { data, error } = await supabase
      .from('coach_memories')
      .insert({ baby_id: babyId, content: content.trim() })
      .select()
      .single();
    if (error) return null;
    setMemories((prev) => [data, ...prev]);
    return data;
  };

  const addMemories = async (contents: string[]): Promise<CoachMemory[]> => {
    if (!babyId) return [];
    const toInsert = contents.filter((c) => c.trim().length > 0).map((content) => ({ baby_id: babyId, content: content.trim() }));
    if (toInsert.length === 0) return [];
    const { data, error } = await supabase.from('coach_memories').insert(toInsert).select();
    if (error) return [];
    const added = data ?? [];
    setMemories((prev) => [...added, ...prev]);
    return added;
  };

  const removeMemory = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('coach_memories').delete().eq('id', id);
    if (error) return false;
    setMemories((prev) => prev.filter((m) => m.id !== id));
    return true;
  };

  const memoryStrings = memories.map((m) => m.content);

  return {
    memories,
    memoryStrings,
    loading,
    refetch,
    addMemory,
    addMemories,
    removeMemory,
  };
}
