import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { trainersRepo } from '@/services/repositories/trainersRepo';
import type { TrainerClientFamily } from '@/types/domain';

export function useTrainerClientFamilies() {
  const [clients, setClients] = useState<TrainerClientFamily[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    try {
      const rows = await trainersRepo.listClientFamilies();
      setClients(rows);
    } catch (err) {
      console.error('[useTrainerClientFamilies] Error:', err);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user?.id) return;
      channel = supabase
        .channel(`trainer_client_assignments:trainer:${data.user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'trainer_client_assignments',
            filter: `trainer_id=eq.${data.user.id}`,
          },
          () => fetchClients()
        )
        .subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchClients]);

  return { clients, loading, refetch: fetchClients };
}
