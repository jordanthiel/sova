import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/ui/Card';
import { SleepScoreRing } from '@/components/ui/SleepScoreRing';
import { Spacing, Typography } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { formatDuration } from '@/utils/formatTime';
import type { NightSleepScoreResult } from '@/utils/nightSleepScore';

const RING_SIZE = 76;

interface NightSleepScoreCardProps {
  /** Previous night's score; null when no completed night has been logged. */
  result: NightSleepScoreResult | null;
}

export function NightSleepScoreCard({ result }: NightSleepScoreCardProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  const statsLine = result
    ? [
        formatDuration(result.totalSleepMinutes) + ' sleep',
        result.wakeupCount === 1 ? '1 wakeup' : `${result.wakeupCount} wakeups`,
        result.totalAwakeMinutes > 0 ? formatDuration(result.totalAwakeMinutes) + ' awake' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <Card style={styles.card} padding="none">
      <LinearGradient
        colors={[...gradients.cardBackground]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {result ? (
          <>
            <View style={styles.hero}>
              <SleepScoreRing score={result.score} size={RING_SIZE} />
              <View style={styles.heroText}>
                <Text style={[styles.heroLabel, { color: colors.text }]}>
                  {result.label}
                </Text>
                {statsLine ? (
                  <Text style={[Typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
                    {statsLine}
                  </Text>
                ) : null}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>Last night score</Text>
            <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
              Log last night sleep to see your score
            </Text>
          </View>
        )}
      </LinearGradient>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  gradient: {
    padding: Spacing.xl,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  heroText: {
    flex: 1,
  },
  heroLabel: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  emptyState: {
    paddingVertical: Spacing.sm,
  },
});
