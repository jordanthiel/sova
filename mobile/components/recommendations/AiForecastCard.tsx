import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useAiInsight } from '@/hooks/useAiInsight';

type TrendLabel = 'improving' | 'stable' | 'declining' | 'transitioning';
type Confidence = 'high' | 'medium' | 'low';
type NightQuality = 'good' | 'fair' | 'challenging';

/** Matches server `normalizeTonightForecast` output from chatgpt-sleep-coach `forecast` mode */
export interface TonightSleepForecast {
  predicted_night_sleep_hours: number | null;
  bedtime_window_start: string | null;
  bedtime_window_end: string | null;
  expected_bedtime: string | null;
  expected_wakes: number | null;
  night_quality: NightQuality | null;
  confidence: Confidence;
  summary: string;
  trend: TrendLabel;
  trend_note: string;
  key_factors: string[];
}

interface ForecastData {
  forecast?: TonightSleepForecast;
  provider?: string;
}

interface AiForecastCardProps {
  babyId: string | null;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: '#34C759',
  medium: '#FF9500',
  low: '#FF3B30',
};

const NIGHT_QUALITY_LABEL: Record<NightQuality, string> = {
  good: 'Likely smoother',
  fair: 'Mixed',
  challenging: 'May be rough',
};

function bedtimeSummary(f: TonightSleepForecast): string | null {
  if (f.bedtime_window_start && f.bedtime_window_end) {
    return `${f.bedtime_window_start} – ${f.bedtime_window_end}`;
  }
  if (f.expected_bedtime) return f.expected_bedtime;
  if (f.bedtime_window_start) return f.bedtime_window_start;
  return null;
}

function headerPreview(f: TonightSleepForecast | undefined): string {
  if (!f) return '';
  if (f.trend_note) return f.trend_note;
  const s = f.summary?.trim();
  if (!s) return '';
  const cut = s.indexOf('. ');
  return cut > 0 && cut < 120 ? s.slice(0, cut + 1) : s.slice(0, 100) + (s.length > 100 ? '…' : '');
}

export function AiForecastCard({ babyId }: AiForecastCardProps) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const didFetch = useRef(false);
  const prevBabyId = useRef<string | null>(null);

  const { data, loading, error, fetch: fetchForecast, clearCache } = useAiInsight<ForecastData>(
    'forecast',
    babyId,
    { cacheTtlMs: 60 * 60 * 1000 } // 1 hour cache
  );

  useEffect(() => {
    if (!babyId) return;
    if (prevBabyId.current !== babyId) {
      prevBabyId.current = babyId;
      didFetch.current = false;
    }
    if (!didFetch.current) {
      didFetch.current = true;
      fetchForecast({});
    }
  }, [babyId]);

  const f = data?.forecast;
  const preview = headerPreview(f);

  const handleRefresh = () => {
    clearCache().then(() => fetchForecast({}));
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
            <IconSymbol name="wand.and.stars" size={18} color={colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Tonight&apos;s sleep</Text>
              {preview && !expanded && (
                <Text style={styles.headerSub} numberOfLines={1}>{preview}</Text>
              )}
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
                Generating tonight&apos;s outlook...
              </Text>
            </View>
          ) : error ? (
            <TouchableOpacity onPress={handleRefresh}>
              <Text style={[Typography.caption, { color: colors.error }]}>
                Failed to load forecast. Tap to retry.
              </Text>
            </TouchableOpacity>
          ) : !f ? (
            <TouchableOpacity onPress={handleRefresh}>
              <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                Tonight&apos;s outlook isn&apos;t available. Tap to retry.
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {f.summary ? (
                <Text style={[Typography.small, { color: colors.text, lineHeight: 20, marginBottom: Spacing.sm }]}>
                  {f.summary}
                </Text>
              ) : null}

              <View style={styles.metricsRow}>
                <View style={[styles.metricCell, { borderColor: colors.borderLight }]}>
                  <Text style={[Typography.caption, { color: colors.textTertiary }]}>Bedtime</Text>
                  <Text style={[Typography.bodySemiBold, { color: colors.text, marginTop: 2 }]}>
                    {bedtimeSummary(f) || '—'}
                  </Text>
                </View>
                <View style={[styles.metricCell, { borderColor: colors.borderLight }]}>
                  <Text style={[Typography.caption, { color: colors.textTertiary }]}>Night sleep</Text>
                  <Text style={[Typography.bodySemiBold, { color: colors.text, marginTop: 2 }]}>
                    {f?.predicted_night_sleep_hours != null ? `~${f.predicted_night_sleep_hours}h` : '—'}
                  </Text>
                </View>
                <View style={[styles.metricCell, { borderColor: colors.borderLight }]}>
                  <Text style={[Typography.caption, { color: colors.textTertiary }]}>Wakes</Text>
                  <Text style={[Typography.bodySemiBold, { color: colors.text, marginTop: 2 }]}>
                    {f?.expected_wakes != null ? `~${f.expected_wakes}` : '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                {f?.night_quality ? (
                  <View style={[styles.pill, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[Typography.small, { color: colors.accent }]}>
                      {NIGHT_QUALITY_LABEL[f.night_quality]}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.confidenceRow}>
                  <Text style={[Typography.caption, { color: colors.textTertiary }]}>Confidence</Text>
                  <View style={[styles.confidenceDot, { backgroundColor: CONFIDENCE_COLORS[f?.confidence ?? 'medium'] || colors.textTertiary }]} />
                  <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                    {f?.confidence ?? '—'}
                  </Text>
                </View>
              </View>

              {f?.key_factors && f.key_factors.length > 0 && (
                <View style={styles.factorsBlock}>
                  <Text style={[Typography.caption, { color: colors.textTertiary, marginBottom: Spacing.xs }]}>
                    Key factors
                  </Text>
                  {f.key_factors.map((line, i) => (
                    <Text
                      key={i}
                      style={[Typography.small, { color: colors.textSecondary, marginBottom: 4, paddingLeft: Spacing.sm }]}
                    >
                      • {line}
                    </Text>
                  ))}
                </View>
              )}

              <TouchableOpacity onPress={handleRefresh} style={styles.refreshRow}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>Tap to refresh</Text>
              </TouchableOpacity>
            </>
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
    fontSize: 14,
  },
  headerSub: {
    ...Typography.small,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
  body: {
    padding: Spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  metricCell: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.md,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  factorsBlock: {
    marginBottom: Spacing.sm,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  refreshRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
});
