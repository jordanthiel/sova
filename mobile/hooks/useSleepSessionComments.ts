import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { sleepSessionCommentsRepo } from '@/services/repositories/sleepSessionCommentsRepo';
import type { SleepSessionComment } from '@/types/domain';

export function useSleepSessionComments(sessionId: string | null) {
  const [comments, setComments] = useState<SleepSessionComment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    if (!sessionId) {
      setComments([]);
      setLoading(false);
      return;
    }

    try {
      const rows = await sleepSessionCommentsRepo.listBySession(sessionId);
      setComments(rows);
    } catch (err) {
      console.error('[useSleepSessionComments] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchComments();
    if (!sessionId) return;

    const channel = supabase
      .channel(`sleep_session_comments:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sleep_session_comments',
          filter: `sleep_session_id=eq.${sessionId}`,
        },
        () => fetchComments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, fetchComments]);

  const addComment = useCallback(
    async (body: string) => {
      if (!sessionId || !body.trim()) return null;
      const created = await sleepSessionCommentsRepo.add(sessionId, body);
      setComments((prev) => [...prev, created]);
      return created;
    },
    [sessionId]
  );

  return { comments, loading, addComment, refetch: fetchComments };
}
