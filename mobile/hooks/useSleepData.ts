import { useAppClock } from '@/contexts/AppClockContext';
import { getAppNow } from '@/lib/appClock';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';
import { calculateAgeDays } from '@/utils/wakeWindowCalculator';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];
type Baby = Database['public']['Tables']['babies']['Row'];

interface UseSleepDataProps {
  babyId: string | null;
}

export function useSleepData({ babyId }: UseSleepDataProps) {
  const { revision: appClockRevision } = useAppClock();
  const [baby, setBaby] = useState<Baby | null>(null);
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [ageDays, setAgeDays] = useState(0);

  useEffect(() => {
    if (!babyId) {
      setBaby(null);
      setSessions([]);
      setAgeDays(0);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          setBaby(null);
          setSessions([]);
          setAgeDays(0);
          return;
        }

        // Load baby info
        const { data: babyData, error: babyError } = await supabase
          .from('babies')
          .select('*')
          .eq('id', babyId)
          .maybeSingle();

        if (babyError) throw babyError;
        if (!babyData) {
          setBaby(null);
          setSessions([]);
          setAgeDays(0);
          return;
        }
        setBaby(babyData);
        if (babyData) {
          setAgeDays(calculateAgeDays(babyData.birth_date));
        }

        // Load calendar-day sessions (midnight bounds; extended-day UI still filters client-side)
        const today = getAppNow();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const { data: sessionsData, error: sessionsError } = await supabase
          .from('sleep_sessions')
          .select('*')
          .eq('baby_id', babyId)
          .gte('start_time', today.toISOString())
          .lt('start_time', tomorrow.toISOString())
          .order('start_time', { ascending: false });

        if (sessionsError) throw sessionsError;
        setSessions(sessionsData || []);
      } catch (error) {
        console.error('Error loading sleep data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [babyId, appClockRevision]);

  return { baby, sessions, loading, ageDays };
}



