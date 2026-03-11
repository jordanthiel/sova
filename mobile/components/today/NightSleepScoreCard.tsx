import { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/ui/Card';
import { SleepScoreRing } from '@/components/ui/SleepScoreRing';
import { Spacing, Typography, ChartTypography } from '@/constants/theme';
import { chartConfig } from '@/constants/chartConfig';
import { useThemeColors } from '@/hooks/use-theme-color';
import { formatDuration } from '@/utils/formatTime';
import type { NightSleepScoreResult } from '@/utils/nightSleepScore';
import { LineChart } from 'react-native-gifted-charts';

const CHART_HEIGHT = 44;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - Spacing.md * 4;
const RING_SIZE = 76;

export interface NightScoreTrendPoint {
  dateKey: string;
  score: number;
}

interface NightSleepScoreCardProps {
  /** Previous night's score; null when no completed night has been logged. */
  result: NightSleepScoreResult | null;
  /** Recent nights' scores for trend (oldest to newest). Shown as a small line chart when length >= 2. */
  trendData?: NightScoreTrendPoint[];
}

export function NightSleepScoreCard({ result, trendData = [] }: NightSleepScoreCardProps) {
  const colors = useThemeColors();

  const lineData = useMemo(() => {
    if (trendData.length < 2) return [];
    return trendData.map((p) => ({ value: p.score }));
  }, [trendData]);

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
        colors={['rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0.01)']}
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
            {lineData.length >= 2 && (
              <View style={[styles.trendSection, { borderTopColor: colors.border }]}>
                <Text style={[Typography.small, { color: colors.textTertiary, marginBottom: Spacing.sm }]}>
                  Trend
                </Text>
                <LineChart
                  data={lineData}
                  width={CHART_WIDTH}
                  height={CHART_HEIGHT}
                  spacing={(CHART_WIDTH - 40) / Math.max(1, lineData.length - 1)}
                  initialSpacing={chartConfig.initialSpacing}
                  endSpacing={chartConfig.endSpacing}
                  maxValue={100}
                  noOfSections={2}
                  hideRules={chartConfig.hideRules}
                  hideYAxisText
                  yAxisThickness={0}
                  xAxisThickness={0}
                  hideDataPoints={lineData.length > 7}
                  dataPointsRadius={3}
                  thickness={2}
                  color={colors.accent}
                  dataPointsColor={colors.accent}
                  xAxisLabelTextStyle={{ ...ChartTypography.axisLabelSmall, color: colors.textTertiary }}
                  curved
                  isAnimated
                  animationDuration={500}
                  startFillColor={colors.accent}
                  endFillColor={colors.accent}
                  startOpacity={0.2}
                  endOpacity={0}
                />
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>
              Last night's score
            </Text>
            <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
              Log last night's sleep to see your score
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
  trendSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
  },
  emptyState: {
    paddingVertical: Spacing.sm,
  },
});
