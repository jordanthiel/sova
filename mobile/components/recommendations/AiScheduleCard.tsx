import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { useAiInsight } from '@/hooks/useAiInsight';
import type { Database } from '@/lib/supabase';

type SleepType = Database['public']['Tables']['sleep_sessions']['Row']['type'];

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

export interface AiScheduleActiveSession {
  type: SleepType;
  start_time: string;
}

interface AiScheduleCardProps {
  babyId: string | null;
  lastWakeTime?: string | null;
  /** When set, schedule cache and API context reflect in-progress sleep (nap or night). */
  activeSession?: AiScheduleActiveSession | null;
}

export function AiScheduleCard({ babyId, lastWakeTime, activeSession }: AiScheduleCardProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const [expanded, setExpanded] = useState(false);

  const sleepStateKey = activeSession ? `${activeSession.type}_${activeSession.start_time}` : 'awake';

  const { data, loading, error, fetch: fetchSchedule, clearCache } = useAiInsight<ScheduleData>(
    'daily_schedule',
    babyId,
    {
      cacheTtlMs: 30 * 60 * 1000,
      cacheKeySuffix: sleepStateKey,
    }
  );

  useEffect(() => {
    if (!babyId) return;
    fetchSchedule({ today_wake_time: lastWakeTime || undefined });
  }, [babyId, lastWakeTime, sleepStateKey, fetchSchedule]);

  const scheduleItems = data?.schedule?.schedule || [];
  const notes = data?.schedule?.notes;
  const suggestedBedtime = data?.schedule?.suggested_bedtime;

  const handleRefresh = () => {
    clearCache().then(() =>
      fetchSchedule({ today_wake_time: lastWakeTime || undefined })
    );
  };

  const sessionStartedLabel =
    activeSession &&
    new Date(activeSession.start_time).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

  // Don't render until we have something
  if (!loading && !data && !error) return null;

  const getEventIconName = (event: string): import('@/components/ui/icon-symbol').IconSymbolName => {
    if (event === 'nap_start') return 'moon.zzz.fill';
    if (event === 'nap_end') return 'sun.max.fill';
    if (event === 'bedtime') return 'moon.fill';
    return 'calendar';
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
            <IconSymbol name="list.clipboard" size={18} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Today's AI Schedule</Text>
              {!expanded &&
                (activeSession?.type === 'night' ? (
                  <Text style={styles.headerSub}>
                    In night sleep{sessionStartedLabel ? ` · since ${sessionStartedLabel}` : ''}
                  </Text>
                ) : activeSession?.type === 'nap' ? (
                  <Text style={styles.headerSub}>
                    Nap in progress{sessionStartedLabel ? ` · since ${sessionStartedLabel}` : ''}
                  </Text>
                ) : suggestedBedtime ? (
                  <Text style={styles.headerSub}>Bedtime: {suggestedBedtime}</Text>
                ) : null)}
            </View>
            <IconSymbol
              name={expanded ? 'chevron.up' : 'chevron.down'}
              size={14}
              color="rgba(255,255,255,0.7)"
            />
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
                    <IconSymbol name={getEventIconName(item.event)} size={18} color={colors.text} />
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
                <View style={[styles.noteBar, { backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }]}>
                  <IconSymbol name="lightbulb.fill" size={14} color={colors.accent} />
                  <Text style={[Typography.small, { color: colors.accent, flex: 1 }]}>{notes}</Text>
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
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
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
