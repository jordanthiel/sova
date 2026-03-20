import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

interface TrialStatusBannerProps {
  daysRemaining: number;
  onPress: () => void;
}

export function TrialStatusBanner({ daysRemaining, onPress }: TrialStatusBannerProps) {
  const colors = useThemeColors();
  const daysLabel = daysRemaining === 1 ? 'Ends in 1 day' : `Ends in ${daysRemaining} days`;
  const title = daysRemaining === 1 ? 'Your free trial ends tomorrow' : `Your free trial ends in ${daysRemaining} days`;

  return (
    <LinearGradient
      colors={['rgba(124, 184, 255, 0.20)', 'rgba(59, 130, 246, 0.08)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderColor: colors.borderLight }]}
    >
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
          <Text style={[Typography.small, { color: colors.accent }]}>Free Trial</Text>
        </View>
        <View style={[styles.badge, styles.badgeSecondary, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
          <Text style={[Typography.small, { color: colors.textSecondary }]}>{daysLabel}</Text>
        </View>
      </View>

      <Text style={[Typography.h3, { color: colors.text, marginTop: Spacing.md }]}>{title}</Text>
      <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
        Upgrade to keep your AI coach, nap recommendations, forecasts, and sleep insights going.
      </Text>

      <Button
        title="See plans"
        onPress={onPress}
        variant="gradient"
        style={styles.button}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeSecondary: {
    paddingHorizontal: 12,
  },
  button: {
    marginTop: Spacing.md,
    alignSelf: 'flex-start',
  },
});
