import { useAppNow } from '@/contexts/AppClockContext';
import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { formatDuration, roundDateToNearest5Minutes } from '@/utils/formatTime';
import { WhyRecommendationBlock, RestOfDayScheduleList } from '@/components/today/RecommendationDetailBlocks';
import type { ConfidenceLevel, NapRecommendationPayload } from '@/types/domain';
import { parseRestOfDaySchedule } from '@/utils/restOfDaySchedule';

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
  const appNow = useAppNow();
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const [showMore, setShowMore] = useState(false);

  const progress = Math.min(awakeMinutes / recommendedWakeWindow, 1);
  const isOverdue = awakeMinutes > recommendedWakeWindow;

  const hasRecommendation = napPayload != null && !loading;
  const hasReasoning = hasRecommendation && Boolean(napPayload?.reasoning?.trim());

  const windowStartDate = hasRecommendation
    ? roundDateToNearest5Minutes(new Date(napPayload!.startWindowBegin))
    : null;
  const windowEndDate = hasRecommendation
    ? roundDateToNearest5Minutes(new Date(napPayload!.startWindowEnd))
    : null;
  const scheduleRows = useMemo(() => {
    if (!hasRecommendation || !Array.isArray(napPayload?.restOfDaySchedule) || napPayload!.restOfDaySchedule!.length === 0)
      return [];
    return parseRestOfDaySchedule(napPayload!.restOfDaySchedule!, napsCompletedToday, appNow);
  }, [hasRecommendation, napPayload, napsCompletedToday, appNow]);
  const hasSchedule = scheduleRows.length > 0;
  const hasExpandableContent = hasReasoning || hasSchedule;

  const windowText =
    windowStartDate && windowEndDate
      ? `${format(windowStartDate, 'h:mm a')} – ${format(windowEndDate, 'h:mm a')}`
      : null;

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

        {/* Expandable: cap (bedtime), reasoning, schedule */}
        {showMore && hasRecommendation && napPayload && (
          <View style={[styles.moreSection, { borderTopColor: colors.border }]}>
            <View style={styles.moreInner}>
              {isBedtime && (
                <Text style={[Typography.small, { color: colors.textSecondary, marginBottom: Spacing.md }]}>
                  Cap: {napPayload.shouldCapNap === false ? 'No cap' : formatDuration(napPayload.recommendedCapMinutes)}
                </Text>
              )}
              <WhyRecommendationBlock reasoning={napPayload.reasoning} />
              {hasSchedule && <RestOfDayScheduleList rows={scheduleRows} />}
            </View>
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
  moreInner: {
    gap: Spacing.lg,
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
