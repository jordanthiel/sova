import { useMemo } from 'react';
import { StyleSheet, View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Card } from '@/components/ui/Card';
import { Spacing, Typography, ChartTypography, Radius } from '@/constants/theme';
import { chartConfig, getBarChartAxisStyles } from '@/constants/chartConfig';
import { useThemeColors } from '@/hooks/use-theme-color';
import { formatDuration } from '@/utils/formatTime';
import type { Database } from '@/lib/supabase';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SleepChartProps {
  sessions: SleepSession[];
  days?: number;
}

export function SleepChart({ sessions, days = 7 }: SleepChartProps) {
  const colors = useThemeColors();

  const { stackData, maxMinutes } = useMemo(() => {
    const sessionsByDate: Record<string, { naps: number; nights: number; totalMinutes: number }> = {};
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      sessionsByDate[dateKey] = { naps: 0, nights: 0, totalMinutes: 0 };
    }

    sessions.forEach((session) => {
      if (!session.end_time || !session.duration_minutes) return;
      const dateKey = new Date(session.start_time).toISOString().split('T')[0];
      if (sessionsByDate[dateKey]) {
        if (session.type === 'nap') {
          sessionsByDate[dateKey].naps += session.duration_minutes;
        } else {
          sessionsByDate[dateKey].nights += session.duration_minutes;
        }
        sessionsByDate[dateKey].totalMinutes += session.duration_minutes;
      }
    });

    const dates = Object.keys(sessionsByDate).sort().slice(-Math.min(days, 7));
    const max = Math.max(...Object.values(sessionsByDate).map((d) => d.totalMinutes), 1);

    const chartData = dates.map((dateKey) => {
      const dayData = sessionsByDate[dateKey];
      const date = new Date(dateKey + 'T12:00:00');
      const dayLabel = date.toLocaleDateString('en-US', { weekday: 'narrow' });
      const stacks = [];
      if (dayData.nights > 0) stacks.push({ value: dayData.nights, color: colors.nightColor });
      if (dayData.naps > 0) stacks.push({ value: dayData.naps, color: colors.napColor });
      if (stacks.length === 0) stacks.push({ value: 0.01, color: colors.textTertiary });
      return { stacks, label: dayLabel };
    });

    return { stackData: chartData, maxMinutes: max };
  }, [sessions, days, colors.nightColor, colors.napColor, colors.textTertiary]);

  return (
    <Card style={styles.container} padding="md">
      <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
        Sleep pattern
      </Text>
      <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.lg }]}>
        Total sleep by day (night + naps)
      </Text>

      <View style={styles.chartWrapper}>
        <BarChart
          stackData={stackData}
          width={SCREEN_WIDTH - Spacing.md * 4}
          barBorderRadius={chartConfig.barRadius}
          barBorderTopLeftRadius={chartConfig.barBorderTopLeftRadius}
          barBorderTopRightRadius={chartConfig.barBorderTopRightRadius}
          maxValue={maxMinutes * 1.1}
          noOfSections={chartConfig.noOfSections}
          spacing={chartConfig.spacing}
          initialSpacing={chartConfig.initialSpacing}
          endSpacing={chartConfig.endSpacing}
          hideRules={chartConfig.hideRules}
          isAnimated
          animationDuration={800}
          showValuesAsTopLabel
          topLabelTextStyle={{ ...ChartTypography.axisLabelSmall, color: colors.text }}
          {...getBarChartAxisStyles(colors)}
          renderTooltip={(_item: unknown, index: number) => {
            const entry = stackData[index];
            if (!entry) return null;
            const total = entry.stacks.reduce((s, t) => s + t.value, 0);
            if (total <= 0.01) return null;
            return (
              <Text style={[ChartTypography.tooltipValue, { color: colors.text }]}>
                {entry.label}: {Math.round(total)} min
              </Text>
            );
          }}
        />
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.napColor }]} />
          <Text style={[ChartTypography.legendLabel, { color: colors.textTertiary }]}>Naps</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.nightColor }]} />
          <Text style={[ChartTypography.legendLabel, { color: colors.textTertiary }]}>Night</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
  },
  chartWrapper: {
    marginLeft: -Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    paddingTop: Spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
