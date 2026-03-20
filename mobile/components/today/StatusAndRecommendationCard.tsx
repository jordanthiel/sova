import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { formatDuration, roundDateToNearest5Minutes, roundTimeStringToNearest5 } from '@/utils/formatTime';
import type { ConfidenceLevel, NapRecommendationPayload, RestOfDayScheduleEvent } from '@/types/domain';

/** Reduce schedule to concise lines: only naps (start–end with cap) and bedtime. */
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

export interface StatusAndRecommendationCardProps {
  awakeMinutes: number;
  recommendedWakeWindow: number;
  nextNapTime: string | null;
  nextSleepLabel?: string;
  confidence: ConfidenceLevel;
  isAsleep: boolean;
  loading?: boolean;
  napPayload?: NapRecommendationPayload | null;
  isBedtime?: boolean;
  napsCompletedToday?: number;
  onStartNap: () => void;
  onDelay: () => void;
  onSkip: () => void;
  onWhy: () => void;
  onRefresh?: () => void;
}

export function StatusAndRecommendationCard({
  awakeMinutes,
  recommendedWakeWindow,
  nextNapTime,
  nextSleepLabel = 'Next nap',
  confidence,
  isAsleep,
  loading = false,
  napPayload = null,
  isBedtime = false,
  napsCompletedToday = 0,
  onStartNap,
  onSkip,
  onWhy,
  onRefresh,
}: StatusAndRecommendationCardProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const [showMore, setShowMore] = useState(false);

  const progress = Math.min(awakeMinutes / recommendedWakeWindow, 1);
  const isOverdue = awakeMinutes > recommendedWakeWindow;

  const hasRecommendation = napPayload != null && !loading;
  const hasExplanation =
    hasRecommendation &&
    (Boolean(napPayload?.explanation?.trim()) || Boolean(napPayload?.reasoning?.trim()));

  const windowStartDate = hasRecommendation
    ? roundDateToNearest5Minutes(new Date(napPayload!.startWindowBegin))
    : null;
  const windowEndDate = hasRecommendation
    ? roundDateToNearest5Minutes(new Date(napPayload!.startWindowEnd))
    : null;
  const targetDate = hasRecommendation
    ? roundDateToNearest5Minutes(new Date(napPayload!.expectedBedtime))
    : null;
  const scheduleLines = useMemo(() => {
    if (!hasRecommendation || !Array.isArray(napPayload?.restOfDaySchedule) || napPayload!.restOfDaySchedule!.length === 0)
      return [];
    return getConciseScheduleLines(
      napPayload!.restOfDaySchedule as RestOfDayScheduleEvent[],
      napsCompletedToday,
      new Date()
    );
  }, [hasRecommendation, napPayload?.restOfDaySchedule, napsCompletedToday]);
  const hasSchedule = scheduleLines.length > 0;
  const hasExpandableContent = hasExplanation || hasSchedule;

  const windowText =
    windowStartDate && windowEndDate
      ? `${format(windowStartDate, 'h:mm a')} – ${format(windowEndDate, 'h:mm a')}`
      : null;
  const targetText = targetDate ? format(targetDate, 'h:mm a') : null;

  return (
    <Card style={styles.card} padding="none">
      <LinearGradient
        colors={[...gradients.cardBackground]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Top right: refresh */}
        {onRefresh && (
          <View style={styles.topRow}>
            <View />
            <TouchableOpacity
              onPress={onRefresh}
              hitSlop={12}
              activeOpacity={0.7}
              style={styles.refreshButton}
            >
              <IconSymbol name="arrow.clockwise" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Main status: one clear focal point */}
        {isAsleep ? (
          <View style={styles.heroAsleep}>
            <IconSymbol name="moon.zzz.fill" size={48} color={colors.text} style={styles.heroIcon} />
            <Text style={[styles.heroTitle, { color: colors.text }]}>Sleeping</Text>
          </View>
        ) : (
          <View style={styles.heroAwake}>
            <Text
              style={[
                styles.heroValue,
                { color: isOverdue ? colors.warning : colors.text },
              ]}
            >
              {formatDuration(awakeMinutes)}
            </Text>
            <Text style={[styles.heroSub, { color: colors.textTertiary }]}>
              awake · {formatDuration(recommendedWakeWindow)} window
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(progress * 100, 100)}%`,
                    backgroundColor: isOverdue ? colors.error : colors.accent,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* One line: when to put down (or loading) */}
        {!isAsleep && (
          <View style={styles.recommendationLine}>
            {loading ? (
              <Text style={[Typography.body, { color: colors.textTertiary }]}>
                Getting recommendation...
              </Text>
            ) : hasRecommendation && windowText ? (
              <View>
                <Text style={[Typography.body, { color: colors.text }]}>
                  {isBedtime ? 'Bedtime' : nextSleepLabel} between{' '}
                  <Text style={[Typography.bodySemiBold, { color: colors.accent }]}>{windowText}</Text>
                  
                </Text>
                {!isBedtime && napPayload && (
                  <Text style={[Typography.small, { color: colors.textSecondary, marginTop: 4 }]}>
                    Cap: {napPayload.shouldCapNap === false ? 'No cap' : formatDuration(napPayload.recommendedCapMinutes)}
                  </Text>
                )}
              </View>
            ) : nextNapTime ? (
              <Text style={[Typography.body, { color: colors.textSecondary }]}>
                {nextSleepLabel} around {nextNapTime}
              </Text>
            ) : null}
          </View>
        )}

        {/* Primary action when we have a recommendation */}
        {!isAsleep && hasRecommendation && (
          <>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onStartNap}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[...gradients.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButtonGradient}
              >
                <Text style={styles.primaryButtonText}>
                  {isBedtime ? 'Start bedtime' : 'Start nap'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.secondaryRow}>
              <TouchableOpacity onPress={onSkip} hitSlop={12} activeOpacity={0.7}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onWhy} hitSlop={12} activeOpacity={0.7}>
                <Text style={[Typography.small, { color: colors.accent }]}>Ask Coach</Text>
              </TouchableOpacity>
              {hasExpandableContent && (
                <TouchableOpacity onPress={() => setShowMore((prev) => !prev)} hitSlop={12} activeOpacity={0.7}>
                  <Text style={[Typography.small, { color: colors.accent }]}>
                    {showMore ? 'Less' : 'See Why'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* Expandable: cap, explanation, schedule */}
        {showMore && hasRecommendation && napPayload && (
          <View style={[styles.moreSection, { borderTopColor: colors.border }]}>
            {!isBedtime && (
              <Text style={[Typography.small, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
                Cap: {napPayload.shouldCapNap === false ? 'No cap' : formatDuration(napPayload.recommendedCapMinutes)}
              </Text>
            )}
            {napPayload.explanation?.trim() && (
              <Text style={[Typography.body, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
                {napPayload.explanation.trim()}
              </Text>
            )}
            {napPayload.reasoning?.trim() && (
              <Text style={[Typography.small, { color: colors.textTertiary, marginBottom: Spacing.sm }]}>
                {napPayload.reasoning.trim()}
              </Text>
            )}
            {hasSchedule && (
              <View style={styles.scheduleList}>
                {scheduleLines.map((line, i) => (
                  <Text key={i} style={[Typography.small, { color: colors.text }]}>
                    {line}
                  </Text>
                ))}
              </View>
            )}
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: -Spacing.sm,
  },
  refreshButton: {
    padding: Spacing.xs,
  },
  heroAsleep: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  heroIcon: { marginBottom: Spacing.sm },
  heroTitle: {
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  heroAwake: {
    paddingVertical: Spacing.sm,
  },
  heroValue: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  recommendationLine: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  primaryButton: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0B1426',
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.md,
  },
  moreSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
  },
  scheduleList: {
    flexDirection: 'column',
    gap: 6,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xl,
    paddingTop: Spacing.md,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
