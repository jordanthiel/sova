import { useMemo, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { Card } from '@/components/ui/Card';
import { Spacing, Typography, Radius, ChartTypography } from '@/constants/theme';
import { chartConfig, getBarChartAxisStyles } from '@/constants/chartConfig';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useNightSleepScores } from '@/hooks/useNightSleepScores';
import { formatDuration } from '@/utils/formatTime';
import { addDays, format, subDays, isWithinInterval } from 'date-fns';
import { getExtendedDayBounds, sessionOverlapsExtendedDay } from '@/utils/dateUtils';
import { getNightSummaries } from '@/utils/nightSleepScore';
import type { Database } from '@/lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

const PERIODS = [
  { label: '7d', days: 7, bucket: 'day' as const },
  { label: '14d', days: 14, bucket: 'day' as const },
  { label: '30d', days: 30, bucket: 'day' as const },
  { label: '90d', days: 90, bucket: 'week' as const },
  { label: '1y', days: 365, bucket: 'week' as const },
];

function getBuckets(days: number, bucket: 'day' | 'week') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: { key: string; label: string; start: Date; end: Date }[] = [];
  if (bucket === 'day') {
    for (let i = days - 1; i >= 0; i--) {
      const d = subDays(today, i);
      const { start, end } = getExtendedDayBounds(d);
      const key = format(d, 'yyyy-MM-dd');
      buckets.push({
        key,
        label: format(d, 'EEE'),
        start,
        end,
      });
    }
  } else {
    const weekCount = Math.ceil(days / 7);
    for (let i = weekCount - 1; i >= 0; i--) {
      const end = subDays(today, i * 7);
      const start = subDays(end, 6);
      const key = `w-${format(start, 'yyyy-MM-dd')}`;
      const startBounds = getExtendedDayBounds(start);
      const endBounds = getExtendedDayBounds(end);
      buckets.push({
        key,
        label: format(start, 'MMM d'),
        start: startBounds.start,
        end: endBounds.end,
      });
    }
  }
  return buckets;
}

interface TrendsTabProps {
  sessions: SleepSession[];
  ageMonths: number;
}

export function TrendsTab({ sessions, ageMonths }: TrendsTabProps) {
  const colors = useThemeColors();
  const { currentBabyId } = useCurrentBaby();
  const [periodIndex, setPeriodIndex] = useState(2); // 30d default

  const period = PERIODS[periodIndex];
  const buckets = useMemo(() => getBuckets(period.days, period.bucket), [period.days, period.bucket]);

  const trendScoreDateKeys = useMemo(() => {
    if (period.bucket === 'day') return buckets.map((b) => b.key);
    return buckets.flatMap((b) => {
      const keys: string[] = [];
      let d = new Date(b.start);
      const end = new Date(b.end);
      while (d <= end) {
        keys.push(format(d, 'yyyy-MM-dd'));
        d = addDays(d, 1);
      }
      return keys;
    });
  }, [buckets, period.bucket]);

  const nightScoresByDateKey = useNightSleepScores(currentBabyId ?? null, trendScoreDateKeys, sessions ?? []);

  const completedSessions = useMemo(
    () => sessions.filter((s) => s.end_time != null && s.duration_minutes != null),
    [sessions]
  );

  const { statsByBucket, averages, riseAndBed } = useMemo(() => {
    const statsByBucket: Record<
      string,
      { napTotal: number; nightTotal: number; dailyTotal: number; napCount: number; nights: SleepSession[]; naps: SleepSession[] }
    > = {};
    buckets.forEach((b) => {
      statsByBucket[b.key] = {
        napTotal: 0,
        nightTotal: 0,
        dailyTotal: 0,
        napCount: 0,
        nights: [],
        naps: [],
      };
    });

    completedSessions.forEach((s) => {
      const bucket = buckets.find((b) =>
        sessionOverlapsExtendedDay(s.start_time, s.end_time, b.start, b.end)
      );
      if (!bucket || !s.duration_minutes) return;
      const rec = statsByBucket[bucket.key];
      if (s.type === 'nap') {
        rec.napTotal += s.duration_minutes;
        rec.napCount += 1;
        rec.naps.push(s);
      } else {
        rec.nightTotal += s.duration_minutes;
        rec.nights.push(s);
      }
      rec.dailyTotal += s.duration_minutes;
    });

    // Averages over the period: only over days that have data (exclude days with no logs).
    const totalNap = buckets.reduce((sum, b) => sum + statsByBucket[b.key].napTotal, 0);
    const totalNight = buckets.reduce((sum, b) => sum + statsByBucket[b.key].nightTotal, 0);
    const daysInPeriod =
      period.bucket === 'day' ? buckets.length : buckets.length * 7;
    const bucketsWithNap = buckets.filter((b) => statsByBucket[b.key].napTotal > 0).length;
    const bucketsWithNight = buckets.filter((b) => statsByBucket[b.key].nightTotal > 0).length;
    const bucketsWithAnySleep = buckets.filter((b) => statsByBucket[b.key].dailyTotal > 0).length;
    // When bucket is 'day', each bucket = 1 day. When 'week', each bucket = 7 days → divide by 7 for per-day.
    const divisorNap = period.bucket === 'day' ? bucketsWithNap : bucketsWithNap * 7;
    const divisorNight = period.bucket === 'day' ? bucketsWithNight : bucketsWithNight * 7;
    const divisorDaily = period.bucket === 'day' ? bucketsWithAnySleep : bucketsWithAnySleep * 7;
    const avgNapPerDay = divisorNap > 0 ? totalNap / divisorNap : 0;
    const avgNightPerDay = divisorNight > 0 ? totalNight / divisorNight : 0;
    const avgDailyTotal = divisorDaily > 0 ? (totalNap + totalNight) / divisorDaily : 0;

    // Rise: night sessions that *ended* in this bucket (wake-up time). Bedtime: night sessions that *started* in this bucket.
    const nightsWithEnd = completedSessions.filter((s) => s.type === 'night' && s.end_time != null);
    const nightSummariesByKey = new Map(
      getNightSummaries(sessions, { maxNights: 90 }).map((s) => [s.dateKey, s])
    );
    const riseAndBed: { key: string; label: string; riseMinutes: number | null; bedMinutes: number | null; nightScore: number | null }[] = buckets.map(
      (b) => {
        let riseMinutes: number | null = null;
        let bedMinutes: number | null = null;
        const rec = statsByBucket[b.key];
        if (rec.nights.length > 0) {
          const sortedByStart = [...rec.nights].sort(
            (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
          );
          bedMinutes = new Date(sortedByStart[0].start_time).getHours() * 60 + new Date(sortedByStart[0].start_time).getMinutes();
        }
        const nightsEndingInBucket = nightsWithEnd.filter((n) => {
          const end = new Date(n.end_time!);
          return isWithinInterval(end, { start: b.start, end: b.end });
        });
        if (nightsEndingInBucket.length > 0) {
          const latestEnd = nightsEndingInBucket.sort(
            (a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime()
          )[0];
          riseMinutes = new Date(latestEnd.end_time!).getHours() * 60 + new Date(latestEnd.end_time!).getMinutes();
        }
        let nightScore: number | null = null;
        if (period.bucket === 'day') {
          const summary = nightSummariesByKey.get(b.key);
          nightScore = nightScoresByDateKey[b.key] ?? null;
        } else {
          const weekDateKeys: string[] = [];
          let d = new Date(b.start);
          const end = new Date(b.end);
          while (d <= end) {
            weekDateKeys.push(format(d, 'yyyy-MM-dd'));
            d = addDays(d, 1);
          }
          const scores = weekDateKeys.map((dk) => nightScoresByDateKey[dk]).filter((s): s is number => s != null);
          if (scores.length > 0) nightScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        }
        return { key: b.key, label: b.label, riseMinutes, bedMinutes, nightScore };
      }
    );

    return {
      statsByBucket,
      averages: {
        avgNapPerDay,
        avgNightPerDay,
        avgDailyTotal,
        daysInPeriod,
      },
      riseAndBed,
    };
  }, [completedSessions, buckets, period, nightScoresByDateKey]);

  // Average total sleep by day of week (Mon–Sun) across the selected period. Uses 6am–6am extended days.
  const avgByWeekday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodStart = subDays(today, period.days - 1);
    const dowTotals: { nap: number[]; night: number[] }[] = Array.from({ length: 7 }, () => ({
      nap: [],
      night: [],
    }));
    for (let i = 0; i < period.days; i++) {
      const d = addDays(periodStart, i);
      const { start, end } = getExtendedDayBounds(d);
      let nap = 0;
      let night = 0;
      for (const s of completedSessions) {
        if (!sessionOverlapsExtendedDay(s.start_time, s.end_time!, start, end)) continue;
        const mins = s.duration_minutes ?? 0;
        if (s.type === 'nap') nap += mins;
        else night += mins;
      }
      const dow = d.getDay();
      dowTotals[dow].nap.push(nap);
      dowTotals[dow].night.push(night);
    }
    const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return [0, 1, 2, 3, 4, 5, 6].map((dow) => {
      const arr = dowTotals[dow];
      const n = arr.nap.length;
      const avgNap = n ? arr.nap.reduce((a, b) => a + b, 0) / n : 0;
      const avgNight = n ? arr.night.reduce((a, b) => a + b, 0) / n : 0;
      return {
        dow,
        label: WEEKDAY_LABELS[dow],
        avgNap,
        avgNight,
        avgTotal: avgNap + avgNight,
        count: n,
      };
    });
  }, [completedSessions, period.days]);

  const maxAvgByWeekday = Math.max(...avgByWeekday.map((w) => w.avgTotal), 1);

  // For rise/bed chart: time range 4:00 (240 min) to 24:00 (1440 min) so we show 4 AM - midnight
  const timeMin = 4 * 60;
  const timeMax = 24 * 60;
  const riseBedPoints = riseAndBed.filter((r) => r.riseMinutes != null || r.bedMinutes != null);
  const scorePoints = riseAndBed.filter((r) => r.nightScore != null);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p, i) => (
          <TouchableOpacity
            key={p.label}
            style={[
              styles.periodChip,
              { backgroundColor: i === periodIndex ? colors.accent : colors.surface },
            ]}
            onPress={() => setPeriodIndex(i)}
          >
            <Text
              style={[
                ChartTypography.legendLabel,
                { color: i === periodIndex ? colors.background : colors.textTertiary },
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Averages card */}
      <Card padding="md" style={styles.card}>
        <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
          Averages
        </Text>
        <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.md }]}>
          Per day over selected period
        </Text>
        <View style={styles.statGrid}>
          <View style={[styles.statBox, { backgroundColor: colors.napColorSoft }]}>
            <Text style={[Typography.caption, { color: colors.textTertiary }]}>Nap avg/day</Text>
            <Text style={[Typography.h3, { color: colors.napColor }]}>{formatDuration(Math.round(averages.avgNapPerDay))}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.nightColorSoft }]}>
            <Text style={[Typography.caption, { color: colors.textTertiary }]}>Night avg/day</Text>
            <Text style={[Typography.h3, { color: colors.nightColor }]}>{formatDuration(Math.round(averages.avgNightPerDay))}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[Typography.caption, { color: colors.textTertiary }]}>Daily total avg</Text>
            <Text style={[Typography.h3, { color: colors.text }]}>{formatDuration(Math.round(averages.avgDailyTotal))}</Text>
          </View>
        </View>
      </Card>

      {/* Daily total sleep: average by day of week */}
      <Card padding="md" style={styles.card}>
        <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
          Sleep by weekday
        </Text>
        <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.lg }]}>
          Average total sleep per weekday
        </Text>
        <View style={styles.chartWrapper}>
          <BarChart
            stackData={avgByWeekday.map((w) => {
              const stacks = [];
              if (w.avgNight > 0) stacks.push({ value: w.avgNight, color: colors.nightColor });
              if (w.avgNap > 0) stacks.push({ value: w.avgNap, color: colors.napColor });
              if (stacks.length === 0) stacks.push({ value: 0.01, color: colors.textTertiary });
              return { stacks, label: w.label };
            })}
            width={SCREEN_WIDTH - Spacing.md * 4}
            barBorderRadius={chartConfig.barRadius}
            barBorderTopLeftRadius={chartConfig.barBorderTopLeftRadius}
            barBorderTopRightRadius={chartConfig.barBorderTopRightRadius}
            maxValue={maxAvgByWeekday * 1.1}
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
              const w = avgByWeekday[index];
              if (!w) return null;
              return (
                <Text style={[ChartTypography.tooltipValue, { color: colors.text }]}>
                  {w.label}: {Math.round(w.avgTotal)} min
                </Text>
              );
            }}
          />
        </View>
      </Card>

      {/* Rise & bedtime trend */}
      {riseBedPoints.length > 0 && (
        <Card padding="md" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
            Rise & bedtime
          </Text>
          <View style={styles.timeLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.napColor }]} />
              <Text style={[ChartTypography.legendLabel, { color: colors.textTertiary }]}>Rise</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.nightColor }]} />
              <Text style={[ChartTypography.legendLabel, { color: colors.textTertiary }]}>Bedtime</Text>
            </View>
          </View>
          <View style={styles.chartWrapper}>
            <LineChart
              dataSet={[
                {
                  data: riseBedPoints.map((r) => ({ value: r.riseMinutes ?? timeMin, label: r.label })),
                  color: colors.napColor,
                  dataPointsColor: colors.napColor,
                },
                {
                  data: riseBedPoints.map((r) => ({ value: r.bedMinutes ?? timeMin, label: r.label })),
                  color: colors.nightColor,
                  dataPointsColor: colors.nightColor,
                },
              ]}
              width={SCREEN_WIDTH - Spacing.md * 4}
              spacing={riseBedPoints.length > 1 ? (SCREEN_WIDTH - Spacing.md * 4 - 48) / (riseBedPoints.length - 1) : 60}
              initialSpacing={chartConfig.initialSpacing}
              endSpacing={chartConfig.endSpacing}
              maxValue={timeMax}
              noOfSections={chartConfig.noOfSections}
              xAxisLabelTextStyle={{ ...ChartTypography.axisLabel, color: colors.textTertiary }}
              hideRules={chartConfig.hideRules}
              hideYAxisText
              yAxisThickness={0}
              xAxisColor={colors.borderLight}
              yAxisColor="transparent"
              thickness={2.5}
              dataPointsRadius={5}
              textColor1={colors.napColor}
              textColor2={colors.nightColor}
              hideDataPoints={false}
              curved
              isAnimated
              animationDuration={600}
              pointerConfig={{
                pointerStripColor: colors.borderLight,
                pointerStripWidth: 1,
                pointerColor: colors.textTertiary,
                showPointerStrip: true,
                pointerLabelComponent: (items: { value?: number; label?: string }[]) => (
                  <Text style={[ChartTypography.tooltipValue, { color: colors.text }]}>
                    {items?.map((i) => i?.value ?? '').filter((v) => v !== '').join(' · ') || '—'}
                  </Text>
                ),
              }}
            />
          </View>
        </Card>
      )}

      {/* Night sleep score chart */}
      {scorePoints.length > 0 && (
        <Card padding="md" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
            Night sleep score
          </Text>
          <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.lg }]}>
            0–100 from sleep, wakeups & time awake
          </Text>
          <View style={styles.chartWrapper}>
            <BarChart
              data={[...riseAndBed].reverse().map((r) => {
                const score = r.nightScore ?? 0;
                const frontColor =
                  score >= 80
                    ? colors.success
                    : score >= 60
                      ? colors.accent
                      : score >= 40
                        ? colors.warning
                        : colors.error;
                return {
                  value: score > 0 ? score : 0.01,
                  label: r.label,
                  frontColor: score > 0 ? frontColor : colors.textTertiary,
                  topLabelComponent: score > 0
                    ? () => (
                        <Text style={[ChartTypography.axisLabelSmall, { color: colors.text, fontWeight: '600' }]}>
                          {score}
                        </Text>
                      )
                    : undefined,
                };
              })}
              width={SCREEN_WIDTH - Spacing.md * 4}
              barBorderRadius={chartConfig.barRadius}
              barBorderTopLeftRadius={chartConfig.barBorderTopLeftRadius}
              barBorderTopRightRadius={chartConfig.barBorderTopRightRadius}
              maxValue={100}
              noOfSections={chartConfig.noOfSections}
              spacing={Math.max(chartConfig.spacing, (SCREEN_WIDTH - Spacing.md * 4 - 48) / riseAndBed.length - 12)}
              initialSpacing={chartConfig.initialSpacing}
              endSpacing={chartConfig.endSpacing}
              hideRules={chartConfig.hideRules}
              isAnimated
              animationDuration={600}
              yAxisLabelWidth={28}
              showValuesAsTopLabel
              topLabelTextStyle={{ ...ChartTypography.axisLabelSmall, color: colors.text }}
              {...getBarChartAxisStyles(colors)}
              renderTooltip={(_item: { value?: number; label?: string }, index: number) => {
                const reversed = [...riseAndBed].reverse();
                const r = reversed[index];
                if (!r || r.nightScore == null) return null;
                return (
                  <Text style={[ChartTypography.tooltipValue, { color: colors.text }]}>
                    {r.label}: {r.nightScore}
                  </Text>
                );
              }}
            />
          </View>
        </Card>
      )}

      {/* Naps per week (for longer periods) */}
      {period.bucket === 'week' && (
        <Card padding="md" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
            Naps per week
          </Text>
          <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.lg }]}>
            Count per week
          </Text>
          <View style={styles.chartWrapper}>
            <BarChart
              data={buckets.map((b) => ({
                value: statsByBucket[b.key].napCount,
                label: b.label,
                frontColor: colors.napColor,
              }))}
              width={SCREEN_WIDTH - Spacing.md * 4}
              barBorderRadius={chartConfig.barRadius}
              barBorderTopLeftRadius={chartConfig.barBorderTopLeftRadius}
              barBorderTopRightRadius={chartConfig.barBorderTopRightRadius}
              maxValue={Math.max(1, ...buckets.map((b) => statsByBucket[b.key].napCount)) * 1.2}
              noOfSections={chartConfig.noOfSections}
              spacing={Math.max(chartConfig.spacing, (SCREEN_WIDTH - Spacing.md * 4 - 48) / buckets.length - 12)}
              initialSpacing={chartConfig.initialSpacing}
              endSpacing={chartConfig.endSpacing}
              hideRules={chartConfig.hideRules}
              isAnimated
              animationDuration={600}
              showValuesAsTopLabel
              topLabelTextStyle={{ ...ChartTypography.axisLabelSmall, color: colors.text }}
              {...getBarChartAxisStyles(colors)}
              renderTooltip={(_item: { value?: number; label?: string }, index: number) => {
                const b = buckets[index];
                if (!b) return null;
                const count = statsByBucket[b.key].napCount;
                return (
                  <Text style={[ChartTypography.tooltipValue, { color: colors.text }]}>
                    {b.label}: {count}
                  </Text>
                );
              }}
            />
          </View>
        </Card>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xxl },
  periodRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  periodChip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
  },
  card: { marginBottom: Spacing.lg },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statBox: {
    flex: 1,
    minWidth: '30%',
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  chartWrapper: {
    marginLeft: -Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  timeLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginBottom: Spacing.xs,
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
