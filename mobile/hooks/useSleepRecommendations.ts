import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';

type Recommendation = Database['public']['Tables']['recommendations']['Row'];

interface UseSleepRecommendationsProps {
  babyId: string | null;
  sleepHistory: any[];
  babyAgeDays: number;
  lastWakeTime: string | null;
  /** Coach memories (preferences/context from past conversations) to personalize the recommendation */
  memories?: string[];
}

export function useSleepRecommendations({
  babyId,
  sleepHistory,
  babyAgeDays,
  lastWakeTime,
  memories = [],
}: UseSleepRecommendationsProps) {
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendation = async () => {
    if (!babyId) {
      setError('No baby selected');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('Not authenticated');
      }
      const user = session.user;

      // Get Supabase URL from environment; use session JWT for auth
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54421';
      const response = await fetch(`${supabaseUrl}/functions/v1/chatgpt-sleep-coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          baby_id: babyId,
          mode: 'recommendation',
          sleep_history: sleepHistory,
          baby_age_days: babyAgeDays,
          current_time: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          last_wake_time: lastWakeTime,
          memories: memories.length > 0 ? memories : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get recommendation');
      }

      const data = await response.json();
      
      // The recommendation should be saved by the edge function
      // Fetch the latest recommendation
      const { data: latestRec, error: recError } = await supabase
        .from('recommendations')
        .select('*')
        .eq('baby_id', babyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!recError && latestRec) {
        setRecommendation(latestRec);
      } else {
        // If not saved, create a temporary recommendation object
        setRecommendation({
          id: 'temp',
          baby_id: babyId,
          requested_by: user.id,
          recommendation_text: data.recommendation,
          context_data: data.context,
          created_at: new Date().toISOString(),
        } as Recommendation);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to get recommendation');
      console.error('Error fetching recommendation:', err);
    } finally {
      setLoading(false);
    }
  };

  return {
    recommendation,
    loading,
    error,
    fetchRecommendation,
  };
}



