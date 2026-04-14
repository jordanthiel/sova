import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useAiInsight } from '@/hooks/useAiInsight';

interface InsightItem {
  title: string;
  insight: string;
  icon: string;
}

interface InsightsBundleData {
  insights_bundle?: {
    insights?: unknown;
    insights_bundle?: { insights?: unknown };
  };
}

function asInsightItems(raw: unknown): InsightItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (typeof item === 'string') {
        return { title: `Insight ${i + 1}`, insight: item, icon: '💡' };
      }
      if (!item || typeof item !== 'object') {
        return { title: 'Insight', insight: String(item ?? ''), icon: '💡' };
      }
      const o = item as Record<string, unknown>;
      const title =
        typeof o.title === 'string' && o.title.trim() ? o.title.trim() : `Insight ${i + 1}`;
      let insight = '';
      if (typeof o.insight === 'string') insight = o.insight;
      else if (typeof o.body === 'string') insight = o.body;
      else if (typeof o.summary === 'string') insight = o.summary;
      else if (typeof o.text === 'string') insight = o.text;
      const icon = typeof o.icon === 'string' ? o.icon : '💡';
      return { title, insight: insight.trim() || title, icon };
    })
    .filter((x) => x.insight.length > 0);
}

/** Handles API/cache shapes: `{ insights }`, double-wrapped `insights_bundle`, or misparsed blobs. */
function extractInsights(data: InsightsBundleData | null | undefined): InsightItem[] {
  const bundle = data?.insights_bundle;
  if (!bundle || typeof bundle !== 'object') return [];
  const nested = bundle.insights_bundle;
  const raw =
    Array.isArray(bundle.insights)
      ? bundle.insights
      : nested && typeof nested === 'object' && Array.isArray(nested.insights)
        ? nested.insights
        : null;
  return raw ? asInsightItems(raw) : [];
}

export function InsightsBundleCard({
  babyId,
  onInsightPress,
}: {
  babyId: string | null;
  onInsightPress?: (message: string) => void;
}) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(true);
  const didFetch = useRef(false);
  const prevBabyId = useRef<string | null>(null);

  const { data, loading, error, fetch: fetchInsights, clearCache } = useAiInsight<InsightsBundleData>(
    'insights_bundle',
    babyId,
    { cacheTtlMs: 60 * 60 * 1000, cacheKeySuffix: 'shape_v2' }
  );

  useEffect(() => {
    if (!babyId) return;
    if (prevBabyId.current !== babyId) {
      prevBabyId.current = babyId;
      didFetch.current = false;
    }
    if (!didFetch.current) {
      didFetch.current = true;
      fetchInsights({});
    }
  }, [babyId]);

  const insights = extractInsights(data);

  const handleRefresh = () => {
    clearCache().then(() => fetchInsights({}));
  };

  if (!loading && !data && !error) return null;

  return (
    <DarkPanel style={[styles.wrapper, Shadows.sm]} padding="none" shadow="none">
      <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
        <View
          style={[
            styles.headerGradient,
            {
              backgroundColor: colors.surfaceElevated,
              borderBottomWidth: expanded ? 1 : 0,
              borderBottomColor: colors.borderLight,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <IconSymbol name="lightbulb.fill" size={20} color={colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>AI Discoveries</Text>
              <Text style={styles.headerSub}>
                {insights.length > 0
                  ? `${insights.length} personalized insights from your sleep data`
                  : 'Novel patterns & actionable tips'}
              </Text>
            </View>
            <IconSymbol
              name={expanded ? 'chevron.up' : 'chevron.down'}
              size={14}
              color="rgba(255,255,255,0.7)"
            />
          </View>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[Typography.caption, { color: colors.textSecondary, marginLeft: Spacing.sm }]}>
                Analyzing sleep patterns...
              </Text>
            </View>
          ) : error ? (
            <TouchableOpacity onPress={handleRefresh}>
              <Text style={[Typography.caption, { color: colors.error }]}>
                Could not load insights. Tap to retry.
              </Text>
            </TouchableOpacity>
          ) : insights.length > 0 ? (
            <>
              {insights.map((item, i) => {
                const message = `Can you tell me more about: ${item.title}?`;
                const rowContent = (
                  <View style={styles.insightRowTouchable}>
                    <IconSymbol name="lightbulb.fill" size={20} color={colors.text} style={styles.insightIcon} />
                    <View style={styles.insightContent}>
                      <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{item.title}</Text>
                      <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: 2, lineHeight: 20 }]}>
                        {item.insight}
                      </Text>
                    </View>
                    {onInsightPress && (
                      <Text style={[Typography.caption, { color: colors.accent }]}>Ask coach →</Text>
                    )}
                  </View>
                );
                return (
                  <View
                    key={i}
                    style={[
                      styles.insightRow,
                      i < insights.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
                    ]}
                  >
                    {onInsightPress ? (
                      <TouchableOpacity onPress={() => onInsightPress(message)} activeOpacity={0.7}>
                        {rowContent}
                      </TouchableOpacity>
                    ) : (
                      rowContent
                    )}
                  </View>
                );
              })}
              <TouchableOpacity onPress={handleRefresh} style={styles.refreshRow}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>Tap to refresh insights</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              Log more sleep sessions to unlock personalized insights.
            </Text>
          )}
        </View>
      )}
    </DarkPanel>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 0,
    marginVertical: Spacing.sm,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignSelf: 'stretch',
    width: '100%',
  },
  headerGradient: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    ...Typography.bodySemiBold,
    color: '#FFFFFF',
    fontSize: 16,
  },
  headerSub: {
    ...Typography.small,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  body: {
    padding: Spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  insightRow: {
    paddingVertical: Spacing.sm,
  },
  insightRowTouchable: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  insightIcon: { marginTop: 2 },
  insightContent: {
    flex: 1,
  },
  refreshRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
});
