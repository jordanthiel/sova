import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { Avatar } from '@/components/ui/Avatar';
import { DaySelector } from '@/components/log/DaySelector';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { Spacing, Typography, Radius, ChartTypography } from '@/constants/theme';
import { chartConfig, getBarChartAxisStyles } from '@/constants/chartConfig';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useNightSleepScores } from '@/hooks/useNightSleepScores';
import { formatDuration } from '@/utils/formatTime';
import { addDays, format, subDays, differenceInCalendarDays, max as maxDate, min as minDate } from 'date-fns';
import { getExtendedDayBounds, getExtendedDayCalendarDate, sessionOverlapsExtendedDay } from '@/utils/dateUtils';
import type { Database } from '@/lib/supabase';
import type { Caregiver } from '@/types/domain';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

/** Align with useRealtimeSleepSessions fetch window */
const MAX_HISTORY_DAYS = 400;
/** Daily buckets when range is at most this many calendar days */
const MAX_DAILY_BUCKET_DAYS = 31;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type ExplorerMode = 'single' | 'range';

type Bucket = { key: string; label: string; start: Date; end: Date };

type DetailMetric = {
  label: string;
  value: string;
  tint?: string;
  backgroundColor?: string;
};

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function calendarDaysInclusive(rangeStart: Date, rangeEnd: Date): number {
  return differenceInCalendarDays(startOfLocalDay(rangeEnd), startOfLocalDay(rangeStart)) + 1;
}

function getExplorerBounds(rangeStart: Date, rangeEnd: Date) {
  const rs = startOfLocalDay(rangeStart);
  const re = startOfLocalDay(rangeEnd);
  const first = getExtendedDayBounds(rs).start;
  const last = getExtendedDayBounds(re).end;
  return { rangeStartCal: rs, rangeEndCal: re, explorerStart: first, explorerEnd: last };
}

function getExplorerBuckets(rangeStartCal: Date, rangeEndCal: Date): { buckets: Bucket[]; bucketGranularity: 'day' | 'week' } {
  const n = calendarDaysInclusive(rangeStartCal, rangeEndCal);
  if (n <= MAX_DAILY_BUCKET_DAYS) {
    const buckets: Bucket[] = [];
    for (let i = 0; i < n; i++) {
      const d = addDays(startOfLocalDay(rangeStartCal), i);
      const { start, end } = getExtendedDayBounds(d);
      buckets.push({
        key: format(d, 'yyyy-MM-dd'),
        label: n <= 14 ? format(d, 'EEE M/d') : format(d, 'M/d'),
        start,
        end,
      });
    }
    return { buckets, bucketGranularity: 'day' };
  }
  const buckets: Bucket[] = [];
  let cur = startOfLocalDay(rangeStartCal);
  const end = startOfLocalDay(rangeEndCal);
  while (cur <= end) {
    const chunkEnd = minDate([addDays(cur, 6), end]);
    const sb = getExtendedDayBounds(cur);
    const eb = getExtendedDayBounds(chunkEnd);
    buckets.push({
      key: `w-${format(cur, 'yyyy-MM-dd')}`,
      label: `${format(cur, 'MMM d')}–${format(chunkEnd, 'MMM d')}`,
      start: sb.start,
      end: eb.end,
    });
    cur = addDays(cur, 7);
  }
  return { buckets, bucketGranularity: 'week' };
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

export function TrendsTab({ sessions, ageMonths: _ageMonths, caregivers }: TrendsTabProps) {
  const colors = useThemeColors();
  const { currentBabyId } = useCurrentBaby();
  const today = startOfLocalDay(new Date());
  const maxPickDate = addDays(today, 1);

  const earliestLogDay = useMemo(() => {
    const t0 = startOfLocalDay(new Date());
    if (!sessions?.length) return subDays(t0, MAX_HISTORY_DAYS);
    let minMs = t0.getTime();
    for (const s of sessions) {
      const t = new Date(s.start_time).getTime();
      if (t < minMs) minMs = t;
    }
    return startOfLocalDay(new Date(minMs));
  }, [sessions]);

  const [explorerMode, setExplorerMode] = useState<ExplorerMode>('range');
  const [rangeStart, setRangeStart] = useState(() => subDays(today, 29));
  const [rangeEnd, setRangeEnd] = useState(() => today);
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);

  const [selectedWeekdayIndex, setSelectedWeekdayIndex] = useState(0);
  const [selectedRiseBedIndex, setSelectedRiseBedIndex] = useState(0);
  const [selectedScoreIndex, setSelectedScoreIndex] = useState(0);
  const [selectedCaregiverIndex, setSelectedCaregiverIndex] = useState(0);
  const [selectedBucketIndex, setSelectedBucketIndex] = useState(0);
  const [selectedDailySleepIndex, setSelectedDailySleepIndex] = useState(0);

  const clampRangeStart = useCallback(
    (d: Date) => maxDate([minDate([startOfLocalDay(d), today]), earliestLogDay]),
    [today, earliestLogDay]
  );

  const clampRangeEnd = useCallback(
    (d: Date) => maxDate([minDate([startOfLocalDay(d), today]), earliestLogDay]),
    [today, earliestLogDay]
  );

  const setRangeStartSafe = useCallback(
    (d: Date) => {
      const next = clampRangeStart(d);
      setRangeStart(next);
      setRangeEnd((end) => (end < next ? next : end));
    },
    [clampRangeStart]
  );

  const setRangeEndSafe = useCallback(
    (d: Date) => {
      const next = clampRangeEnd(d);
      setRangeEnd(next);
      setRangeStart((start) => (start > next ? next : start));
    },
    [clampRangeEnd]
  );

  const onSingleDayChange = useCallback(
    (d: Date) => {
      const day = clampRangeStart(d);
      setRangeStart(day);
      setRangeEnd(day);
    },
    [clampRangeStart]
  );

  const { explorerStart, explorerEnd, rangeStartCal, rangeEndCal } = useMemo(
    () => getExplorerBounds(rangeStart, rangeEnd),
    [rangeStart, rangeEnd]
  );

  const { buckets, bucketGranularity } = useMemo(
    () => getExplorerBuckets(rangeStartCal, rangeEndCal),
    [rangeStartCal, rangeEndCal]
  );

  const rangeDayCount = calendarDaysInclusive(rangeStartCal, rangeEndCal);

  const trendScoreDateKeys = useMemo(() => {
    const keys: string[] = [];
    let d = new Date(rangeStartCal);
    const end = new Date(rangeEndCal);
    while (d <= end) {
      keys.push(format(d, 'yyyy-MM-dd'));
      d = addDays(d, 1);
    }
    return keys;
  }, [rangeStartCal, rangeEndCal]);

  const nightScoresByDateKey = useNightSleepScores(currentBabyId ?? null, trendScoreDateKeys, sessions ?? []);

  const completedSessions = useMemo(
    () => sessions.filter((s) => s.end_time != null && s.duration_minutes != null),
    [sessions]
  );

  const sessionsInRange = useMemo(
    () =>
      completedSessions.filter((s) =>
        sessionOverlapsExtendedDay(s.start_time, s.end_time, explorerStart, explorerEnd)
      ),
    [completedSessions, explorerStart, explorerEnd]
  );

  const { statsByBucket, averages } = useMemo(() => {
    const statsByBucket: Record<
      string,
      {
        napTotal: number;
        nightTotal: number;
        dailyTotal: number;
        napCount: number;
        nightCount: number;
        nights: SleepSession[];
        naps: SleepSession[];
      }
    > = {};
    buckets.forEach((b) => {
      statsByBucket[b.key] = {
        napTotal: 0,
        nightTotal: 0,
        dailyTotal: 0,
        napCount: 0,
        nightCount: 0,
        nights: [],
        naps: [],
      };
    });

    sessionsInRange.forEach((s) => {
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
        rec.nightCount += 1;
        rec.nights.push(s);
      }
      rec.dailyTotal += s.duration_minutes;
    });

    const totalNap = buckets.reduce((sum, b) => sum + statsByBucket[b.key].napTotal, 0);
    const totalNight = buckets.reduce((sum, b) => sum + statsByBucket[b.key].nightTotal, 0);
    const bucketsWithNap = buckets.filter((b) => statsByBucket[b.key].napTotal > 0).length;
    const bucketsWithNight = buckets.filter((b) => statsByBucket[b.key].nightTotal > 0).length;
    const bucketsWithAnySleep = buckets.filter((b) => statsByBucket[b.key].dailyTotal > 0).length;
    const divisorNap =
      bucketGranularity === 'day' ? bucketsWithNap : Math.max(1, bucketsWithNap * 7);
    const divisorNight =
      bucketGranularity === 'day' ? bucketsWithNight : Math.max(1, bucketsWithNight * 7);
    const divisorDaily =
      bucketGranularity === 'day' ? bucketsWithAnySleep : Math.max(1, bucketsWithAnySleep * 7);
    const avgNapPerDay = bucketsWithNap > 0 ? totalNap / divisorNap : 0;
    const avgNightPerDay = bucketsWithNight > 0 ? totalNight / divisorNight : 0;
    const avgDailyTotal = bucketsWithAnySleep > 0 ? (totalNap + totalNight) / divisorDaily : 0;

    const totalNapSessions = sessionsInRange.filter((s) => s.type === 'nap').length;
    const totalNightSessions = sessionsInRange.filter((s) => s.type === 'night').length;

    return {
      statsByBucket,
      averages: {
        avgNapPerDay,
        avgNightPerDay,
        avgDailyTotal,
        daysInPeriod: rangeDayCount,
        totalNapMinutes: totalNap,
        totalNightMinutes: totalNight,
        totalNapSessions,
        totalNightSessions,
      },
    };
  }, [sessionsInRange, buckets, bucketGranularity, rangeDayCount]);

  const napHighlights = useMemo(() => {
    const naps = sessionsInRange.filter((s) => s.type === 'nap');
    if (naps.length === 0) {
      return { longest: null as SleepSession | null, shortest: null as SleepSession | null, avgMin: 0 };
    }
    const sorted = [...naps].sort(
      (a, b) => (b.duration_minutes ?? 0) - (a.duration_minutes ?? 0)
    );
    const longest = sorted[0];
    const shortest = sorted.length > 1 ? sorted[sorted.length - 1] : null;
    const avgMin =
      naps.reduce((s, x) => s + (x.duration_minutes ?? 0), 0) / naps.length;
    return { longest, shortest, avgMin };
  }, [sessionsInRange]);

  const avgByWeekday = useMemo(() => {
    const dowTotals: { nap: number[]; night: number[] }[] = Array.from({ length: 7 }, () => ({
      nap: [],
      night: [],
    }));
    for (let i = 0; i < rangeDayCount; i++) {
      const d = addDays(rangeStartCal, i);
      const { start, end } = getExtendedDayBounds(d);
      let nap = 0;
      let night = 0;
      for (const s of sessionsInRange) {
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
  }, [sessionsInRange, rangeStartCal, rangeDayCount]);

  const avgRiseBedByWeekday = useMemo(() => {
    const weekdayTotals: {
      rise: number[];
      bed: number[];
      score: number[];
    }[] = Array.from({ length: 7 }, () => ({
      rise: [],
      bed: [],
      score: [],
    }));

    const nightSessions = sessionsInRange.filter((s) => s.type === 'night' && s.end_time != null);

    for (let i = 0; i < rangeDayCount; i++) {
      const day = addDays(rangeStartCal, i);
      const dateKey = format(day, 'yyyy-MM-dd');
      const { start, end } = getExtendedDayBounds(day);
      const weekday = day.getDay();

      const nightsOverlapping = nightSessions.filter((s) =>
        sessionOverlapsExtendedDay(s.start_time, s.end_time!, start, end)
      );
      if (nightsOverlapping.length > 0) {
        const earliest = [...nightsOverlapping].sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        )[0];
        const latest = [...nightsOverlapping].sort(
          (a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime()
        )[0];
        const bed = new Date(earliest.start_time);
        const rise = new Date(latest.end_time!);
        weekdayTotals[bed.getDay()].bed.push(bed.getHours() * 60 + bed.getMinutes());
        weekdayTotals[rise.getDay()].rise.push(rise.getHours() * 60 + rise.getMinutes());
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
  }, [sessionsInRange, nightScoresByDateKey, rangeStartCal, rangeDayCount]);

  const maxAvgByWeekday = Math.max(...avgByWeekday.map((w) => w.avgTotal), 1);

  const caregiverLoad = useMemo(() => {
    const ended = sessions.filter(
      (s) =>
        s.end_time != null &&
        sessionOverlapsExtendedDay(s.start_time, s.end_time, explorerStart, explorerEnd)
    );
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
  }, [sessions, caregivers, explorerStart, explorerEnd]);

  const maxCaregiverLoad = Math.max(...caregiverLoad.map((x) => x.naps + x.nights), 1);

  const scoreBarData = useMemo(() => {
    if (bucketGranularity === 'day') {
      return buckets
        .map((b) => {
          const score = nightScoresByDateKey[b.key];
          return { key: b.key, label: b.label, score: score ?? null };
        })
        .filter((x) => x.score != null);
    }
    return buckets
      .map((b) => {
        const keys: string[] = [];
        let d = startOfLocalDay(b.start);
        const endMs = b.end.getTime();
        while (d.getTime() < endMs) {
          keys.push(format(d, 'yyyy-MM-dd'));
          d = addDays(d, 1);
        }
        const vals = keys.map((k) => nightScoresByDateKey[k]).filter((v): v is number => v != null);
        const avg = vals.length ? Math.round(vals.reduce((a, c) => a + c, 0) / vals.length) : null;
        return { key: b.key, label: b.label, score: avg };
      })
      .filter((x) => x.score != null);
  }, [buckets, bucketGranularity, nightScoresByDateKey]);

  const maxDailySleep = Math.max(
    1,
    ...buckets.map((b) => statsByBucket[b.key].napTotal + statsByBucket[b.key].nightTotal)
  );

  const maxNapCountBar = Math.max(1, ...buckets.map((b) => statsByBucket[b.key].napCount));

  const timeMin = 4 * 60;
  const timeMax = 24 * 60;
  const riseBedPoints = avgRiseBedByWeekday.filter((r) => r.riseMinutes != null || r.bedMinutes != null);
  const scorePoints = avgRiseBedByWeekday.filter((r) => r.nightScore != null);

  const riseBedLineChartKey = useMemo(
    () =>
      `${format(rangeStartCal, 'yyyy-MM-dd')}_${format(rangeEndCal, 'yyyy-MM-dd')}-${avgRiseBedByWeekday
        .map((p) => `${p.riseMinutes ?? 'n'}:${p.bedMinutes ?? 'n'}`)
        .join('|')}`,
    [rangeStartCal, rangeEndCal, avgRiseBedByWeekday]
  );

  useEffect(() => {
    setSelectedWeekdayIndex((current) => Math.min(current, Math.max(avgByWeekday.length - 1, 0)));
  }, [avgByWeekday.length]);

  useEffect(() => {
    setSelectedRiseBedIndex(0);
  }, [riseBedLineChartKey]);

  useEffect(() => {
    setSelectedScoreIndex((current) => Math.min(current, Math.max(scoreBarData.length - 1, 0)));
  }, [scoreBarData.length]);

  useEffect(() => {
    setSelectedCaregiverIndex((current) => Math.min(current, Math.max(caregiverLoad.length - 1, 0)));
  }, [caregiverLoad.length]);

  useEffect(() => {
    setSelectedBucketIndex((current) => Math.min(current, Math.max(buckets.length - 1, 0)));
  }, [buckets.length]);

  useEffect(() => {
    setSelectedDailySleepIndex((current) => Math.min(current, Math.max(buckets.length - 1, 0)));
  }, [buckets.length]);

  const selectedWeekday = avgByWeekday[selectedWeekdayIndex] ?? avgByWeekday[0] ?? null;
  const selectedRiseBed = riseBedPoints[selectedRiseBedIndex] ?? riseBedPoints[0] ?? null;
  const selectedScoreBar = scoreBarData[selectedScoreIndex] ?? scoreBarData[0] ?? null;
  const selectedCaregiver = caregiverLoad[selectedCaregiverIndex] ?? caregiverLoad[0] ?? null;
  const selectedBucket = buckets[selectedBucketIndex] ?? buckets[0] ?? null;
  const selectedDailySleepBucket = buckets[selectedDailySleepIndex] ?? buckets[0] ?? null;

  const rangeTitle =
    explorerMode === 'single' || calendarDaysInclusive(rangeStartCal, rangeEndCal) === 1
      ? format(rangeStartCal, 'EEEE, MMM d, yyyy')
      : `${format(rangeStartCal, 'MMM d, yyyy')} – ${format(rangeEndCal, 'MMM d, yyyy')}`;

  const hasAnySleepInRange = sessionsInRange.length > 0;

  const onPickerChange = (_e: unknown, date?: Date) => {
    if (Platform.OS === 'android') setPickerTarget(null);
    if (!date || !pickerTarget) return;
    if (pickerTarget === 'start') setRangeStartSafe(date);
    else setRangeEndSafe(date);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.explorerHeader}>
        <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.sm }]}>
          {rangeTitle} · {rangeDayCount} day{rangeDayCount === 1 ? '' : 's'}
          {bucketGranularity === 'week' ? ' · grouped by week' : ''}
        </Text>

        <View style={styles.modeRow}>
          {(['single', 'range'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.modeChip, { backgroundColor: explorerMode === m ? colors.accent : colors.surface }]}
              onPress={() => {
                Haptics.selectionAsync();
                setExplorerMode(m);
                if (m === 'single') {
                  const day = clampRangeStart(rangeEnd);
                  setRangeStart(day);
                  setRangeEnd(day);
                }
              }}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  ChartTypography.legendLabel,
                  { color: explorerMode === m ? colors.background : colors.textTertiary },
                ]}
              >
                {m === 'single' ? 'Single day' : 'Date range'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {explorerMode === 'single' ? (
          <View style={{ marginTop: Spacing.sm }}>
            <DaySelector
              selectedDate={rangeStart}
              onDateChange={onSingleDayChange}
              todayAnchor={getExtendedDayCalendarDate(new Date())}
            />
          </View>
        ) : (
          <View style={styles.rangePickRow}>
            <TouchableOpacity
              style={[styles.datePill, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => {
                Haptics.selectionAsync();
                setPickerTarget('start');
              }}
              activeOpacity={0.85}
            >
              <Text style={[Typography.small, { color: colors.textTertiary }]}>From</Text>
              <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
                {format(rangeStart, 'MMM d, yyyy')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.datePill, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => {
                Haptics.selectionAsync();
                setPickerTarget('end');
              }}
              activeOpacity={0.85}
            >
              <Text style={[Typography.small, { color: colors.textTertiary }]}>To</Text>
              <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
                {format(rangeEnd, 'MMM d, yyyy')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {pickerTarget && explorerMode === 'range' && (
          <View style={styles.pickerBlock}>
            <DateTimePicker
              value={pickerTarget === 'start' ? rangeStart : rangeEnd}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onPickerChange}
              themeVariant="dark"
              minimumDate={earliestLogDay}
              maximumDate={maxPickDate}
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity onPress={() => setPickerTarget(null)} style={styles.doneBtn}>
                <Text style={[Typography.buttonSmall, { color: colors.accent }]}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {!hasAnySleepInRange ? (
        <DarkPanel padding="lg" shadow="sm" style={styles.card}>
          <Text style={[Typography.bodyMedium, { color: colors.textSecondary, textAlign: 'center' }]}>
            No completed sleep in this window. Try another range or log sleep from the Log tab.
          </Text>
        </DarkPanel>
      ) : null}

      {/* Summary */}
      <DarkPanel padding="md" shadow="sm" style={styles.card}>
        <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>Summary</Text>
        <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.md }]}>
          Averages use days that have sleep in the window (extended days 7am–7am).
        </Text>
        <View style={styles.statGrid}>
          <View style={[styles.statBox, { backgroundColor: colors.napColorSoft }]}>
            <Text style={[Typography.caption, { color: colors.textTertiary }]}>Nap avg / day</Text>
            <Text style={[Typography.h3, { color: colors.napColor }]}>
              {formatDuration(Math.round(averages.avgNapPerDay))}
            </Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.nightColorSoft }]}>
            <Text style={[Typography.caption, { color: colors.textTertiary }]}>Night avg / day</Text>
            <Text style={[Typography.h3, { color: colors.nightColor }]}>
              {formatDuration(Math.round(averages.avgNightPerDay))}
            </Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[Typography.caption, { color: colors.textTertiary }]}>Total sleep avg / day</Text>
            <Text style={[Typography.h3, { color: colors.text }]}>
              {formatDuration(Math.round(averages.avgDailyTotal))}
            </Text>
          </View>
        </View>
        <View style={[styles.detailRow, { marginTop: Spacing.md }]}>
          <Text style={[Typography.caption, { color: colors.textTertiary }]}>
            {averages.totalNapSessions} nap sessions · {averages.totalNightSessions} night sessions ·{' '}
            {formatDuration(Math.round(averages.totalNapMinutes + averages.totalNightMinutes))} total logged
          </Text>
        </View>
      </DarkPanel>

      {/* Nap highlights */}
      {napHighlights.longest != null && (
        <DarkPanel padding="md" shadow="sm" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.sm }]}>Nap highlights</Text>
          <View style={styles.highlightGrid}>
            <View style={[styles.highlightBox, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[Typography.small, { color: colors.textTertiary }]}>Longest nap</Text>
              <Text style={[Typography.bodySemiBold, { color: colors.napColor }]}>
                {formatDuration(napHighlights.longest.duration_minutes ?? 0)}
              </Text>
              <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                {format(new Date(napHighlights.longest.start_time), 'MMM d, h:mm a')}
              </Text>
            </View>
            <View style={[styles.highlightBox, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[Typography.small, { color: colors.textTertiary }]}>Avg nap length</Text>
              <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
                {formatDuration(Math.round(napHighlights.avgMin))}
              </Text>
            </View>
            {napHighlights.shortest && napHighlights.shortest.id !== napHighlights.longest.id ? (
              <View style={[styles.highlightBox, { backgroundColor: colors.surfaceElevated }]}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>Shortest nap</Text>
                <Text style={[Typography.bodySemiBold, { color: colors.textSecondary }]}>
                  {formatDuration(napHighlights.shortest.duration_minutes ?? 0)}
                </Text>
              </View>
            ) : null}
          </View>
        </DarkPanel>
      )}

      {/* Sleep by bucket (daily or weekly) */}
      {bucketGranularity === 'day' && buckets.length > 0 && (
        <DarkPanel padding="md" shadow="sm" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
            Sleep by day
          </Text>
          <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.lg }]}>
            Stacked nap (day) and night sleep minutes per extended day
          </Text>
          <View style={styles.chartWrapper}>
            <BarChart
              stackData={buckets.map((b, index) => {
                const rec = statsByBucket[b.key];
                const stacks = [];
                if (rec.nightTotal > 0) stacks.push({ value: rec.nightTotal, color: colors.nightColor });
                if (rec.napTotal > 0) stacks.push({ value: rec.napTotal, color: colors.napColor });
                if (stacks.length === 0) stacks.push({ value: 0.01, color: colors.textTertiary });
                return {
                  stacks,
                  label: b.label,
                  onPress: () => {
                    setSelectedDailySleepIndex(index);
                  },
                };
              })}
              width={SCREEN_WIDTH - Spacing.md * 4}
              barBorderRadius={chartConfig.barRadius}
              barBorderTopLeftRadius={chartConfig.barBorderTopLeftRadius}
              barBorderTopRightRadius={chartConfig.barBorderTopRightRadius}
              maxValue={maxDailySleep * 1.08}
              noOfSections={chartConfig.noOfSections}
              spacing={Math.max(
                chartConfig.spacing,
                buckets.length > 1 ? (SCREEN_WIDTH - Spacing.md * 4 - 48) / (buckets.length - 1) - 8 : chartConfig.spacing
              )}
              initialSpacing={chartConfig.initialSpacing}
              endSpacing={chartConfig.endSpacing}
              hideRules={chartConfig.hideRules}
              isAnimated={false}
              {...getBarChartAxisStyles(colors)}
            />
          </View>
          {selectedDailySleepBucket ? (
            <ChartSelectionCard
              title={selectedDailySleepBucket.label}
              subtitle="Minutes overlapping this extended day"
              accentColor={colors.nightColor}
              hint="Tap bars"
              metrics={[
                {
                  label: 'Total sleep',
                  value: formatDuration(statsByBucket[selectedDailySleepBucket.key].dailyTotal),
                  tint: colors.text,
                },
                {
                  label: 'Night',
                  value: formatDuration(statsByBucket[selectedDailySleepBucket.key].nightTotal),
                  tint: colors.nightColor,
                  backgroundColor: colors.nightColorSoft,
                },
                {
                  label: 'Naps',
                  value: formatDuration(statsByBucket[selectedDailySleepBucket.key].napTotal),
                  tint: colors.napColor,
                  backgroundColor: colors.napColorSoft,
                },
                {
                  label: 'Nap count',
                  value: `${statsByBucket[selectedDailySleepBucket.key].napCount}`,
                  tint: colors.text,
                },
              ]}
            />
          ) : null}
        </DarkPanel>
      )}

      {bucketGranularity === 'day' && buckets.length > 0 && (
        <DarkPanel padding="md" shadow="sm" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>Naps logged per day</Text>
          <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.lg }]}>
            Count of completed nap sessions starting in each extended day
          </Text>
          <View style={styles.chartWrapper}>
            <BarChart
              data={buckets.map((b) => ({
                value: Math.max(0.01, statsByBucket[b.key].napCount),
                label: b.label,
                frontColor: colors.napColor,
              }))}
              width={SCREEN_WIDTH - Spacing.md * 4}
              barBorderRadius={chartConfig.barRadius}
              barBorderTopLeftRadius={chartConfig.barBorderTopLeftRadius}
              barBorderTopRightRadius={chartConfig.barBorderTopRightRadius}
              maxValue={maxNapCountBar * 1.15}
              noOfSections={chartConfig.noOfSections}
              spacing={Math.max(
                chartConfig.spacing,
                buckets.length > 1 ? (SCREEN_WIDTH - Spacing.md * 4 - 48) / (buckets.length - 1) - 8 : chartConfig.spacing
              )}
              initialSpacing={chartConfig.initialSpacing}
              endSpacing={chartConfig.endSpacing}
              hideRules={chartConfig.hideRules}
              isAnimated={false}
              {...getBarChartAxisStyles(colors)}
            />
          </View>
        </DarkPanel>
      )}

      {/* Weekday pattern */}
      <DarkPanel padding="md" shadow="sm" style={styles.card}>
        <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>Sleep by weekday</Text>
        <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.lg }]}>
          Average nap vs night minutes for each weekday across the selected window
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
            isAnimated={false}
            {...getBarChartAxisStyles(colors)}
          />
        </View>
        {selectedWeekday ? (
          <ChartSelectionCard
            title={`${selectedWeekday.label} average`}
            subtitle="Across days that fall on this weekday in your range"
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
      </DarkPanel>

      {riseBedPoints.length > 0 && (
        <DarkPanel padding="md" shadow="sm" style={[styles.card, styles.overflowVisibleCard]}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>Rise & bedtime</Text>
          <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.sm }]}>
            Averages by weekday of week (rise uses wake day)
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
              key={riseBedLineChartKey}
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
              spacing={
                riseBedPoints.length > 1 ? (SCREEN_WIDTH - Spacing.md * 4 - 48) / (riseBedPoints.length - 1) : 60
              }
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
              curved={false}
              isAnimated={false}
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
                        { backgroundColor: colors.surfaceSolid, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[ChartTypography.tooltipTitle, { color: colors.text }]}>
                        {items?.[0]?.label ?? 'Selected'}
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
              subtitle="Typical timing in this window"
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
                  value: selectedRiseBed.nightScore != null ? `${selectedRiseBed.nightScore}/100` : '—',
                  tint: colors.text,
                },
              ]}
            />
          ) : null}
        </DarkPanel>
      )}

      {scoreBarData.length > 0 && (
        <DarkPanel padding="md" shadow="sm" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>Night sleep score</Text>
          <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.lg }]}>
            {bucketGranularity === 'day'
              ? '0–100 per night (when a score exists for that date)'
              : 'Average score per week in the window'}
          </Text>
          <View style={styles.chartWrapper}>
            <BarChart
              data={scoreBarData.map((r) => {
                const score = r.score ?? 0;
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
                  onPress: () =>
                    setSelectedScoreIndex(scoreBarData.findIndex((point) => point.key === r.key)),
                };
              })}
              width={SCREEN_WIDTH - Spacing.md * 4}
              barBorderRadius={chartConfig.barRadius}
              barBorderTopLeftRadius={chartConfig.barBorderTopLeftRadius}
              barBorderTopRightRadius={chartConfig.barBorderTopRightRadius}
              maxValue={100}
              noOfSections={chartConfig.noOfSections}
              spacing={Math.max(
                chartConfig.spacing,
                (SCREEN_WIDTH - Spacing.md * 4 - 48) / Math.max(scoreBarData.length, 1) - 12
              )}
              initialSpacing={chartConfig.initialSpacing}
              endSpacing={chartConfig.endSpacing}
              hideRules={chartConfig.hideRules}
              isAnimated={false}
              yAxisLabelWidth={28}
              {...getBarChartAxisStyles(colors)}
            />
          </View>
          {selectedScoreBar ? (
            <ChartSelectionCard
              title={`${selectedScoreBar.label}`}
              subtitle={getNightScoreLabel(selectedScoreBar.score)}
              accentColor={colors.accent}
              hint="Tap bars"
              metrics={[
                {
                  label: 'Score',
                  value: `${selectedScoreBar.score ?? 0}/100`,
                  tint:
                    (selectedScoreBar.score ?? 0) >= 80
                      ? colors.success
                      : (selectedScoreBar.score ?? 0) >= 60
                        ? colors.accent
                        : (selectedScoreBar.score ?? 0) >= 40
                          ? colors.warning
                          : colors.error,
                },
              ]}
            />
          ) : null}
        </DarkPanel>
      )}

      {caregiverLoad.length > 0 && (
        <DarkPanel padding="md" shadow="sm" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>Load by caregiver</Text>
          <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.md }]}>
            Sessions overlapping your selected window
          </Text>
          <View style={styles.chartWrapper}>
            <BarChart
              stackData={caregiverLoad.map((x) => {
                const stacks = [];
                if (x.nights > 0) stacks.push({ value: x.nights, color: colors.nightColor });
                if (x.naps > 0) stacks.push({ value: x.naps, color: colors.napColor });
                if (stacks.length === 0) stacks.push({ value: 0.01, color: colors.textTertiary });
                return { stacks, label: getInitials(x.caregiver.name) };
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
              spacing={Math.max(
                chartConfig.spacing,
                (SCREEN_WIDTH - Spacing.md * 4 - 48) / caregiverLoad.length - 12
              )}
              initialSpacing={chartConfig.initialSpacing}
              endSpacing={chartConfig.endSpacing}
              hideRules={chartConfig.hideRules}
              isAnimated={false}
              {...getBarChartAxisStyles(colors)}
            />
          </View>
          {selectedCaregiver ? (
            <ChartSelectionCard
              title={selectedCaregiver.caregiver.name}
              subtitle="Logged in selected window"
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
        </DarkPanel>
      )}

      {bucketGranularity === 'week' && (
        <DarkPanel padding="md" shadow="sm" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>Naps per week</Text>
          <Text style={[ChartTypography.tooltipValue, { color: colors.textTertiary, marginBottom: Spacing.lg }]}>
            Count of completed naps starting in each week bucket
          </Text>
          <View style={styles.chartWrapper}>
            <BarChart
              data={buckets.map((b) => ({
                value: Math.max(0.01, statsByBucket[b.key].napCount),
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
              spacing={Math.max(
                chartConfig.spacing,
                (SCREEN_WIDTH - Spacing.md * 4 - 48) / buckets.length - 12
              )}
              initialSpacing={chartConfig.initialSpacing}
              endSpacing={chartConfig.endSpacing}
              hideRules={chartConfig.hideRules}
              isAnimated={false}
              {...getBarChartAxisStyles(colors)}
            />
          </View>
          {selectedBucket ? (
            <ChartSelectionCard
              title={selectedBucket.label}
              subtitle="Week bucket totals"
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
                  label: 'Night total',
                  value: formatDuration(Math.round(statsByBucket[selectedBucket.key].nightTotal)),
                  tint: colors.nightColor,
                  backgroundColor: colors.nightColorSoft,
                },
              ]}
            />
          ) : null}
        </DarkPanel>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xxl },
  explorerHeader: {
    marginBottom: Spacing.sm,
  },
  modeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  modeChip: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  rangePickRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  datePill: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: 4,
  },
  pickerBlock: {
    marginTop: Spacing.sm,
  },
  doneBtn: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.sm,
  },
  detailRow: {
    paddingHorizontal: Spacing.xs,
  },
  highlightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  highlightBox: {
    flex: 1,
    minWidth: '28%',
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: 4,
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
