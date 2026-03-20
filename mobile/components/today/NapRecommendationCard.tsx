import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import type { NapRecommendationPayload, RestOfDayScheduleEvent } from '@/types/domain';
import { formatDuration, roundDateToNearest5Minutes, roundTimeStringToNearest5 } from '@/utils/formatTime';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/** Reduce schedule to concise lines: only naps (start–end with cap) and bedtime. Times rounded to nearest 5 for display. */
function getConciseScheduleLines(
  events: RestOfDayScheduleEvent[],
  napsCompletedToday: number,
  refDate: Date
): string[] {
  const lines: string[] = [];
  let napNum = 1 + napsCompletedToday;
  let i = 0;
  while (i < events.length) {
    const evt = events[i];
    if (evt.event === 'nap_start') {
      const next = events[i + 1];
      const startStr = roundTimeStringToNearest5(evt.time, refDate);
      const capSuffix = evt.cap_minutes ? ` (cap ${formatDuration(evt.cap_minutes)})` : '';
      if (next?.event === 'nap_end') {
        const endStr = roundTimeStringToNearest5(next.time, refDate);
        lines.push(`Nap ${napNum}: ${startStr} – ${endStr}${capSuffix}`);
        i += 2;
      } else {
        lines.push(`Nap ${napNum}: ${startStr}${capSuffix}`);
        i += 1;
      }
      napNum += 1;
    } else if (evt.event === 'bedtime') {
      lines.push(`Bedtime: ${roundTimeStringToNearest5(evt.time, refDate)}`);
      i += 1;
    } else {
      i += 1;
    }
  }
  return lines;
}

interface NapRecommendationCardProps {
  payload: NapRecommendationPayload;
  /** When true, copy and primary action are for bedtime instead of a nap */
  isBedtime?: boolean;
  /** Number of naps already completed today (for correct Nap 2, Nap 3 numbering). */
  napsCompletedToday?: number;
  onStartNap: () => void;
  onDelay: () => void;
  onSkip: () => void;
  onWhy: () => void;
  /** Optional: manually refresh the target window / recommendation */
  onRefresh?: () => void;
}

export function NapRecommendationCard({
  payload,
  isBedtime = false,
  napsCompletedToday = 0,
  onStartNap,
  onDelay,
  onSkip,
  onWhy,
  onRefresh,
}: NapRecommendationCardProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const [explanationExpanded, setExplanationExpanded] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);

  const hasExplanation =
    Boolean(payload.explanation?.trim()) || Boolean(payload.reasoning?.trim());

  const handleWhyPress = () => {
    if (hasExplanation) {
      setExplanationExpanded((prev) => !prev);
    } else {
      onWhy();
    }
  };

  const windowStartDate = roundDateToNearest5Minutes(new Date(payload.startWindowBegin));
  const windowEndDate = roundDateToNearest5Minutes(new Date(payload.startWindowEnd));
  const targetDate = roundDateToNearest5Minutes(new Date(payload.expectedBedtime));
  const windowStart = format(windowStartDate, 'h:mm a');
  const windowEnd = format(windowEndDate, 'h:mm a');
  const targetTime = format(targetDate, 'h:mm a');
  const scheduleLines = useMemo(() => {
    const s = payload.restOfDaySchedule;
    if (!Array.isArray(s) || s.length === 0) return [];
    return getConciseScheduleLines(
      s as RestOfDayScheduleEvent[],
      napsCompletedToday,
      new Date()
    );
  }, [payload.restOfDaySchedule, napsCompletedToday]);
  const hasSchedule = scheduleLines.length > 0;

  return (
    <Card style={styles.card} padding="none">
      <LinearGradient
        colors={['rgba(199, 174, 255, 0.15)', 'rgba(199, 174, 255, 0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <IconSymbol name={isBedtime ? 'moon.fill' : 'moon.zzz.fill'} size={20} color={colors.text} />
            <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
              {isBedtime ? 'Bedtime recommendation' : 'Nap recommendation'}
            </Text>
          </View>
          {onRefresh && (
            <TouchableOpacity
              onPress={onRefresh}
              activeOpacity={0.7}
              style={styles.refreshIconBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <IconSymbol name="arrow.clockwise" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detail}>
            <Text style={[Typography.small, { color: colors.textTertiary }]}>
              {isBedtime ? 'Target window' : 'Window'}
            </Text>
            <Text style={[Typography.bodyMedium, { color: colors.text }]}>
              {windowStart} – {windowEnd}
            </Text>
          </View>
          {!isBedtime && (
            <View style={styles.detail}>
              <Text style={[Typography.small, { color: colors.textTertiary }]}>
                Cap
              </Text>
              <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                {payload.shouldCapNap === false ? 'No cap' : formatDuration(payload.recommendedCapMinutes)}
              </Text>
            </View>
          )}
          
        </View>

        {explanationExpanded && hasExplanation && (
          <View style={styles.explanationBlock}>
            {payload.explanation?.trim() ? (
              <Text
                style={[Typography.body, { color: colors.textSecondary }]}
              >
                {payload.explanation.trim()}
              </Text>
            ) : null}
            {payload.reasoning?.trim() ? (
              <Text
                style={[
                  Typography.small,
                  { color: colors.textTertiary, marginTop: payload.explanation?.trim() ? Spacing.sm : 0 },
                ]}
              >
                {payload.reasoning.trim()}
              </Text>
            ) : null}
          </View>
        )}

        {hasSchedule && (
          <View style={styles.scheduleSection}>
            <TouchableOpacity
              style={styles.scheduleHeader}
              onPress={() => setScheduleExpanded((prev) => !prev)}
              activeOpacity={0.7}
            >
              <Text style={[Typography.captionMedium, { color: colors.accent }]}>
                {scheduleExpanded ? '▼' : '▶'} Ideal rest of day
              </Text>
            </TouchableOpacity>
            {scheduleExpanded && (
              <View style={styles.scheduleList}>
                {scheduleLines.map((line, i) => (
                  <Text key={i} style={[Typography.small, { color: colors.text }, styles.scheduleLine]}>
                    {line}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryAction}
            onPress={onStartNap}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[...gradients.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryActionGradient}
            >
              <Text style={styles.primaryActionText}>
                {isBedtime ? 'Start bedtime' : 'Start nap'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          {/* <TouchableOpacity
            style={styles.secondaryAction}
            onPress={onDelay}
            activeOpacity={0.7}
          >
            <Text style={[Typography.buttonSmall, { color: colors.accent }]}>
              Delay
            </Text>
          </TouchableOpacity> */}
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={onSkip}
            activeOpacity={0.7}
          >
            <Text style={[Typography.buttonSmall, { color: colors.textSecondary }]}>
              Skip
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={handleWhyPress}
            activeOpacity={0.7}
          >
            <Text style={[Typography.buttonSmall, { color: colors.accent }]}>
              {explanationExpanded ? 'Hide' : 'Why?'}
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  gradient: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  refreshIconBtn: {
    padding: Spacing.xs,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  explanationBlock: {
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  scheduleSection: {
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  scheduleHeader: {
    paddingVertical: Spacing.xs,
  },
  scheduleList: {
    paddingTop: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  scheduleLine: {
    marginBottom: 2,
  },
  detail: {
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  primaryAction: {
    flex: 1,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  primaryActionGradient: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: Radius.xl,
  },
  primaryActionText: {
    ...Typography.button,
    color: '#0B1426',
  },
  secondaryAction: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
});
