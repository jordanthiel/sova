import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { Radius, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

interface TrialStatusChipProps {
  daysRemaining: number;
  onPress: () => void;
}

export function TrialStatusChip({ daysRemaining, onPress }: TrialStatusChipProps) {
  const colors = useThemeColors();
  const accessibilityLabel =
    daysRemaining === 1
      ? 'Free trial. Ends in 1 day. Opens subscription options.'
      : `Free trial. Ends in ${daysRemaining} days. Opens subscription options.`;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.chip, { backgroundColor: colors.accentSoft, borderColor: colors.borderLight }]}
    >
      <Text style={[Typography.small, styles.label, { color: colors.accent }]}>Free Trial</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
