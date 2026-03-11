import { useEffect, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';

export function ProfileAvatarButton() {
  const [displayName, setDisplayName] = useState<string>('You');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (user?.user_metadata?.full_name) {
        setDisplayName(user.user_metadata.full_name);
      } else if (user?.email) {
        setDisplayName(user.email);
      }
    });
  }, []);

  return (
    <TouchableOpacity
      onPress={() => router.push('/(tabs)/settings')}
      activeOpacity={0.7}
      accessibilityLabel="Open settings"
      accessibilityRole="button"
    >
      <Avatar name={displayName} size={36} />
    </TouchableOpacity>
  );
}
