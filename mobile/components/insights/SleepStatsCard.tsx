import { useMemo } from 'react';
import { StyleSheet, View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Card } from '@/components/ui/Card';
import { Spacing, Typography, Radius, ChartTypography } from '@/constants/theme';
import { chartConfig, getBarChartAxisStyles } from '@/constants/chartConfig';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useNightSleepScores } from '@/hooks/useNightSleepScores';
import { format, subDays } from 'date-fns';
import { formatDuration } from '@/utils/formatTime';
import { SleepScoreRing } from '@/components/ui/SleepScoreRing';
import { getExtendedDayBounds, getExtendedDayKey, sessionOverlapsExtendedDay } from '@/utils/dateUtils';
import { getNightSummaries } from '@/utils/nightSleepScore';
import type { Database } from '@/lib/supabase';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

interface SleepStatsCardProps {
  sessions: SleepSession[];
  ageMonths: number;
  days?: number;
}

/** Age-appropriate sleep targets (approximate) */
function getAgeTargets(ageMonths: number): { napHours: string; nightHours: string } {
  if (ageMonths < 3) return { napHours: '4–6h', nightHours: '9–11h' };
  if (ageMonths < 6) return { napHours: '3–4h', nightHours: '10–12h' };
  if (ageMonths < 12) return { napHours: '2–3h', nightHours: '11–12h' };
  if (ageMonths < 18) return { napHours: '1.5–2.5h', nightHours: '11–12h' };
  return { napHours: '1–2h', nightHours: '11–12h' };
}

export function SleepStatsCard({ sessions, ageMonths, days = 7 }: SleepStatsCardProps) {
  const colors = useThemeColors();
  const { currentBabyId } = useCurrentBaby();
  const scoreDateKeys = useMemo(() => {
    const keys: string[] = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      keys.push(format(subDays(today, i), 'yyyy-MM-dd'));
    }
    return keys;
  }, [days]);
  const nightScoresByDateKey = useNightSleepScores(currentBabyId ?? null, scoreDateKeys, sessions);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodStart = getExtendedDayBounds(subDays(today, days - 1)).start;
    const periodEnd = getExtendedDayBounds(today).end;

    const completed = sessions.filter(
      (s) =>
        s.end_time &&
        s.duration_minutes &&
        sessionOverlapsExtendedDay(s.start_time, s.end_time, periodStart, periodEnd)
    );

    const naps = completed.filter((s) => s.type === 'nap');
    const nights = completed.filter((s) => s.type === 'night');

    const avgNapMin = naps.length
      ? Math.round(naps.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / naps.length)
      : 0;
    const avgNightMin = nights.length
      ? Math.round(nights.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / nights.length)
      : 0;

    // Naps per day (group by extended day 6am–6am)
    const napsByDate: Record<string, number> = {};
    naps.forEach((s) => {
      const key = getExtendedDayKey(new Date(s.start_time));
      napsByDate[key] = (napsByDate[key] || 0) + 1;
    });
    const napCounts = Object.values(napsByDate);
    const avgNapsPerDay =
      napCounts.length > 0
        ? (napCounts.reduce((a, b) => a + b, 0) / napCounts.length).toFixed(1)
        : '0';

    // Bedtime consistency (std dev of night start times)
    const bedtimes = nights.map((s) => new Date(s.start_time).getHours() * 60 + new Date(s.start_time).getMinutes());
    let consistencyLabel = '—';
    if (bedtimes.length >= 2) {
      const mean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
      const variance = bedtimes.reduce((sum, b) => sum + (b - mean) ** 2, 0) / bedtimes.length;
      const stdDevMin = Math.sqrt(variance);
      if (stdDevMin <= 15) consistencyLabel = 'Very consistent';
      else if (stdDevMin <= 30) consistencyLabel = 'Consistent';
      else if (stdDevMin <= 60) consistencyLabel = 'Variable';
      else consistencyLabel = 'Inconsistent';
    }

    // Daily totals for mini chart (6am–6am per day)
    const dailyTotals: { date: string; total: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const { start: dayStart, end: dayEnd } = getExtendedDayBounds(d);
      const key = format(d, 'yyyy-MM-dd');
      const daySessions = completed.filter((s) =>
        sessionOverlapsExtendedDay(s.start_time, s.end_time, dayStart, dayEnd)
      );
      const total = daySessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
      dailyTotals.push({ date: key, total });
    }

    // Night sleep scores: use stored scores when available
    const periodStartKey = format(subDays(today, days - 1), 'yyyy-MM-dd');
    const periodEndKey = format(today, 'yyyy-MM-dd');
    const nightSummaries = getNightSummaries(sessions, { maxNights: 30 }).filter(
      (n) => n.dateKey >= periodStartKey && n.dateKey <= periodEndKey
    );
    const nightScores = nightSummaries
      .map((n) => nightScoresByDateKey[n.dateKey] ?? null)
      .filter((s): s is number => s != null);
    const avgNightScore =
      nightScores.length > 0
        ? Math.round(nightScores.reduce((a, b) => a + b, 0) / nightScores.length)
        : null;

    return {
      avgNapMin,
      avgNightMin,
      avgNapsPerDay,
      consistencyLabel,
      dailyTotals,
      napCount: naps.length,
      nightCount: nights.length,
      avgNightScore,
    };
  }, [sessions, days, nightScoresByDateKey]);

  const targets = getAgeTargets(ageMonths);
  const maxDaily = Math.max(...stats.dailyTotals.map((d) => d.total), 1);
  const chartWidth = Dimensions.get('window').width - Spacing.md * 4;
  const todayKey = new Date().toISOString().split('T')[0];
  const barData = stats.dailyTotals.map((d) => ({
    value: d.total > 0 ? d.total : 0.01,
    label: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' }),
    frontColor: d.date === todayKey ? colors.accent : colors.textTertiary,
  }));

  return (
    <Card style={styles.container} padding="md">
      <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
        Sleep stats
      </Text>
      <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.md }]}>
        Last {days} days
      </Text>

      {/* Stat grid */}
      <View style={styles.statGrid}>
        <View style={[styles.statBox, { backgroundColor: colors.napColorSoft }]}>
          <Text style={[Typography.caption, { color: colors.textTertiary }]}>Avg nap</Text>
          <Text style={[Typography.h3, { color: colors.napColor }]}>{formatDuration(stats.avgNapMin)}</Text>
          <Text style={[Typography.small, { color: colors.textTertiary }]}>Target: {targets.napHours}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.nightColorSoft }]}>
          <Text style={[Typography.caption, { color: colors.textTertiary }]}>Avg night</Text>
          <Text style={[Typography.h3, { color: colors.nightColor }]}>{formatDuration(stats.avgNightMin)}</Text>
          <Text style={[Typography.small, { color: colors.textTertiary }]}>Target: {targets.nightHours}</Text>
        </View>
        {stats.avgNightScore != null && (
          <View style={[styles.statBox, { backgroundColor: colors.surface, alignItems: 'center' }]}>
            <Text style={[Typography.caption, { color: colors.textTertiary }]}>Night score</Text>
            <SleepScoreRing score={stats.avgNightScore} size={44} />
            <Text style={[Typography.small, { color: colors.textTertiary }]}>
              Avg over period
            </Text>
          </View>
        )}
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Text style={[Typography.caption, { color: colors.textTertiary }]}>Naps/day</Text>
          <Text style={[Typography.h3, { color: colors.text }]}>{stats.avgNapsPerDay}</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
          <Text style={[Typography.caption, { color: colors.textTertiary }]}>Bedtime</Text>
          <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{stats.consistencyLabel}</Text>
        </View>
      </View>

      {/* Daily total sleep — gifted-charts BarChart */}
      {stats.dailyTotals.some((d) => d.total > 0) && (
        <View style={[styles.miniChart, { borderTopColor: colors.borderLight }]}>
          <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.md }]}>
            Daily total sleep
          </Text>
          <View style={styles.chartWrapper}>
            <BarChart
              data={barData}
              width={chartWidth}
              barWidth={28}
              barBorderRadius={chartConfig.barRadius}
              barBorderTopLeftRadius={chartConfig.barBorderTopLeftRadius}
              barBorderTopRightRadius={chartConfig.barBorderTopRightRadius}
              maxValue={maxDaily * 1.15}
              noOfSections={chartConfig.noOfSections}
              spacing={12}
              initialSpacing={12}
              endSpacing={12}
              hideRules={chartConfig.hideRules}
              isAnimated
              animationDuration={600}
              showValuesAsTopLabel
              topLabelTextStyle={{ ...ChartTypography.axisLabelSmall, color: colors.text }}
              {...getBarChartAxisStyles(colors)}
              renderTooltip={(item: { value?: number; label?: string }) =>
                item ? (
                  <Text style={[ChartTypography.tooltipValue, { color: colors.text }]}>
                    {item.label}: {Math.round(item.value ?? 0)} min
                  </Text>
                ) : null
              }
            />
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 0,
    marginVertical: Spacing.sm,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  miniChart: {
    marginTop: Spacing.md,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chartWrapper: {
    marginLeft: -Spacing.sm,
    paddingBottom: Spacing.sm,
  },
});
