import { useState, useRef } from 'react';
import { StyleSheet, View, Text, Dimensions, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format, startOfDay, addDays, subDays, isSameDay } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing, Typography, Radius, Shadows, ChartTypography } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { formatDuration } from '@/utils/formatTime';
import type { Database } from '@/lib/supabase';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

interface DayTimelineProps {
  sessions: SleepSession[];
}

const HOUR_HEIGHT = 44;
const TOTAL_HOURS = 24;
const TIMELINE_HEIGHT = HOUR_HEIGHT * TOTAL_HOURS;

export function DayTimeline({ sessions }: DayTimelineProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const [currentDate, setCurrentDate] = useState(new Date());
  const scrollRef = useRef<ScrollView>(null);

  const dayStart = startOfDay(currentDate);

  // Filter sessions for the current day
  const daySessions = sessions.filter((s) => {
    const st = new Date(s.start_time);
    const et = s.end_time ? new Date(s.end_time) : new Date();
    // Session overlaps with this day
    return st < addDays(dayStart, 1) && et > dayStart;
  });

  const totalMinutes = daySessions
    .filter((s) => s.duration_minutes && s.end_time)
    .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const napMinutes = daySessions
    .filter((s) => s.type === 'nap' && s.duration_minutes && s.end_time)
    .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const nightMinutes = totalMinutes - napMinutes;

  const goToPrev = () => setCurrentDate((d) => subDays(d, 1));
  const goToNext = () => {
    const tomorrow = addDays(new Date(), 1);
    if (addDays(currentDate, 1) < tomorrow) {
      setCurrentDate((d) => addDays(d, 1));
    }
  };
  const isToday = isSameDay(currentDate, new Date());

  // Scroll to ~6am on mount
  const onLayout = () => {
    scrollRef.current?.scrollTo({ y: 6 * HOUR_HEIGHT, animated: false });
  };

  return (
    <Card style={styles.container} padding="md">
      {/* Day navigator */}
      <View style={styles.dayNav}>
        <TouchableOpacity onPress={goToPrev} hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}>
          <Text style={[Typography.h3, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.dayNavCenter}>
          <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
            {isToday ? 'Today' : format(currentDate, 'EEEE')}
          </Text>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            {format(currentDate, 'MMMM d, yyyy')}
          </Text>
        </View>
        <TouchableOpacity onPress={goToNext} hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }} disabled={isToday}>
          <Text style={[Typography.h3, { color: isToday ? colors.textTertiary : colors.accent }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day stats */}
      <View style={[styles.dayStats, { backgroundColor: colors.surface, borderRadius: Radius.md }]}>
        <View style={styles.dayStat}>
          <Text style={[Typography.small, { color: colors.textSecondary }]}>Total</Text>
          <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{formatDuration(totalMinutes)}</Text>
        </View>
        <View style={[styles.dayStatDivider, { backgroundColor: colors.borderLight }]} />
        <View style={styles.dayStat}>
          <Text style={[Typography.small, { color: colors.textSecondary }]}>Naps</Text>
          <Text style={[Typography.bodySemiBold, { color: colors.napColor }]}>{formatDuration(napMinutes)}</Text>
        </View>
        <View style={[styles.dayStatDivider, { backgroundColor: colors.borderLight }]} />
        <View style={styles.dayStat}>
          <Text style={[Typography.small, { color: colors.textSecondary }]}>Night</Text>
          <Text style={[Typography.bodySemiBold, { color: colors.nightColor }]}>{formatDuration(nightMinutes)}</Text>
        </View>
      </View>

      {/* Timeline */}
      <ScrollView
        ref={scrollRef}
        style={styles.timelineScroll}
        showsVerticalScrollIndicator={false}
        onLayout={onLayout}
      >
        <View style={[styles.timeline, { height: TIMELINE_HEIGHT }]}>
          {/* Hour lines */}
          {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => (
            <View key={i} style={[styles.hourRow, { top: i * HOUR_HEIGHT }]}>
              <Text style={[styles.hourLabel, { color: colors.textSecondary }]}>
                {i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`}
              </Text>
              <View style={[styles.hourLine, { backgroundColor: colors.border }]} />
            </View>
          ))}

          {/* Session blocks */}
          {daySessions.map((session) => {
            const st = new Date(session.start_time);
            const et = session.end_time ? new Date(session.end_time) : new Date();

            // Clamp to day bounds
            const clampedStart = st < dayStart ? dayStart : st;
            const dayEnd = addDays(dayStart, 1);
            const clampedEnd = et > dayEnd ? dayEnd : et;

            const startMinutes = (clampedStart.getTime() - dayStart.getTime()) / 60000;
            const endMinutes = (clampedEnd.getTime() - dayStart.getTime()) / 60000;
            const blockTop = (startMinutes / (TOTAL_HOURS * 60)) * TIMELINE_HEIGHT;
            const blockHeight = Math.max(((endMinutes - startMinutes) / (TOTAL_HOURS * 60)) * TIMELINE_HEIGHT, 4);

            const isNap = session.type === 'nap';
            const grad = isNap ? gradients.nap : gradients.night;
            const showLabel = blockHeight > 20;

            return (
              <View
                key={session.id}
                style={[styles.sessionBlock, { top: blockTop, height: blockHeight }]}
              >
                <LinearGradient
                  colors={[...grad]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.sessionGradient}
                >
                  {showLabel && (
                    <View style={styles.sessionLabelRow}>
                      <IconSymbol name={isNap ? 'sun.max.fill' : 'moon.fill'} size={12} color="#fff" style={styles.sessionLabelIcon} />
                      <Text style={styles.sessionLabel} numberOfLines={1}>
                        {format(st, 'h:mm a')}
                      {session.end_time ? ` – ${format(et, 'h:mm a')}` : ' (ongoing)'}
                      {session.duration_minutes ? ` · ${formatDuration(session.duration_minutes)}` : ''}
                      </Text>
                    </View>
                  )}
                </LinearGradient>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  dayNavCenter: {
    alignItems: 'center',
  },
  dayStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  dayStat: {
    alignItems: 'center',
    flex: 1,
  },
  dayStatDivider: {
    width: 1,
    height: '100%',
  },
  timelineScroll: {
    height: 340,
    borderRadius: Radius.md,
  },
  timeline: {
    position: 'relative',
    marginLeft: 44,
  },
  hourRow: {
    position: 'absolute',
    left: -44,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: 1,
  },
  hourLabel: {
    width: 40,
    ...ChartTypography.axisLabel,
    textAlign: 'right',
    marginRight: 10,
  },
  hourLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  sessionBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sessionGradient: {
    flex: 1,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRadius: 8,
  },
  sessionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionLabelIcon: { marginRight: 0 },
  sessionLabel: {
    flex: 1,
    ...Typography.small,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
