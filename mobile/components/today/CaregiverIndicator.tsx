import { View, Text, StyleSheet } from 'react-native';
import { Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

interface CaregiverIndicatorProps {
  caregiverName: string | null;
}

export function CaregiverIndicator({ caregiverName }: CaregiverIndicatorProps) {
  const colors = useThemeColors();

  if (!caregiverName) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: colors.accent }]} />
      <Text style={[Typography.small, { color: colors.textTertiary }]}>
        Last logged by {caregiverName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
