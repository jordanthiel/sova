import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { caregiversRepo } from '@/services/repositories/caregiversRepo';
import type { Caregiver } from '@/types/domain';

export function useRealtimeCaregivers(babyId: string | null) {
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCaregivers = useCallback(async () => {
    if (!babyId) {
      setCaregivers([]);
      setLoading(false);
      return;
    }
    try {
      const data = await caregiversRepo.list(babyId);
      setCaregivers(data);
    } catch (err) {
      console.error('[useRealtimeCaregivers] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [babyId]);

  useEffect(() => {
    fetchCaregivers();

    if (!babyId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase
      .from('babies')
      .select('family_id')
      .eq('id', babyId)
      .single()
      .then(({ data }) => {
        if (!data?.family_id) return;
        channel = supabase
          .channel(`family_members:${data.family_id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'family_members',
              filter: `family_id=eq.${data.family_id}`,
            },
            () => {
              fetchCaregivers();
            }
          )
          .subscribe();
      });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [babyId, fetchCaregivers]);

  return { caregivers, loading, refetch: fetchCaregivers };
}
