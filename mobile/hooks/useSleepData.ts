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
  const [baby, setBaby] = useState<Baby | null>(null);
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [ageDays, setAgeDays] = useState(0);

  useEffect(() => {
    if (!babyId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        // Load baby info
        const { data: babyData, error: babyError } = await supabase
          .from('babies')
          .select('*')
          .eq('id', babyId)
          .single();

        if (babyError) throw babyError;
        setBaby(babyData);
        if (babyData) {
          setAgeDays(calculateAgeDays(babyData.birth_date));
        }

        // Load today's sessions
        const today = new Date();
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
  }, [babyId]);

  return { baby, sessions, loading, ageDays };
}



