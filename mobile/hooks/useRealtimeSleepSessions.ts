import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

export function useRealtimeSleepSessions(babyId: string | null) {
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const babyIdRef = useRef(babyId);
  babyIdRef.current = babyId;

  const fetchSessions = useCallback(async () => {
    if (!babyIdRef.current) return;
    try {
      // Fetch last 30 days; limit 300 so a full night (e.g. 6pm–6am, 4+ segments) is never truncated
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data, error: fetchError } = await supabase
        .from('sleep_sessions')
        .select('*')
        .eq('baby_id', babyIdRef.current)
        .gte('start_time', since.toISOString())
        .order('start_time', { ascending: false })
        .limit(300);

      if (fetchError) throw fetchError;
      setSessions(data || []);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!babyId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchSessions();

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`sleep_sessions:${babyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sleep_sessions',
          filter: `baby_id=eq.${babyId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setSessions((prev) => {
              // Avoid duplicates (in case refetch already got this row)
              if (prev.some((s) => s.id === (payload.new as SleepSession).id)) {
                return prev;
              }
              return [payload.new as SleepSession, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setSessions((prev) =>
              prev.map((session) =>
                session.id === (payload.new as SleepSession).id
                  ? (payload.new as SleepSession)
                  : session
              )
            );
          } else if (payload.eventType === 'DELETE') {
            // payload.old may only have the primary key
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setSessions((prev) => prev.filter((session) => session.id !== deletedId));
            } else {
              // Fallback: refetch all sessions if we can't determine what was deleted
              fetchSessions();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [babyId, fetchSessions]);

  const refetch = useCallback(async () => {
    await fetchSessions();
  }, [fetchSessions]);

  /** Optimistically remove a session by ID. Returns the removed session for rollback. */
  const optimisticRemove = useCallback((sessionId: string): SleepSession | null => {
    let removed: SleepSession | null = null;
    setSessions((prev) => {
      removed = prev.find((s) => s.id === sessionId) ?? null;
      return prev.filter((s) => s.id !== sessionId);
    });
    return removed;
  }, []);

  /** Restore a previously removed session (rollback on error). */
  const restoreSession = useCallback((session: SleepSession) => {
    setSessions((prev) => {
      if (prev.some((s) => s.id === session.id)) return prev;
      return [...prev, session].sort(
        (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
      );
    });
  }, []);

  return { sessions, loading, error, refetch, optimisticRemove, restoreSession };
}
