import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { formatTimeUntil, formatDuration } from '@/utils/formatTime';
import type { NextSleepRecommendation } from '@/hooks/useProactiveRecommendations';

interface ProactiveRecommendationProps {
  recommendation: NextSleepRecommendation | null;
  minutesFromNow: number | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const SLEEP_TYPE_ICON: Record<string, import('@/components/ui/icon-symbol').IconSymbolName> = {
  short_nap: 'bolt.fill',
  long_nap: 'moon.zzz.fill',
  nap: 'sun.max.fill',
  bedtime: 'moon.fill',
};

const SLEEP_TYPE_LABEL: Record<string, string> = {
  short_nap: 'Short Nap',
  long_nap: 'Full Nap',
  nap: 'Nap',
  bedtime: 'Bedtime',
};

export function ProactiveRecommendation({
  recommendation,
  minutesFromNow,
  loading,
  error,
  onRefresh,
}: ProactiveRecommendationProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const [showModal, setShowModal] = useState(false);

  // Loading state
  if (loading) {
    return (
      <View style={[styles.wrapper, Shadows.md]}>
        <LinearGradient
          colors={[...gradients.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={[styles.loadingText]}>Analyzing sleep patterns...</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  // Error state
  if (error && !recommendation) {
    return (
      <TouchableOpacity onPress={onRefresh} activeOpacity={0.85}>
        <View style={[styles.wrapper, Shadows.sm]}>
          <View style={[styles.gradient, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
            <Text style={[Typography.caption, { color: colors.error }]}>
              Couldn't load sleep recommendation. Tap to retry.
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (!recommendation) return null;

  const isUrgent = recommendation.urgency === 'now';
  const isSoon = recommendation.urgency === 'soon';
  const isBedtime = recommendation.sleep_type === 'bedtime';
  const iconName = SLEEP_TYPE_ICON[recommendation.sleep_type] || 'moon.zzz.fill';
  const typeLabel = SLEEP_TYPE_LABEL[recommendation.sleep_type] || 'Sleep';

  const getGradient = () => {
    if (isUrgent) return gradients.urgent;
    if (isBedtime) return gradients.night;
    if (isSoon) return gradients.nap;
    return gradients.accent;
  };

  const getTimeLabel = () => {
    if (minutesFromNow === null) return '';
    if (minutesFromNow <= 0) return 'Now';
    return `in ${formatTimeUntil(minutesFromNow)}`;
  };

  return (
    <>
      <TouchableOpacity onPress={() => setShowModal(true)} activeOpacity={0.85}>
        <View style={[styles.wrapper, Shadows.md]}>
          <LinearGradient
            colors={[...getGradient()]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          >
            {/* Top row: urgency dot + type badge + tap hint */}
            <View style={styles.header}>
              <View style={styles.liveDot} />
              <Text style={styles.label}>{recommendation.headline}</Text>
              <Text style={styles.tapHint}>Tap for details</Text>
            </View>

            {/* Time + type */}
            <View style={styles.timeRow}>
              <Text style={styles.time}>{recommendation.recommended_time}</Text>
              <View style={styles.typeBadge}>
                <IconSymbol name={iconName} size={14} color="#0B1426" style={{ marginRight: 4 }} />
                <Text style={styles.typeBadgeText}>{typeLabel}</Text>
              </View>
            </View>

            {/* Summary — the AI's brief explanation */}
            <Text style={styles.summary}>{recommendation.summary}</Text>

            {/* Tags row */}
            <View style={styles.tagsRow}>
              <View style={styles.tag}>
                <Text style={styles.tagText}>{getTimeLabel()}</Text>
              </View>
              {recommendation.expected_duration_minutes > 0 && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>~{formatDuration(recommendation.expected_duration_minutes)}</Text>
                </View>
              )}
              {recommendation.should_cap_nap && recommendation.cap_at_minutes && (
                <View style={[styles.tag, styles.tagWarn]}>
                  <Text style={styles.tagText}>Cap at {formatDuration(recommendation.cap_at_minutes)}</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </View>
      </TouchableOpacity>

      {/* Full Reasoning Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity
          style={[styles.overlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <View
            style={[styles.sheet, { backgroundColor: '#132140', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' }, Shadows.lg]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.handle} />

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <IconSymbol name={iconName} size={36} color={colors.text} style={styles.modalIcon} />
                <Text style={[Typography.h2, { color: colors.text }]}>
                  {recommendation.headline}
                </Text>
                <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
                  {typeLabel} at {recommendation.recommended_time} · {getTimeLabel()}
                  {recommendation.expected_duration_minutes > 0 && ` · ~${formatDuration(recommendation.expected_duration_minutes)}`}
                </Text>
              </View>

              {/* AI Reasoning */}
              <View style={[styles.infoCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[Typography.captionMedium, { color: colors.accent, marginBottom: Spacing.xs }]}>
                  Why this recommendation
                </Text>
                <Text style={[Typography.body, { color: colors.text, lineHeight: 22 }]}>
                  {recommendation.reasoning}
                </Text>
              </View>

              {/* Nap cap info */}
              {recommendation.should_cap_nap && (
                <View style={[styles.infoCard, { backgroundColor: colors.napColorSoft, borderColor: colors.napColor }]}>
                  <Text style={[Typography.captionMedium, { color: colors.napColor, marginBottom: Spacing.xs }]}>
                    Nap Cap Recommendation
                  </Text>
                  <Text style={[Typography.body, { color: colors.text }]}>
                    {recommendation.cap_reason || `Cap this nap at ${formatDuration(recommendation.cap_at_minutes || 0)} to protect night sleep.`}
                  </Text>
                </View>
              )}

              {/* Refresh + close */}
              <TouchableOpacity
                onPress={() => {
                  setShowModal(false);
                  onRefresh();
                }}
                style={styles.refreshBtn}
              >
                <Text style={[Typography.caption, { color: colors.textTertiary }]}>Refresh recommendation</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={[styles.closeBtn, { backgroundColor: colors.accent }]}
              >
                <Text style={[Typography.buttonSmall, { color: '#0B1426' }]}>Got it</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  gradient: {
    padding: Spacing.lg,
    borderRadius: Radius.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  label: {
    ...Typography.captionMedium,
    color: 'rgba(255,255,255,0.95)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  tapHint: {
    ...Typography.small,
    color: 'rgba(255,255,255,0.5)',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  time: {
    ...Typography.h1,
    color: '#FFFFFF',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  typeBadgeText: {
    ...Typography.captionMedium,
    color: '#FFFFFF',
  },
  summary: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  tagWarn: {
    backgroundColor: 'rgba(255,200,50,0.25)',
  },
  tagText: {
    ...Typography.small,
    color: 'rgba(255,255,255,0.9)',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  loadingText: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.8)',
  },
  // Modal
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalIcon: { marginBottom: Spacing.sm },
  infoCard: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  refreshBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
});
