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

    const channel = supabase
      .channel(`baby_parents:${babyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'baby_parents',
          filter: `baby_id=eq.${babyId}`,
        },
        () => {
          fetchCaregivers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [babyId, fetchCaregivers]);

  return { caregivers, loading, refetch: fetchCaregivers };
}
