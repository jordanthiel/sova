import { useAppNow } from '@/contexts/AppClockContext';
import { Card } from '@/components/ui/Card';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { WhyRecommendationBlock, RestOfDayScheduleCollapsible } from '@/components/today/RecommendationDetailBlocks';
import type { NapRecommendationPayload } from '@/types/domain';
import { formatDuration, roundDateToNearest5Minutes } from '@/utils/formatTime';
import { parseRestOfDaySchedule } from '@/utils/restOfDaySchedule';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  const appNow = useAppNow();
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);

  const hasReasoning = Boolean(payload.reasoning?.trim());

  const handleWhyPress = () => {
    if (hasReasoning) {
      setReasoningExpanded((prev) => !prev);
    } else {
      onWhy();
    }
  };

  const windowStartDate = roundDateToNearest5Minutes(new Date(payload.startWindowBegin));
  const windowEndDate = roundDateToNearest5Minutes(new Date(payload.startWindowEnd));
  const windowStart = format(windowStartDate, 'h:mm a');
  const windowEnd = format(windowEndDate, 'h:mm a');
  const scheduleRows = useMemo(() => {
    const s = payload.restOfDaySchedule;
    if (!Array.isArray(s) || s.length === 0) return [];
    return parseRestOfDaySchedule(s, napsCompletedToday, appNow);
  }, [payload.restOfDaySchedule, napsCompletedToday, appNow]);
  const hasSchedule = scheduleRows.length > 0;

  return (
    <Card style={styles.card} padding="none">
      <LinearGradient
        colors={[Colors.dark.accentSoft, 'rgba(102, 168, 255, 0.06)']}
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

        {payload.agentic != null &&
          (payload.agentic.preferredWakeAt != null || payload.agentic.stillOkayUntil != null || payload.agentic.hardCapAt != null) ? (
          <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: 4 }}>
            <Text style={[Typography.captionMedium, { color: colors.textSecondary }]}>Nap timing guidance</Text>
            {payload.agentic.preferredWakeAt != null ? (
              <Text style={[Typography.small, { color: colors.text }]}>
                Preferred wake: {format(new Date(payload.agentic.preferredWakeAt), 'h:mm a')}
              </Text>
            ) : null}
            {payload.agentic.stillOkayUntil != null ? (
              <Text style={[Typography.small, { color: colors.textTertiary }]}>
                Still okay until: {format(new Date(payload.agentic.stillOkayUntil), 'h:mm a')}
              </Text>
            ) : null}
            {payload.agentic.hardCapAt != null ? (
              <Text style={[Typography.small, { color: colors.textTertiary }]}>
                Latest wake: {format(new Date(payload.agentic.hardCapAt), 'h:mm a')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {payload.agentic != null && Array.isArray(payload.agentic.watchFors) && payload.agentic.watchFors.length > 0 ? (
          <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}>
            <Text style={[Typography.captionMedium, { color: colors.textSecondary }]}>Watch for</Text>
            {payload.agentic.watchFors.map((line, i) => (
              <Text key={i} style={[Typography.small, { color: colors.textTertiary, marginTop: 2 }]}>
                {'\u2022'} {line}
              </Text>
            ))}
          </View>
        ) : null}

        {reasoningExpanded && hasReasoning && (
          <View style={styles.reasoningWrap}>
            <WhyRecommendationBlock reasoning={payload.reasoning} />
          </View>
        )}

        {hasSchedule && (
          <View style={styles.scheduleSection}>
            <RestOfDayScheduleCollapsible
              rows={scheduleRows}
              expanded={scheduleExpanded}
              onToggle={() => setScheduleExpanded((prev) => !prev)}
            />
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
              {reasoningExpanded ? 'Hide' : 'Why?'}
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
  reasoningWrap: {
    marginBottom: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  scheduleSection: {
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
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
