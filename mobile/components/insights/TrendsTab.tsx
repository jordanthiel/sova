import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Spacing, Typography, Radius, ChartTypography } from '@/constants/theme';
import { chartConfig, getBarChartAxisStyles } from '@/constants/chartConfig';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useNightSleepScores } from '@/hooks/useNightSleepScores';
import { formatDuration } from '@/utils/formatTime';
import { addDays, format, subDays } from 'date-fns';
import { getExtendedDayBounds, sessionOverlapsExtendedDay } from '@/utils/dateUtils';
import type { Database } from '@/lib/supabase';
import type { Caregiver } from '@/types/domain';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

const PERIODS = [
  { label: '7d', days: 7, bucket: 'day' as const },
  { label: '14d', days: 14, bucket: 'day' as const },
  { label: '30d', days: 30, bucket: 'day' as const },
  { label: '90d', days: 90, bucket: 'week' as const },
  { label: '1y', days: 365, bucket: 'week' as const },
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DetailMetric = {
  label: string;
  value: string;
  tint?: string;
  backgroundColor?: string;
};

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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatClockMinutes(minutes: number | null): string {
  if (minutes == null) return '—';
  const date = new Date();
  date.setHours(0, minutes, 0, 0);
  return format(date, 'h:mm a');
}

function getNightScoreLabel(score: number | null): string {
  if (score == null) return 'No score yet';
  if (score >= 85) return 'Restorative night';
  if (score >= 70) return 'Strong night';
  if (score >= 55) return 'Mixed night';
  return 'Rough night';
}

function ChartSelectionCard({
  title,
  subtitle,
  accentColor,
  metrics,
  hint,
}: {
  title: string;
  subtitle?: string;
  accentColor: string;
  metrics: DetailMetric[];
  hint?: string;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.selectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.selectionAccent, { backgroundColor: accentColor }]} />
      <View style={styles.selectionBody}>
        <View style={styles.selectionHeader}>
          <View style={styles.selectionTextBlock}>
            <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{title}</Text>
            {subtitle ? (
              <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {hint ? (
            <View style={[styles.selectionHint, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[Typography.small, { color: colors.textTertiary }]}>{hint}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.selectionMetrics}>
          {metrics.map((metric) => (
            <View
              key={metric.label}
              style={[
                styles.selectionMetric,
                { backgroundColor: metric.backgroundColor ?? colors.surfaceElevated },
              ]}
            >
              <Text style={[Typography.small, { color: colors.textTertiary }]}>{metric.label}</Text>
              <Text style={[Typography.bodySemiBold, { color: metric.tint ?? colors.text }]}>
                {metric.value}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

interface TrendsTabProps {
  sessions: SleepSession[];
  ageMonths: number;
  caregivers: Caregiver[];
}

export function TrendsTab({ sessions, ageMonths, caregivers }: TrendsTabProps) {
  const colors = useThemeColors();
  const { currentBabyId } = useCurrentBaby();
  const [periodIndex, setPeriodIndex] = useState(2); // 30d default
  const [selectedWeekdayIndex, setSelectedWeekdayIndex] = useState(0);
  const [selectedRiseBedIndex, setSelectedRiseBedIndex] = useState(0);
  const [selectedScoreIndex, setSelectedScoreIndex] = useState(0);
  const [selectedCaregiverIndex, setSelectedCaregiverIndex] = useState(0);
  const [selectedBucketIndex, setSelectedBucketIndex] = useState(0);

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

  const { statsByBucket, averages } = useMemo(() => {
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

    return {
      statsByBucket,
      averages: {
        avgNapPerDay,
        avgNightPerDay,
        avgDailyTotal,
        daysInPeriod,
      },
    };
  }, [completedSessions, buckets, period]);

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

  const avgRiseBedByWeekday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodStart = subDays(today, period.days - 1);
    const weekdayTotals: {
      rise: number[];
      bed: number[];
      score: number[];
    }[] = Array.from({ length: 7 }, () => ({
      rise: [],
      bed: [],
      score: [],
    }));

    const nightSessions = completedSessions.filter((s) => s.type === 'night' && s.end_time != null);

    for (let i = 0; i < period.days; i++) {
      const day = addDays(periodStart, i);
      const dateKey = format(day, 'yyyy-MM-dd');
      const { start, end } = getExtendedDayBounds(day);
      const weekday = day.getDay();

      const nightsInExtendedDay = nightSessions.filter((s) =>
        sessionOverlapsExtendedDay(s.start_time, s.end_time!, start, end)
      );
      if (nightsInExtendedDay.length > 0) {
        const earliestStart = [...nightsInExtendedDay].sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        )[0];
        const bedtime = new Date(earliestStart.start_time);
        weekdayTotals[weekday].bed.push(bedtime.getHours() * 60 + bedtime.getMinutes());
      }

      const nightsEndingInExtendedDay = nightSessions.filter((s) => {
        const nightEnd = new Date(s.end_time!);
        return nightEnd >= start && nightEnd <= end;
      });
      if (nightsEndingInExtendedDay.length > 0) {
        const latestEnd = [...nightsEndingInExtendedDay].sort(
          (a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime()
        )[0];
        const rise = new Date(latestEnd.end_time!);
        weekdayTotals[weekday].rise.push(rise.getHours() * 60 + rise.getMinutes());
      }

      const score = nightScoresByDateKey[dateKey];
      if (score != null) {
        weekdayTotals[weekday].score.push(score);
      }
    }

    return WEEKDAY_LABELS.map((label, weekday) => {
      const totals = weekdayTotals[weekday];
      const avg = (values: number[]) =>
        values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

      return {
        label,
        riseMinutes: avg(totals.rise),
        bedMinutes: avg(totals.bed),
        nightScore: avg(totals.score),
      };
    });
  }, [completedSessions, nightScoresByDateKey, period.days]);

  const maxAvgByWeekday = Math.max(...avgByWeekday.map((w) => w.avgTotal), 1);

  // Nap load by caregiver (last 30 days — sessions from hook are already last 30d)
  const caregiverLoad = useMemo(() => {
    const ended = sessions.filter((s) => s.end_time != null);
    const byId: Record<string, { naps: number; nights: number }> = {};
    caregivers.forEach((c) => {
      byId[c.id] = { naps: 0, nights: 0 };
    });
    ended.forEach((s) => {
      const key = s.logged_by;
      if (!byId[key]) byId[key] = { naps: 0, nights: 0 };
      if (s.type === 'nap') byId[key].naps += 1;
      else byId[key].nights += 1;
    });
    return caregivers
      .map((c) => ({ caregiver: c, naps: byId[c.id]?.naps ?? 0, nights: byId[c.id]?.nights ?? 0 }))
      .filter((x) => x.naps > 0 || x.nights > 0)
      .sort((a, b) => b.naps + b.nights - (a.naps + a.nights));
  }, [sessions, caregivers]);

  const maxCaregiverLoad = Math.max(...caregiverLoad.map((x) => x.naps + x.nights), 1);

  // For rise/bed chart: time range 4:00 (240 min) to 24:00 (1440 min) so we show 4 AM - midnight
  const timeMin = 4 * 60;
  const timeMax = 24 * 60;
  const riseBedPoints = avgRiseBedByWeekday.filter((r) => r.riseMinutes != null || r.bedMinutes != null);
  const scorePoints = avgRiseBedByWeekday.filter((r) => r.nightScore != null);

  useEffect(() => {
    setSelectedWeekdayIndex((current) => Math.min(current, Math.max(avgByWeekday.length - 1, 0)));
  }, [avgByWeekday.length]);

  useEffect(() => {
    setSelectedRiseBedIndex((current) => Math.min(current, Math.max(riseBedPoints.length - 1, 0)));
  }, [riseBedPoints.length]);

  useEffect(() => {
    setSelectedScoreIndex((current) => Math.min(current, Math.max(scorePoints.length - 1, 0)));
  }, [scorePoints.length]);

  useEffect(() => {
    setSelectedCaregiverIndex((current) => Math.min(current, Math.max(caregiverLoad.length - 1, 0)));
  }, [caregiverLoad.length]);

  useEffect(() => {
    setSelectedBucketIndex((current) => Math.min(current, Math.max(buckets.length - 1, 0)));
  }, [buckets.length]);

  const selectedWeekday = avgByWeekday[selectedWeekdayIndex] ?? avgByWeekday[0] ?? null;
  const selectedRiseBed = riseBedPoints[selectedRiseBedIndex] ?? riseBedPoints[0] ?? null;
  const selectedScore = scorePoints[selectedScoreIndex] ?? scorePoints[0] ?? null;
  const selectedCaregiver = caregiverLoad[selectedCaregiverIndex] ?? caregiverLoad[0] ?? null;
  const selectedBucket = buckets[selectedBucketIndex] ?? buckets[0] ?? null;

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
              return {
                stacks,
                label: w.label,
              };
            })}
            onPress={(_item: unknown, index?: number) => {
              if (typeof index === 'number') setSelectedWeekdayIndex(index);
            }}
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
            {...getBarChartAxisStyles(colors)}
          />
        </View>
        {selectedWeekday ? (
          <ChartSelectionCard
            title={`${selectedWeekday.label} average`}
            subtitle="Tap any bar to compare another weekday"
            accentColor={colors.napColor}
            hint="Tap bars"
            metrics={[
              {
                label: 'Total sleep',
                value: formatDuration(Math.round(selectedWeekday.avgTotal)),
                tint: colors.text,
              },
              {
                label: 'Night sleep',
                value: formatDuration(Math.round(selectedWeekday.avgNight)),
                tint: colors.nightColor,
                backgroundColor: colors.nightColorSoft,
              },
              {
                label: 'Nap sleep',
                value: formatDuration(Math.round(selectedWeekday.avgNap)),
                tint: colors.napColor,
                backgroundColor: colors.napColorSoft,
              },
            ]}
          />
        ) : null}
      </Card>

      {/* Rise & bedtime trend */}
      {riseBedPoints.length > 0 && (
        <Card padding="md" style={[styles.card, styles.overflowVisibleCard]}>
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
                  data: riseBedPoints.map((r, index) => ({
                    value: r.riseMinutes ?? timeMin,
                    label: r.label,
                    onPress: () => setSelectedRiseBedIndex(index),
                  })),
                  color: colors.napColor,
                  dataPointsColor: colors.napColor,
                },
                {
                  data: riseBedPoints.map((r, index) => ({
                    value: r.bedMinutes ?? timeMin,
                    label: r.label,
                    onPress: () => setSelectedRiseBedIndex(index),
                  })),
                  color: colors.nightColor,
                  dataPointsColor: colors.nightColor,
                },
              ]}
              width={SCREEN_WIDTH - Spacing.md * 4}
              overflowTop={120}
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
                autoAdjustPointerLabelPosition: true,
                radius: 5,
                pointerLabelWidth: 184,
                pointerLabelHeight: 112,
                pointerLabelComponent: (items: { value?: number; label?: string }[]) => {
                  const riseMinutes = items?.[0]?.value ?? null;
                  const bedMinutes = items?.[1]?.value ?? null;
                  return (
                    <View
                      style={[
                        styles.pointerCard,
                        {
                          backgroundColor: colors.surfaceSolid,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={[ChartTypography.tooltipTitle, { color: colors.text }]}>
                        {items?.[0]?.label ?? 'Selected day'}
                      </Text>
                      <View style={styles.pointerMetricRow}>
                        <Text style={[Typography.small, { color: colors.textSecondary }]}>Rise</Text>
                        <Text style={[Typography.bodySemiBold, { color: colors.napColor }]}>
                          {formatClockMinutes(riseMinutes)}
                        </Text>
                      </View>
                      <View style={styles.pointerMetricRow}>
                        <Text style={[Typography.small, { color: colors.textSecondary }]}>Bedtime</Text>
                        <Text style={[Typography.bodySemiBold, { color: colors.nightColor }]}>
                          {formatClockMinutes(bedMinutes)}
                        </Text>
                      </View>
                    </View>
                  );
                },
              }}
            />
          </View>
          {selectedRiseBed ? (
            <ChartSelectionCard
              title={selectedRiseBed.label}
              subtitle="Typical timing across the selected period"
              accentColor={colors.nightColor}
              hint="Tap points"
              metrics={[
                {
                  label: 'Average rise',
                  value: formatClockMinutes(selectedRiseBed.riseMinutes),
                  tint: colors.napColor,
                  backgroundColor: colors.napColorSoft,
                },
                {
                  label: 'Average bedtime',
                  value: formatClockMinutes(selectedRiseBed.bedMinutes),
                  tint: colors.nightColor,
                  backgroundColor: colors.nightColorSoft,
                },
                {
                  label: 'Night score',
                  value:
                    selectedRiseBed.nightScore != null ? `${selectedRiseBed.nightScore}/100` : '—',
                  tint: colors.text,
                },
              ]}
            />
          ) : null}
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
              data={scorePoints.map((r) => {
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
                  onPress: () => setSelectedScoreIndex(scorePoints.findIndex((point) => point.label === r.label)),
                };
              })}
              width={SCREEN_WIDTH - Spacing.md * 4}
              barBorderRadius={chartConfig.barRadius}
              barBorderTopLeftRadius={chartConfig.barBorderTopLeftRadius}
              barBorderTopRightRadius={chartConfig.barBorderTopRightRadius}
              maxValue={100}
              noOfSections={chartConfig.noOfSections}
              spacing={Math.max(chartConfig.spacing, (SCREEN_WIDTH - Spacing.md * 4 - 48) / scorePoints.length - 12)}
              initialSpacing={chartConfig.initialSpacing}
              endSpacing={chartConfig.endSpacing}
              hideRules={chartConfig.hideRules}
              isAnimated
              animationDuration={600}
              yAxisLabelWidth={28}
              {...getBarChartAxisStyles(colors)}
            />
          </View>
          {selectedScore ? (
            <ChartSelectionCard
              title={`${selectedScore.label} night`}
              subtitle={getNightScoreLabel(selectedScore.nightScore)}
              accentColor={colors.accent}
              hint="Tap bars"
              metrics={[
                {
                  label: 'Score',
                  value: `${selectedScore.nightScore ?? 0}/100`,
                  tint:
                    (selectedScore.nightScore ?? 0) >= 80
                      ? colors.success
                      : (selectedScore.nightScore ?? 0) >= 60
                        ? colors.accent
                        : (selectedScore.nightScore ?? 0) >= 40
                          ? colors.warning
                          : colors.error,
                },
                {
                  label: 'Rise',
                  value: formatClockMinutes(selectedScore.riseMinutes),
                  tint: colors.napColor,
                  backgroundColor: colors.napColorSoft,
                },
                {
                  label: 'Bedtime',
                  value: formatClockMinutes(selectedScore.bedMinutes),
                  tint: colors.nightColor,
                  backgroundColor: colors.nightColorSoft,
                },
              ]}
            />
          ) : null}
        </Card>
      )}

      {/* Load by caregiver */}
      {caregiverLoad.length > 0 && (
        <Card padding="md" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
            Load by caregiver
          </Text>
          <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.md }]}>
            Daytime and nighttime sessions in the last 30 days
          </Text>
          <View style={styles.chartWrapper}>
            <BarChart
              stackData={caregiverLoad.map((x) => {
                const stacks = [];
                if (x.nights > 0) stacks.push({ value: x.nights, color: colors.nightColor });
                if (x.naps > 0) stacks.push({ value: x.naps, color: colors.napColor });
                if (stacks.length === 0) stacks.push({ value: 0.01, color: colors.textTertiary });
                return {
                  stacks,
                  label: getInitials(x.caregiver.name),
                };
              })}
              onPress={(_item: unknown, index?: number) => {
                if (typeof index === 'number') setSelectedCaregiverIndex(index);
              }}
              width={SCREEN_WIDTH - Spacing.md * 4}
              barBorderRadius={chartConfig.barRadius}
              barBorderTopLeftRadius={chartConfig.barBorderTopLeftRadius}
              barBorderTopRightRadius={chartConfig.barBorderTopRightRadius}
              maxValue={maxCaregiverLoad * 1.15}
              noOfSections={chartConfig.noOfSections}
              spacing={Math.max(chartConfig.spacing, (SCREEN_WIDTH - Spacing.md * 4 - 48) / caregiverLoad.length - 12)}
              initialSpacing={chartConfig.initialSpacing}
              endSpacing={chartConfig.endSpacing}
              hideRules={chartConfig.hideRules}
              isAnimated
              animationDuration={600}
              {...getBarChartAxisStyles(colors)}
            />
          </View>
          {selectedCaregiver ? (
            <ChartSelectionCard
              title={selectedCaregiver.caregiver.name}
              subtitle="Sessions logged in the last 30 days"
              accentColor={colors.nightColor}
              hint="Tap bars"
              metrics={[
                {
                  label: 'Total sessions',
                  value: `${selectedCaregiver.naps + selectedCaregiver.nights}`,
                  tint: colors.text,
                },
                {
                  label: 'Daytime',
                  value: `${selectedCaregiver.naps} naps`,
                  tint: colors.napColor,
                  backgroundColor: colors.napColorSoft,
                },
                {
                  label: 'Nighttime',
                  value: `${selectedCaregiver.nights} nights`,
                  tint: colors.nightColor,
                  backgroundColor: colors.nightColorSoft,
                },
              ]}
            />
          ) : null}
          <View style={styles.caregiverLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.napColor }]} />
              <Text style={[ChartTypography.legendLabel, { color: colors.textTertiary }]}>Daytime</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.nightColor }]} />
              <Text style={[ChartTypography.legendLabel, { color: colors.textTertiary }]}>Nighttime</Text>
            </View>
          </View>
          <View style={styles.caregiverList}>
            {caregiverLoad.map(({ caregiver, naps, nights }, index) => (
              <View
                key={caregiver.id}
                style={[styles.caregiverLoadRow, index === caregiverLoad.length - 1 && styles.caregiverLoadRowLast]}
              >
                <Avatar name={caregiver.name} size={36} />
                <View style={styles.caregiverLoadInfo}>
                  <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{caregiver.name}</Text>
                  <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                    {naps} daytime · {nights} nighttime
                  </Text>
                </View>
              </View>
            ))}
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
                onPress: () => setSelectedBucketIndex(buckets.findIndex((bucket) => bucket.key === b.key)),
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
              {...getBarChartAxisStyles(colors)}
            />
          </View>
          {selectedBucket ? (
            <ChartSelectionCard
              title={`Week of ${selectedBucket.label}`}
              subtitle="Tap a bar to inspect another week"
              accentColor={colors.napColor}
              hint="Tap bars"
              metrics={[
                {
                  label: 'Naps logged',
                  value: `${statsByBucket[selectedBucket.key].napCount}`,
                  tint: colors.napColor,
                  backgroundColor: colors.napColorSoft,
                },
                {
                  label: 'Nap total',
                  value: formatDuration(Math.round(statsByBucket[selectedBucket.key].napTotal)),
                  tint: colors.text,
                },
                {
                  label: 'Daily avg',
                  value: formatDuration(Math.round(statsByBucket[selectedBucket.key].napTotal / 7)),
                  tint: colors.text,
                },
              ]}
            />
          ) : null}
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
  overflowVisibleCard: {
    overflow: 'visible',
  },
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
    overflow: 'visible',
  },
  selectionCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  selectionAccent: {
    width: 4,
  },
  selectionBody: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  selectionTextBlock: {
    flex: 1,
  },
  selectionHint: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  selectionMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  selectionMetric: {
    flex: 1,
    minWidth: '30%',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    gap: 2,
  },
  pointerCard: {
    width: 184,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  pointerMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
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
  caregiverLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  caregiverList: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  caregiverLoadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  caregiverLoadRowLast: {
    borderBottomWidth: 0,
  },
  caregiverLoadInfo: {
    flex: 1,
  },
});
