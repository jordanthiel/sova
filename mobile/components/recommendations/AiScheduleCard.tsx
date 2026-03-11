import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { useAiInsight } from '@/hooks/useAiInsight';

interface ScheduleEvent {
  time: string;
  event: 'nap_start' | 'nap_end' | 'bedtime';
  label: string;
  note?: string;
}

interface ScheduleData {
  schedule: {
    schedule: ScheduleEvent[];
    total_naps?: number;
    suggested_bedtime?: string;
    notes?: string;
  };
}

interface AiScheduleCardProps {
  babyId: string | null;
  lastWakeTime?: string | null;
}

export function AiScheduleCard({ babyId, lastWakeTime }: AiScheduleCardProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const [expanded, setExpanded] = useState(false);
  const didFetch = useRef(false);
  const prevBabyId = useRef<string | null>(null);

  const { data, loading, error, fetch: fetchSchedule, clearCache } = useAiInsight<ScheduleData>(
    'daily_schedule',
    babyId,
    { cacheTtlMs: 30 * 60 * 1000 } // 30 min cache
  );

  useEffect(() => {
    if (!babyId) return;
    if (prevBabyId.current !== babyId) {
      prevBabyId.current = babyId;
      didFetch.current = false;
    }
    if (!didFetch.current) {
      didFetch.current = true;
      fetchSchedule({ today_wake_time: lastWakeTime || undefined });
    }
  }, [babyId, lastWakeTime]);

  const scheduleItems = data?.schedule?.schedule || [];
  const notes = data?.schedule?.notes;
  const suggestedBedtime = data?.schedule?.suggested_bedtime;

  const handleRefresh = () => {
    clearCache().then(() => fetchSchedule({ today_wake_time: lastWakeTime || undefined }));
  };

  // Don't render until we have something
  if (!loading && !data && !error) return null;

  const getEventIcon = (event: string) => {
    if (event === 'nap_start') return '😴';
    if (event === 'nap_end') return '☀️';
    if (event === 'bedtime') return '🌙';
    return '📅';
  };

  return (
    <View style={[styles.wrapper, Shadows.sm]}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
        <LinearGradient
          colors={[...gradients.cool]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerIcon}>📋</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Today's AI Schedule</Text>
              {suggestedBedtime && !expanded && (
                <Text style={styles.headerSub}>Bedtime: {suggestedBedtime}</Text>
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
                Creating schedule...
              </Text>
            </View>
          ) : error ? (
            <TouchableOpacity onPress={handleRefresh}>
              <Text style={[Typography.caption, { color: colors.error }]}>
                Failed to load schedule. Tap to retry.
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {scheduleItems.length > 0 ? (
                scheduleItems.map((item, i) => (
                  <View
                    key={i}
                    style={[
                      styles.eventRow,
                      i < scheduleItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
                    ]}
                  >
                    <Text style={styles.eventIcon}>{getEventIcon(item.event)}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.eventMainRow}>
                        <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{item.time}</Text>
                        <Text style={[Typography.caption, { color: colors.textSecondary }]}>{item.label}</Text>
                      </View>
                      {item.note && (
                        <Text style={[Typography.small, { color: colors.textTertiary, marginTop: 1 }]}>
                          {item.note}
                        </Text>
                      )}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                  No upcoming events projected.
                </Text>
              )}

              {notes && (
                <View style={[styles.noteBar, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[Typography.small, { color: colors.accent }]}>💡 {notes}</Text>
                </View>
              )}

              <TouchableOpacity onPress={handleRefresh} style={styles.refreshRow}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>Tap to refresh schedule</Text>
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
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  eventIcon: {
    fontSize: 16,
    marginTop: 2,
  },
  eventMainRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  noteBar: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  refreshRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
});
