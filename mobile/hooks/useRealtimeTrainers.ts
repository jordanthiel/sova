import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { trainersRepo } from '@/services/repositories/trainersRepo';
import type { SleepTrainer } from '@/types/domain';

export function useRealtimeTrainers(babyId: string | null) {
  const [trainers, setTrainers] = useState<SleepTrainer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrainers = useCallback(async () => {
    if (!babyId) {
      setTrainers([]);
      setLoading(false);
      return;
    }

    try {
      const rows = await trainersRepo.listForBaby(babyId);
      setTrainers(rows);
    } catch (err) {
      console.error('[useRealtimeTrainers] Error:', err);
      setTrainers([]);
    } finally {
      setLoading(false);
    }
  }, [babyId]);

  useEffect(() => {
    fetchTrainers();

    if (!babyId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase
      .from('babies')
      .select('family_id')
      .eq('id', babyId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.family_id) return;
        channel = supabase
          .channel(`trainer_client_assignments:${data.family_id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'trainer_client_assignments',
              filter: `family_id=eq.${data.family_id}`,
            },
            () => fetchTrainers()
          )
          .subscribe();
      });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [babyId, fetchTrainers]);

  return { trainers, loading, refetch: fetchTrainers };
}
