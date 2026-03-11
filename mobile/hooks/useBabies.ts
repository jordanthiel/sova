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

      // Get babies where user is owner
      const { data: ownedBabies } = await supabase
        .from('babies')
        .select('*')
        .eq('created_by', user.id);

      // Get babies where user is a parent
      const { data: parentBabies } = await supabase
        .from('baby_parents')
        .select(`
          babies (*)
        `)
        .eq('parent_id', user.id)
        .eq('status', 'accepted');

      const allBabies: Baby[] = [
        ...(ownedBabies || []),
        ...(parentBabies?.map((bp: any) => bp.babies).filter(Boolean) || []),
      ];

      // Remove duplicates
      const uniqueBabies = Array.from(
        new Map(allBabies.map((baby) => [baby.id, baby])).values()
      );

      setBabies(uniqueBabies);
    } catch (error) {
      console.error('Error loading babies:', error);
    } finally {
      setLoading(false);
    }
  };

  return { babies, loading, refetch: loadBabies };
}


