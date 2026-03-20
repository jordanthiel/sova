import { useRef, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format, addDays, subDays, subWeeks, addWeeks, startOfWeek } from 'date-fns';
import { SleepScoreRing } from '@/components/ui/SleepScoreRing';
import { Spacing, Radius, ChartTypography } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import type { SleepEvent } from '@/types/domain';

const TIME_LABELS = [
  '6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p', '12a', '2a', '4a',
];
const MIN_ROW_HEIGHT = 32;
const TIME_LABEL_WIDTH = 36;
const DAY_HEADER_HEIGHT = 60;
const LOAD_MORE_THRESHOLD_DAYS = 14;

/** Parse 'yyyy-MM-dd' as local date at 6am. */
function get6am(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d, 6, 0, 0, 0);
}

/** Parse 'yyyy-MM-dd' as local midnight. */
function parseLocal(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function minutesFromDayStart(d: Date, dayStart6am: Date): number {
  const totalMin = (d.getTime() - dayStart6am.getTime()) / 60000;
  return Math.max(0, Math.min(totalMin, 24 * 60));
}

/** Generate day keys from stripStart (inclusive) to stripEnd (inclusive). */
function generateDayKeysFromRange(stripStart: Date, stripEnd: Date): string[] {
  const keys: string[] = [];
  let cur = new Date(stripStart);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(stripEnd);
  end.setHours(23, 59, 59, 999);
  while (cur <= end) {
    keys.push(format(cur, 'yyyy-MM-dd'));
    cur = addDays(cur, 1);
  }
  return keys;
}

interface WeekTimelineStripProps {
  /** Range of the strip (can grow when load more is triggered). */
  stripStart: Date;
  stripEnd: Date;
  /** Used to scroll to center when selector changes. */
  weekStart: Date;
  eventsByDay: Record<string, SleepEvent[]>;
  /** Night sleep score per extended day key (yyyy-MM-dd), for display at top of each day. */
  nightScoresByDayKey?: Record<string, number>;
  onEventPress: (event: SleepEvent) => void;
  /** Called when scroll position changes so parent can update "Week of" label (display only, no reload). */
  onVisibleWeekChange?: (weekStart: Date) => void;
  /** Called when user scrolls near the start of the strip so parent can load more past. */
  onLoadMorePast?: () => void;
  /** Called when user scrolls near the end of the strip so parent can load more future. */
  onLoadMoreFuture?: () => void;
}

export function WeekTimelineStrip({
  stripStart,
  stripEnd,
  weekStart,
  eventsByDay,
  nightScoresByDayKey = {},
  onEventPress,
  onVisibleWeekChange,
  onLoadMorePast,
  onLoadMoreFuture,
}: WeekTimelineStripProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const hScrollRef = useRef<ScrollView>(null);
  const lastReportedWeekKey = useRef<string>(format(weekStart, 'yyyy-MM-dd'));
  const loadingMorePast = useRef(false);
  const loadingMoreFuture = useRef(false);
  const prevStripStartMs = useRef(stripStart.getTime());
  const lastScrollX = useRef(0);

  const allDayKeys = useMemo(
    () => generateDayKeysFromRange(stripStart, stripEnd),
    [stripStart.getTime(), stripEnd.getTime()]
  );

  // Layout
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const containerWidth = screenWidth - Spacing.md * 2;
  const scrollViewWidth = containerWidth - TIME_LABEL_WIDTH;
  const dayColumnWidth = scrollViewWidth / 8;
  const totalWidth = allDayKeys.length * dayColumnWidth;
  const centerDayIndex = Math.max(0, Math.round((weekStart.getTime() - stripStart.getTime()) / 86400000));
  const initialScrollX = Math.max(0, centerDayIndex * dayColumnWidth - scrollViewWidth / 2 + dayColumnWidth / 2);

  // Vertical sizing — use screen height to calculate comfortable row heights
  const rowHeight = Math.max(MIN_ROW_HEIGHT, Math.floor(screenHeight * 0.55 / TIME_LABELS.length));
  const chartHeight = rowHeight * TIME_LABELS.length;

  // Scroll to centre only when weekStart changes (WeekSelector arrows or date picker)
  const didMount = useRef(false);
  useEffect(() => {
    lastReportedWeekKey.current = format(weekStart, 'yyyy-MM-dd');
    const animated = didMount.current;
    didMount.current = true;
    requestAnimationFrame(() => {
      hScrollRef.current?.scrollTo({ x: initialScrollX, animated });
    });
  }, [weekStart, initialScrollX]);

  // When strip grows backward (load more past), keep scroll position so the same days stay in view
  const stripStartMs = stripStart.getTime();
  useEffect(() => {
    if (stripStartMs < prevStripStartMs.current) {
      const daysAdded = Math.round((prevStripStartMs.current - stripStartMs) / 86400000);
      const offsetPx = daysAdded * dayColumnWidth;
      const newScrollX = lastScrollX.current + offsetPx;
      prevStripStartMs.current = stripStartMs;
      requestAnimationFrame(() => {
        hScrollRef.current?.scrollTo({ x: newScrollX, animated: false });
      });
    } else {
      prevStripStartMs.current = stripStartMs;
    }
  }, [stripStartMs, dayColumnWidth]);

  const handleScroll = (e: {
    nativeEvent: { contentOffset: { x: number }; layoutMeasurement: { width: number }; contentSize?: { width: number } };
  }) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    lastScrollX.current = contentOffset.x;
    const contentWidth = contentSize?.width ?? totalWidth;
    const scrollViewW = layoutMeasurement.width;

    if (allDayKeys.length > 0 && onVisibleWeekChange) {
      const centerX = contentOffset.x + scrollViewW / 2;
      const dayIndex = Math.floor(centerX / dayColumnWidth);
      const clampedIndex = Math.max(0, Math.min(dayIndex, allDayKeys.length - 1));
      const dayKey = allDayKeys[clampedIndex];
      const visibleWeekStart = startOfWeek(parseLocal(dayKey), { weekStartsOn: 0 });
      const newKey = format(visibleWeekStart, 'yyyy-MM-dd');
      if (newKey !== lastReportedWeekKey.current) {
        lastReportedWeekKey.current = newKey;
        onVisibleWeekChange(visibleWeekStart);
      }
    }

    const threshold = LOAD_MORE_THRESHOLD_DAYS * dayColumnWidth;
    if (onLoadMorePast && contentOffset.x < threshold && !loadingMorePast.current) {
      loadingMorePast.current = true;
      onLoadMorePast();
      setTimeout(() => {
        loadingMorePast.current = false;
      }, 1500);
    }
    if (
      onLoadMoreFuture &&
      contentWidth - scrollViewW > 0 &&
      contentOffset.x > contentWidth - scrollViewW - threshold &&
      !loadingMoreFuture.current
    ) {
      loadingMoreFuture.current = true;
      onLoadMoreFuture();
      setTimeout(() => {
        loadingMoreFuture.current = false;
      }, 1500);
    }
  };

  const todayKey = format(new Date(), 'yyyy-MM-dd');

  // ──────────── Rendering helpers ────────────

  const dayHeaders = (
    <View style={[styles.dayHeaders, { width: totalWidth }]}>
      {allDayKeys.map((dayKey, i) => {
        const d = parseLocal(dayKey);
        const isToday = dayKey === todayKey;
        const score = nightScoresByDayKey[dayKey];
        return (
          <View
            key={`hdr-${i}`}
            style={[styles.dayHeaderCell, { width: dayColumnWidth }]}
          >
            {score != null && (
              <View style={styles.scoreRingWrap}>
                <SleepScoreRing score={score} size={26} strokeWidth={2} />
              </View>
            )}
            <Text
              style={[
                styles.dayLabel,
                { color: isToday ? colors.accent : colors.textSecondary },
              ]}
            >
              {format(d, 'EEE')}
            </Text>
            <Text
              style={[
                styles.dateLabel,
                { color: isToday ? colors.accent : colors.text },
              ]}
            >
              {format(d, 'd')}
            </Text>
          </View>
        );
      })}
    </View>
  );

  const grid = (
    <View style={[styles.chartGrid, { width: totalWidth, height: chartHeight }]}>
      {/* Horizontal grid lines */}
      {TIME_LABELS.map((_, i) => (
        <View
          key={`h-${i}`}
          style={[
            styles.gridLineH,
            { top: i * rowHeight, width: totalWidth, backgroundColor: colors.borderLight },
          ]}
        />
      ))}

      {/* Vertical grid lines — render one per day */}
      {allDayKeys.map((_, i) => (
        <View
          key={`v-${i}`}
          style={[
            styles.gridLineV,
            {
              left: i * dayColumnWidth,
              height: chartHeight,
              backgroundColor: colors.borderLight,
            },
          ]}
        />
      ))}

      {/* Sleep bars — only render columns that have events */}
      {allDayKeys.map((dayKey, colIndex) => {
        const dayEvents = eventsByDay[dayKey];
        if (!dayEvents || dayEvents.length === 0) return null;

        const dayStart6am = get6am(dayKey);
        const dayEnd6am = addDays(dayStart6am, 1);

        return (
          <View
            key={`col-${colIndex}`}
            style={[
              styles.dayColumn,
              {
                left: colIndex * dayColumnWidth,
                width: dayColumnWidth,
                height: chartHeight,
              },
            ]}
          >
            {dayEvents.map((event) => {
              const st = new Date(event.start);
              const et = event.end ? new Date(event.end) : new Date();
              const clampedStart = st < dayStart6am ? dayStart6am : st;
              const clampedEnd = et > dayEnd6am ? dayEnd6am : et;
              const startMin = minutesFromDayStart(clampedStart, dayStart6am);
              const endMin = minutesFromDayStart(clampedEnd, dayStart6am);
              const durationMin = endMin - startMin;
              if (durationMin <= 0) return null;

              const top = (startMin / (24 * 60)) * chartHeight;
              const height = Math.max((durationMin / (24 * 60)) * chartHeight, 4);
              const isNap = event.type === 'nap';
              const grad = isNap ? gradients.nap : gradients.night;

              return (
                <TouchableOpacity
                  key={event.id}
                  style={[styles.bar, { top, height }]}
                  onPress={() => onEventPress(event)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[...grad]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.barGradient}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );

  const chartContent = (
    <View style={styles.row}>
      {/* Fixed time labels */}
      <View style={{ width: TIME_LABEL_WIDTH }}>
        <View style={{ height: DAY_HEADER_HEIGHT }} />
        {TIME_LABELS.map((label) => (
          <View key={label} style={[styles.timeRow, { height: rowHeight }]}>
            <Text style={[styles.timeLabel, { color: colors.textTertiary }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Horizontally scrollable day strip */}
      <ScrollView
        ref={hScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        directionalLockEnabled
        removeClippedSubviews
        onScroll={handleScroll}
        scrollEventThrottle={100}
        style={{ flex: 1 }}
      >
        <View>
          {dayHeaders}
          {grid}
        </View>
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      {chartContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingLeft: 2,
    paddingRight: Spacing.md,
  },
  row: {
    flexDirection: 'row',
  },
  timeRow: {
    justifyContent: 'center',
  },
  timeLabel: {
    ...ChartTypography.axisLabelSmall,
    textAlign: 'right',
    marginRight: 8,
  },
  dayHeaders: {
    flexDirection: 'row',
    minHeight: DAY_HEADER_HEIGHT,
    alignItems: 'center',
    overflow: 'visible',
  },
  dayHeaderCell: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: DAY_HEADER_HEIGHT,
    overflow: 'visible',
  },
  scoreRingWrap: {
    marginBottom: 4,
    overflow: 'visible',
  },
  dayLabel: {
    ...ChartTypography.axisLabelSmall,
    lineHeight: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  chartGrid: {
    position: 'relative',
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    height: StyleSheet.hairlineWidth,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    width: StyleSheet.hairlineWidth,
  },
  dayColumn: {
    position: 'absolute',
    top: 0,
  },
  bar: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barGradient: {
    flex: 1,
    borderRadius: 4,
  },
});
