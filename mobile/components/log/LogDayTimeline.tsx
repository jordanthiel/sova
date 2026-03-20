import { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format, addDays } from 'date-fns';
import { Colors, Spacing, Typography, Radius, ChartTypography } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { formatDuration } from '@/utils/formatTime';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { SleepEvent } from '@/types/domain';

const HOUR_HEIGHT = 40;
const TOTAL_HOURS = 24;
const TIMELINE_HEIGHT = HOUR_HEIGHT * TOTAL_HOURS;
const LABEL_WIDTH = 40;

/** Extended day: 6am of date through 6am of next day (24h). */
function getDayStart6am(date: Date): Date {
  const d = new Date(date);
  d.setHours(6, 0, 0, 0);
  return d;
}

const TIME_LABELS_2H: { offsetHours: number; label: string }[] = [
  { offsetHours: 0, label: '6 AM' },
  { offsetHours: 2, label: '8 AM' },
  { offsetHours: 4, label: '10 AM' },
  { offsetHours: 6, label: '12 PM' },
  { offsetHours: 8, label: '2 PM' },
  { offsetHours: 10, label: '4 PM' },
  { offsetHours: 12, label: '6 PM' },
  { offsetHours: 14, label: '8 PM' },
  { offsetHours: 16, label: '10 PM' },
  { offsetHours: 18, label: '12 AM' },
  { offsetHours: 20, label: '2 AM' },
  { offsetHours: 22, label: '4 AM' },
];

const MIN_DURATION_MIN = 15;

interface LogDayTimelineProps {
  date: Date;
  events: SleepEvent[];
  onEventPress: (event: SleepEvent) => void;
  /** When provided, enables "Add sleep" and calls with start/end when user drags a range. */
  onAddSleepRange?: (start: Date, end: Date) => void;
  /** Called when draw mode starts or ends (so parent can disable outer scroll). */
  onDrawModeChange?: (isDrawing: boolean) => void;
}

function yToDate(y: number, dayStart: Date, dayEnd: Date, timelineHeight: number): Date {
  const pct = Math.max(0, Math.min(1, y / timelineHeight));
  const ms = dayStart.getTime() + pct * (dayEnd.getTime() - dayStart.getTime());
  return new Date(ms);
}

export function LogDayTimeline({
  date,
  events,
  onEventPress,
  onAddSleepRange,
  onDrawModeChange,
}: LogDayTimelineProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);

  const dayStart = getDayStart6am(date);
  const dayEnd = addDays(dayStart, 1);
  const dayStartRef = useRef(dayStart);
  const dayEndRef = useRef(dayEnd);
  dayStartRef.current = dayStart;
  dayEndRef.current = dayEnd;

  const dayEvents = events.filter((e) => {
    const st = new Date(e.start);
    const et = e.end ? new Date(e.end) : new Date();
    return st < dayEnd && et > dayStart;
  });

  const draftRef = useRef({ draftStart, draftEnd });
  draftRef.current = { draftStart, draftEnd };
  const onDrawModeChangeRef = useRef(onDrawModeChange);
  onDrawModeChangeRef.current = onDrawModeChange;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touchY = evt.nativeEvent.locationY ?? 0;
        const start = yToDate(touchY, dayStartRef.current, dayEndRef.current, TIMELINE_HEIGHT);
        setDraftStart(start);
        setDraftEnd(start);
      },
      onPanResponderMove: (evt) => {
        const touchY = evt.nativeEvent.locationY ?? 0;
        const end = yToDate(touchY, dayStartRef.current, dayEndRef.current, TIMELINE_HEIGHT);
        setDraftEnd(end);
      },
      onPanResponderRelease: () => {
        const { draftStart: s, draftEnd: e } = draftRef.current;
        if (s && e && onAddSleepRange) {
          const [start, end] = s.getTime() < e.getTime() ? [s, e] : [e, s];
          const durationMin = (end.getTime() - start.getTime()) / 60000;
          if (durationMin >= MIN_DURATION_MIN) {
            onAddSleepRange(start, end);
          }
        }
        setIsDrawing(false);
        setDraftStart(null);
        setDraftEnd(null);
        onDrawModeChangeRef.current?.(false);
      },
    })
  ).current;

  const showPreview = isDrawing && draftStart && draftEnd;
  const previewStart = showPreview
    ? Math.min(draftStart.getTime(), draftEnd.getTime())
    : 0;
  const previewEnd = showPreview
    ? Math.max(draftStart.getTime(), draftEnd.getTime())
    : 0;
  const previewTop =
    showPreview
      ? ((previewStart - dayStart.getTime()) / (dayEnd.getTime() - dayStart.getTime())) * TIMELINE_HEIGHT
      : 0;
  const previewHeight =
    showPreview
      ? Math.max(
          20,
          ((previewEnd - previewStart) / (dayEnd.getTime() - dayStart.getTime())) * TIMELINE_HEIGHT
        )
      : 0;

  return (
    <View style={styles.container}>
      {onAddSleepRange != null && !isDrawing && (
        <TouchableOpacity
          style={[styles.addSleepButton, { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}
          onPress={() => {
        setIsDrawing(true);
        onDrawModeChange?.(true);
      }}
          activeOpacity={0.8}
        >
          <Text style={[Typography.captionMedium, { color: colors.accent }]}>
            + Add sleep (drag on timeline)
          </Text>
        </TouchableOpacity>
      )}
      <View style={styles.timelineContent}>
        <View style={styles.row}>
          {/* Time labels column — each label is positioned at its hour offset */}
          <View style={[styles.labelCol, { height: TIMELINE_HEIGHT }]}>
            {TIME_LABELS_2H.map(({ offsetHours, label }) => (
              <Text
                key={label}
                style={[
                  styles.hourLabel,
                  {
                    color: colors.textTertiary,
                    top: offsetHours * HOUR_HEIGHT - 7,
                  },
                ]}
              >
                {label}
              </Text>
            ))}
          </View>

          {/* Timeline area — grid lines + event blocks */}
          <View style={[styles.eventArea, { height: TIMELINE_HEIGHT }]}>
            {/* Horizontal grid lines at each label position */}
            {TIME_LABELS_2H.map(({ offsetHours, label }) => (
              <View
                key={`line-${label}`}
                style={[
                  styles.gridLine,
                  {
                    top: offsetHours * HOUR_HEIGHT,
                    backgroundColor: colors.borderLight,
                  },
                ]}
              />
            ))}

            {dayEvents.length === 0 && !isDrawing ? (
              <View style={styles.emptyOverlay} pointerEvents="none">
                <EmptyState
                  icon="calendar"
                  title="No sleep this day"
                  message="Tap + to log a nap or night sleep."
                />
              </View>
            ) : null}

            {/* Draft preview block when dragging */}
            {showPreview && (
              <View style={[styles.sessionBlock, { top: previewTop, height: previewHeight }]} pointerEvents="none">
                <LinearGradient
                  colors={[Colors.dark.accentSoft, 'rgba(127, 179, 255, 0.28)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.sessionGradient}
                >
                  <Text style={styles.sessionLabel} numberOfLines={1}>
                    {format(new Date(previewStart), 'h:mm a')} – {format(new Date(previewEnd), 'h:mm a')}
                  </Text>
                </LinearGradient>
              </View>
            )}

            {dayEvents.map((event) => {
              const st = new Date(event.start);
              const et = event.end ? new Date(event.end) : new Date();
              const clampedStart = st < dayStart ? dayStart : st;
              const clampedEnd = et > dayEnd ? dayEnd : et;
              const startMinutes = (clampedStart.getTime() - dayStart.getTime()) / 60000;
              const endMinutes = (clampedEnd.getTime() - dayStart.getTime()) / 60000;
              const blockTop = (startMinutes / (TOTAL_HOURS * 60)) * TIMELINE_HEIGHT;
              const blockHeight = Math.max(
                ((endMinutes - startMinutes) / (TOTAL_HOURS * 60)) * TIMELINE_HEIGHT,
                20
              );

              const isNap = event.type === 'nap';
              const grad = isNap ? gradients.nap : gradients.night;
              const showFullLabel = blockHeight >= 32;
              const showCompactLabel = blockHeight >= 18;

              return (
                <TouchableOpacity
                  key={event.id}
                  style={[styles.sessionBlock, { top: blockTop, height: blockHeight }]}
                  onPress={() => onEventPress(event)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[...grad]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.sessionGradient}
                  >
                    {showFullLabel && (
                      <View style={styles.sessionLabelRow}>
                        <IconSymbol name={isNap ? 'sun.max.fill' : 'moon.fill'} size={12} color="#fff" style={styles.sessionLabelIcon} />
                        <Text style={styles.sessionLabel} numberOfLines={1}>
                          {format(st, 'h:mm a')}
                        {event.end ? ` – ${format(et, 'h:mm a')}` : ' (ongoing)'}
                        {event.durationMinutes != null
                          ? ` · ${formatDuration(event.durationMinutes)}`
                          : ''}
                        </Text>
                      </View>
                    )}
                    {!showFullLabel && showCompactLabel && (
                      <View style={styles.sessionLabelRow}>
                        <IconSymbol
                          name={isNap ? 'sun.max.fill' : 'moon.fill'}
                          size={12}
                          color="#fff"
                          style={styles.sessionLabelIcon}
                        />
                        <Text style={styles.sessionLabel} numberOfLines={1}>
                          {format(st, 'h:mm a')}
                          {event.end ? ` – ${format(et, 'h:mm a')}` : ' (ongoing)'}
                        </Text>
                      </View>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}

            {/* Transparent overlay for drag-to-add when in drawing mode */}
            {isDrawing && (
              <View
                style={StyleSheet.absoluteFill}
                {...panResponder.panHandlers}
              >
                <View style={[styles.dragOverlay, { backgroundColor: 'transparent' }]}>
                  <Text style={[Typography.small, { color: colors.textTertiary }]}>
                    Drag to set start and end, then release
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  timelineContent: {
    minHeight: TIMELINE_HEIGHT,
  },
  row: {
    flexDirection: 'row',
  },
  labelCol: {
    width: LABEL_WIDTH,
    position: 'relative',
  },
  hourLabel: {
    position: 'absolute',
    left: 0,
    right: 4,
    ...ChartTypography.axisLabelSmall,
    textAlign: 'right',
  },
  eventArea: {
    flex: 1,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  emptyOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 6,
    overflow: 'hidden',
  },
  sessionGradient: {
    flex: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
    borderRadius: 6,
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
  addSleepButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  dragOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
});
