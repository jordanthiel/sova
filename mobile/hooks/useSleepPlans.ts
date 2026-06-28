import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { sleepPlansRepo } from '@/services/repositories/sleepPlansRepo';
import type { SleepPlan } from '@/types/domain';

export function useSleepPlans(babyId: string | null) {
  const [plans, setPlans] = useState<SleepPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    if (!babyId) {
      setPlans([]);
      setLoading(false);
      return;
    }

    try {
      const rows = await sleepPlansRepo.listForBaby(babyId);
      setPlans(rows);
    } catch (err) {
      console.error('[useSleepPlans] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [babyId]);

  useEffect(() => {
    fetchPlans();
    if (!babyId) return;

    const channel = supabase
      .channel(`sleep_plans:${babyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sleep_plans',
          filter: `baby_id=eq.${babyId}`,
        },
        () => fetchPlans()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [babyId, fetchPlans]);

  const activePlan = plans.find((plan) => plan.status === 'active') ?? null;

  return { plans, activePlan, loading, refetch: fetchPlans };
}
