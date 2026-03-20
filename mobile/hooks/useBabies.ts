import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';

type Baby = Database['public']['Tables']['babies']['Row'];

export function useBabies() {
  const [babies, setBabies] = useState<Baby[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBabies();
  }, []);

  const loadBabies = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: memberships } = await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', user.id)
        .eq('status', 'accepted');

      const familyIds = [...new Set((memberships || []).map((row) => row.family_id).filter(Boolean))];
      if (familyIds.length === 0) {
        setBabies([]);
        return;
      }

      const { data: familyBabies, error } = await supabase
        .from('babies')
        .select('*')
        .in('family_id', familyIds)
        .order('birth_date', { ascending: false });

      if (error) throw error;
      setBabies(familyBabies || []);
    } catch (error) {
      console.error('Error loading babies:', error);
    } finally {
      setLoading(false);
    }
  };

  return { babies, loading, refetch: loadBabies };
}


