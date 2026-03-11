import { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { useAiInsight } from '@/hooks/useAiInsight';

interface AiInsightChipProps {
  babyId: string | null;
  contextType: 'daily_summary' | 'weekly_trend' | 'nap_cap';
  /** Extra params to pass to the edge function */
  extraParams?: Record<string, unknown>;
  /** Auto-fetch on mount (default true) */
  autoFetch?: boolean;
  /** Cache TTL in ms (default 10 min) */
  cacheTtlMs?: number;
}

export function AiInsightChip({
  babyId,
  contextType,
  extraParams,
  autoFetch = true,
  cacheTtlMs = 10 * 60 * 1000,
}: AiInsightChipProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const didFetch = useRef(false);
  const prevBabyId = useRef<string | null>(null);

  const {
    data,
    loading,
    error,
    fetch: fetchInsight,
    clearCache,
  } = useAiInsight<{ insight: string; context_type: string }>('micro_insight', babyId, { cacheTtlMs });

  useEffect(() => {
    if (!autoFetch || !babyId) return;
    if (prevBabyId.current !== babyId) {
      prevBabyId.current = babyId;
      didFetch.current = false;
    }
    if (!didFetch.current) {
      didFetch.current = true;
      fetchInsight({ context_type: contextType, ...extraParams });
    }
  }, [babyId, autoFetch, contextType]);

  const handleRefresh = () => {
    clearCache().then(() => fetchInsight({ context_type: contextType, ...extraParams }));
  };

  // Don't render anything until we have something to show or are loading
  if (!loading && !data && !error) return null;

  return (
    <View style={[styles.wrapper, Shadows.sm]}>
      <LinearGradient
        colors={[...gradients.glassDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.row}>
          <Text style={styles.sparkle}>✨</Text>
          <View style={styles.content}>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[Typography.caption, { color: colors.textSecondary, marginLeft: Spacing.xs }]}>
                  Analyzing...
                </Text>
              </View>
            ) : error ? (
              <TouchableOpacity onPress={handleRefresh}>
                <Text style={[Typography.caption, { color: colors.error }]}>
                  Couldn't load insight. Tap to retry.
                </Text>
              </TouchableOpacity>
            ) : data ? (
              <TouchableOpacity onPress={handleRefresh} activeOpacity={0.7}>
                <Text style={[Typography.caption, { color: colors.text, lineHeight: 18 }]}>
                  {data.insight}
                </Text>
                <Text style={[Typography.small, { color: colors.textTertiary, marginTop: 2 }]}>
                  AI Insight · Tap to refresh
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  gradient: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  sparkle: {
    fontSize: 16,
    marginTop: 1,
  },
  content: {
    flex: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
