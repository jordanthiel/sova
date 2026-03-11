import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { useAiInsight } from '@/hooks/useAiInsight';
import { formatDuration } from '@/utils/formatTime';

interface ForecastDay {
  day: string;
  expected_naps: number;
  expected_total_nap_minutes: number;
  expected_night_hours: number;
  confidence: 'high' | 'medium' | 'low';
  note: string;
}

interface ForecastData {
  forecast: {
    forecast: ForecastDay[];
    trend: 'improving' | 'stable' | 'declining' | 'transitioning';
    trend_note: string;
  };
}

interface AiForecastCardProps {
  babyId: string | null;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: '#34C759',
  medium: '#FF9500',
  low: '#FF3B30',
};

export function AiForecastCard({ babyId }: AiForecastCardProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();
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

  const forecasts = data?.forecast?.forecast || [];
  const trend = data?.forecast?.trend;
  const trendNote = data?.forecast?.trend_note;

  const handleRefresh = () => {
    clearCache().then(() => fetchForecast({}));
  };

  if (!loading && !data && !error) return null;

  const getTrendIcon = () => {
    if (trend === 'improving') return '📈';
    if (trend === 'declining') return '📉';
    if (trend === 'transitioning') return '🔄';
    return '➡️';
  };

  return (
    <View style={[styles.wrapper, Shadows.sm]}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
        <LinearGradient
          colors={[...gradients.sunset]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerIcon}>🔮</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Sleep Forecast</Text>
              {trendNote && !expanded && (
                <Text style={styles.headerSub} numberOfLines={1}>{trendNote}</Text>
              )}
            </View>
            <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.body, { backgroundColor: colors.surface }]}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[Typography.caption, { color: colors.textSecondary, marginLeft: Spacing.sm }]}>
                Generating forecast...
              </Text>
            </View>
          ) : error ? (
            <TouchableOpacity onPress={handleRefresh}>
              <Text style={[Typography.caption, { color: colors.error }]}>
                Failed to load forecast. Tap to retry.
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* Trend summary */}
              {trendNote && (
                <View style={[styles.trendBar, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[Typography.caption, { color: colors.accent }]}>
                    {getTrendIcon()} Trend: {trend} — {trendNote}
                  </Text>
                </View>
              )}

              {/* Forecast days */}
              {forecasts.map((day, i) => (
                <View
                  key={i}
                  style={[
                    styles.forecastRow,
                    i < forecasts.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.forecastMainRow}>
                      <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{day.day}</Text>
                      <View style={[styles.confidenceDot, { backgroundColor: CONFIDENCE_COLORS[day.confidence] || colors.textTertiary }]} />
                    </View>
                    <View style={styles.forecastStats}>
                      <Text style={[Typography.small, { color: colors.textSecondary }]}>
                        {day.expected_naps} nap{day.expected_naps !== 1 ? 's' : ''} · {formatDuration(day.expected_total_nap_minutes)} nap time
                      </Text>
                      <Text style={[Typography.small, { color: colors.textSecondary }]}>
                        {day.expected_night_hours}h night
                      </Text>
                    </View>
                    {day.note && (
                      <Text style={[Typography.small, { color: colors.textTertiary, fontStyle: 'italic', marginTop: 2 }]}>
                        {day.note}
                      </Text>
                    )}
                  </View>
                </View>
              ))}

              <TouchableOpacity onPress={handleRefresh} style={styles.refreshRow}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>Tap to refresh forecast</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
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
  headerGradient: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerIcon: {
    fontSize: 18,
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
  chevron: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
  },
  body: {
    padding: Spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  trendBar: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  forecastRow: {
    paddingVertical: Spacing.sm,
  },
  forecastMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  forecastStats: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: 2,
  },
  refreshRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
});
