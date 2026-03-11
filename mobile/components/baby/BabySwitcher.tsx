import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { router } from 'expo-router';
import { Avatar } from '@/components/ui/Avatar';
import { Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import type { Database } from '@/lib/supabase';

type Baby = Database['public']['Tables']['babies']['Row'];

interface BabySwitcherProps {
  currentBabyId: string | null;
  babies: Baby[];
  onBabyChange: (babyId: string) => void;
}

export function BabySwitcher({ currentBabyId, babies, onBabyChange }: BabySwitcherProps) {
  const colors = useThemeColors();

  if (babies.length === 0) return null;

  const currentBaby = babies.find((b) => b.id === currentBabyId) || babies[0];
  const hasMultiple = babies.length > 1;

  const openSelector = () => {
    router.push('/select-baby');
  };

  return (
    <TouchableOpacity
      style={styles.switcherButton}
      onPress={openSelector}
      activeOpacity={0.7}
    >
      <Avatar name={currentBaby.name} size={36} />
      <Text style={[Typography.h3, { color: colors.text, marginLeft: Spacing.sm }]}>
        {currentBaby.name}
      </Text>
      {hasMultiple && (
        <Text style={[styles.chevron, { color: colors.textTertiary }]}>▼</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  switcherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  chevron: {
    fontSize: 10,
    marginLeft: Spacing.xs,
  },
});
