import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-color';
import { formatDuration } from '@/utils/formatTime';

interface MetricsSummaryProps {
  avgMorningWakeWindow: number;
  avgMiddayWakeWindow: number;
  avgEveningWakeWindow: number;
  avgNapLengthByNumber: number[];
  nightSleepTotal: number;
  nightWakes: number;
}

export function MetricsSummary(props: MetricsSummaryProps) {
  const colors = useThemeColors();

  const metrics: { label: string; value: string; icon: IconSymbolName; gradientColors: readonly [string, string] }[] = [
    { label: 'Morning WW', value: props.avgMorningWakeWindow > 0 ? formatDuration(props.avgMorningWakeWindow) : '—', icon: 'sun.max.fill', gradientColors: ['rgba(255, 184, 77, 0.15)', 'rgba(255, 184, 77, 0.05)'] },
    { label: 'Midday WW', value: props.avgMiddayWakeWindow > 0 ? formatDuration(props.avgMiddayWakeWindow) : '—', icon: 'sun.max.fill', gradientColors: ['rgba(199, 174, 255, 0.15)', 'rgba(199, 174, 255, 0.05)'] },
    { label: 'Evening WW', value: props.avgEveningWakeWindow > 0 ? formatDuration(props.avgEveningWakeWindow) : '—', icon: 'clock.fill', gradientColors: ['rgba(129, 140, 248, 0.15)', 'rgba(129, 140, 248, 0.05)'] },
    { label: 'Night Sleep', value: props.nightSleepTotal > 0 ? formatDuration(props.nightSleepTotal) : '—', icon: 'moon.fill', gradientColors: ['rgba(91, 163, 232, 0.15)', 'rgba(91, 163, 232, 0.05)'] },
  ];

  return (
    <View style={styles.container}>
      <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>
        Key Metrics
      </Text>
      <View style={styles.grid}>
        {metrics.map((m) => (
          <View key={m.label} style={styles.metricCard}>
            <LinearGradient
              colors={[...m.gradientColors]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.metricGradient}
            >
              <IconSymbol name={m.icon} size={20} color={colors.text} style={styles.metricIcon} />
              <Text style={[Typography.h3, { color: colors.text }]}>{m.value}</Text>
              <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                {m.label}
              </Text>
            </LinearGradient>
          </View>
        ))}
      </View>

      {props.avgNapLengthByNumber.length > 0 && (
        <View style={styles.napByNumber}>
          <Text
            style={[
              Typography.captionMedium,
              { color: colors.textSecondary, marginBottom: Spacing.sm },
            ]}
          >
            Avg Nap Length by Nap #
          </Text>
          <View style={styles.napRow}>
            {props.avgNapLengthByNumber.map((len, idx) => (
              <View key={idx} style={styles.napBadge}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>
                  Nap {idx + 1}
                </Text>
                <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                  {formatDuration(len)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  metricGradient: {
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  metricIcon: { marginBottom: Spacing.xs },
  napByNumber: {
    marginTop: Spacing.lg,
  },
  napRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  napBadge: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 2,
  },
});
