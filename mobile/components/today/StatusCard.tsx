import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-color';
import { formatDuration } from '@/utils/formatTime';
import type { ConfidenceLevel } from '@/types/domain';

interface StatusCardProps {
  awakeMinutes: number;
  recommendedWakeWindow: number;
  nextNapTime: string | null;
  /** e.g. "Next nap" or "Bedtime" - used in "X recommended around {time}" */
  nextSleepLabel?: string;
  confidence: ConfidenceLevel;
  isAsleep: boolean;
  /** When true, recommendation is still loading from LLM */
  loading?: boolean;
}

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  low: '#F6AD55',
  medium: '#4ECDC4',
  high: '#68D391',
};

export function StatusCard({
  awakeMinutes,
  recommendedWakeWindow,
  nextNapTime,
  nextSleepLabel = 'Next nap',
  confidence,
  isAsleep,
  loading = false,
}: StatusCardProps) {
  const colors = useThemeColors();

  const progress = Math.min(awakeMinutes / recommendedWakeWindow, 1);
  const isOverdue = awakeMinutes > recommendedWakeWindow;

  return (
    <Card style={styles.card} padding="lg">
      <View style={styles.header}>
        <Text style={[Typography.captionMedium, { color: colors.textSecondary }]}>
          Current Status
        </Text>
        <Badge
          label={confidence.charAt(0).toUpperCase() + confidence.slice(1)}
          backgroundColor={`${CONFIDENCE_COLORS[confidence]}20`}
          color={CONFIDENCE_COLORS[confidence]}
          size="sm"
        />
      </View>

      {isAsleep ? (
        <View style={styles.statusRow}>
          <IconSymbol name="moon.zzz.fill" size={32} color={colors.text} style={styles.sleepIcon} />
          <Text style={[Typography.h2, { color: colors.text }]}>Sleeping</Text>
        </View>
      ) : (
        <>
          <View style={styles.statusRow}>
            <View style={styles.metricBlock}>
              <Text style={[Typography.small, { color: colors.textTertiary }]}>
                Awake for
              </Text>
              <Text
                style={[
                  Typography.h2,
                  { color: isOverdue ? colors.warning : colors.text },
                ]}
              >
                {formatDuration(awakeMinutes)}
              </Text>
            </View>
            <View style={styles.metricBlock}>
              <Text style={[Typography.small, { color: colors.textTertiary }]}>
                Wake window
              </Text>
              <Text style={[Typography.h3, { color: colors.textSecondary }]}>
                {formatDuration(recommendedWakeWindow)}
              </Text>
            </View>
          </View>

          <View style={styles.progressBar}>
            <LinearGradient
              colors={
                isOverdue
                  ? ['#FC8181', '#F56565']
                  : ['#4ECDC4', '#3BA8A0']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${progress * 100}%` }]}
            />
          </View>

          {loading ? (
            <Text
              style={[
                Typography.caption,
                { color: colors.textTertiary, marginTop: Spacing.sm },
              ]}
            >
              Getting recommendation...
            </Text>
          ) : nextNapTime ? (
            <Text
              style={[
                Typography.caption,
                { color: colors.textSecondary, marginTop: Spacing.sm },
              ]}
            >
              {nextSleepLabel} recommended around {nextNapTime}
            </Text>
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
  },
  metricBlock: {
    gap: 2,
  },
  sleepIcon: { marginRight: Spacing.sm },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    marginTop: Spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});
