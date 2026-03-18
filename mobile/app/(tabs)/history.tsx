import { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, View, Text, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BabySwitcher } from '@/components/baby/BabySwitcher';
import { SleepChart } from '@/components/charts/SleepChart';
import { DayTimeline } from '@/components/charts/DayTimeline';
import { SessionListView } from '@/components/charts/SessionListView';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useBabies } from '@/hooks/useBabies';
import { supabase } from '@/lib/supabase';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { format } from 'date-fns';
import { formatDuration } from '@/utils/formatTime';
import { AiInsightChip } from '@/components/recommendations/AiInsightChip';
import { AiForecastCard } from '@/components/recommendations/AiForecastCard';
import type { Database } from '@/lib/supabase';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

const DATE_RANGES = ['week', 'month', 'all'] as const;
type DateRange = (typeof DATE_RANGES)[number];

const VIEW_MODES = ['day', 'week', 'list'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

export default function HistoryScreen() {
  const { babies, loading: babiesLoading } = useBabies();
  const { currentBabyId, setCurrentBabyId, isHydrated } = useCurrentBaby();
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  useEffect(() => {
    if (!isHydrated || babiesLoading || babies.length === 0) return;
    const currentValid = currentBabyId && babies.some((b) => b.id === currentBabyId);
    if (currentValid) return;
    setCurrentBabyId(babies[0].id);
  }, [isHydrated, babies, babiesLoading, currentBabyId, setCurrentBabyId]);

  useEffect(() => {
    if (!currentBabyId) {
      setLoading(false);
      return;
    }
    loadSessions();
  }, [currentBabyId, dateRange]);

  const loadSessions = async () => {
    if (!currentBabyId) return;
    setLoading(true);
    try {
      const now = new Date();
      let since: Date;
      if (dateRange === 'week') {
        since = new Date(now);
        since.setDate(since.getDate() - 7);
      } else if (dateRange === 'month') {
        since = new Date(now);
        since.setMonth(since.getMonth() - 1);
      } else {
        since = new Date(now);
        since.setMonth(since.getMonth() - 6);
      }

      const { data, error } = await supabase
        .from('sleep_sessions')
        .select('*')
        .eq('baby_id', currentBabyId)
        .gte('start_time', since.toISOString())
        .order('start_time', { ascending: false })
        .limit(200);

      if (error) throw error;
      setSessions(data || []);
    } catch (error: any) {
      console.error('Error loading sessions:', error);
      if (error?.code === 'PGRST000' || error?.code === '57014') {
        // Network or timeout — keep stale data
      } else {
        setSessions([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSessions();
    setRefreshing(false);
  };

  const getStats = () => {
    const completedSessions = sessions.filter((s) => s.end_time && s.duration_minutes);
    const naps = completedSessions.filter((s) => s.type === 'nap');
    const nights = completedSessions.filter((s) => s.type === 'night');
    const totalNapMinutes = naps.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const totalNightMinutes = nights.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    return {
      napCount: naps.length,
      nightCount: nights.length,
      avgNapDuration: naps.length > 0 ? Math.round(totalNapMinutes / naps.length) : 0,
      avgNightDuration: nights.length > 0 ? Math.round(totalNightMinutes / nights.length) : 0,
    };
  };

  const stats = getStats();

  // --- Loading ---
  if (babiesLoading || (loading && sessions.length === 0)) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContainer}>
          <SkeletonCard style={{ marginBottom: Spacing.md }} />
          <SkeletonCard style={{ marginBottom: Spacing.md }} />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <BabySwitcher currentBabyId={currentBabyId} babies={babies} onBabyChange={setCurrentBabyId} />
        </View>

        {currentBabyId && (
          <>
            {/* View mode switcher */}
            <View style={styles.viewModeRow}>
              {VIEW_MODES.map((mode) => {
                const isActive = viewMode === mode;
                const label = mode === 'day' ? 'Day' : mode === 'week' ? 'Week' : 'List';
                return (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => setViewMode(mode)}
                    activeOpacity={0.7}
                    style={[
                      styles.viewModePill,
                      isActive
                        ? { backgroundColor: colors.accent }
                        : { backgroundColor: 'rgba(255, 255, 255, 0.06)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
                    ]}
                  >
                    <Text
                      style={[
                        Typography.captionMedium,
                        { color: isActive ? '#0B1426' : colors.textSecondary },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Date range filter */}
            {viewMode !== 'day' && (
              <View style={styles.filterRow}>
                {DATE_RANGES.map((range) => {
                  const isActive = dateRange === range;
                  return (
                    <TouchableOpacity
                      key={range}
                      onPress={() => setDateRange(range)}
                      activeOpacity={0.7}
                      style={[styles.filterPill, !isActive && { backgroundColor: 'rgba(255, 255, 255, 0.04)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' }]}
                    >
                      {isActive ? (
                        <LinearGradient
                          colors={[...gradients.accent]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.filterPillGradient}
                        >
                          <Text style={[Typography.captionMedium, { color: '#0B1426' }]}>
                            {range === 'week' ? 'Week' : range === 'month' ? 'Month' : 'All Time'}
                          </Text>
                        </LinearGradient>
                      ) : (
                        <Text style={[Typography.captionMedium, { color: colors.textSecondary }]}>
                          {range === 'week' ? 'Week' : range === 'month' ? 'Month' : 'All Time'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* View content */}
            {viewMode === 'day' && sessions.length > 0 && (
              <DayTimeline sessions={sessions} />
            )}

            {viewMode === 'week' && sessions.length > 0 && (
              <SleepChart sessions={sessions} days={dateRange === 'week' ? 7 : dateRange === 'month' ? 30 : 7} />
            )}

            {viewMode === 'list' && sessions.length > 0 && (
              <View style={{ marginTop: Spacing.sm }}>
                <SessionListView sessions={sessions} />
              </View>
            )}

            {sessions.length === 0 && (
              <EmptyState
                icon="📊"
                title="No sessions yet"
                message="Sleep sessions will appear here once you start tracking."
              />
            )}

            {/* AI insight chip */}
            <AiInsightChip babyId={currentBabyId} contextType="weekly_trend" />

            {/* AI forecast */}
            {viewMode === 'week' && <AiForecastCard babyId={currentBabyId} />}

            {/* Stats */}
            <View style={styles.section}>
              <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>
                Statistics
              </Text>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <LinearGradient colors={['rgba(255, 184, 77, 0.15)', 'rgba(255, 184, 77, 0.05)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statGradient}>
                    <Text style={styles.statEmoji}>☀️</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{stats.napCount}</Text>
                    <Text style={[Typography.caption, { color: colors.textSecondary }]}>Naps</Text>
                  </LinearGradient>
                </View>
                <View style={styles.statCard}>
                  <LinearGradient colors={['rgba(91, 163, 232, 0.15)', 'rgba(91, 163, 232, 0.05)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statGradient}>
                    <Text style={styles.statEmoji}>🌙</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{stats.nightCount}</Text>
                    <Text style={[Typography.caption, { color: colors.textSecondary }]}>Nights</Text>
                  </LinearGradient>
                </View>
                <View style={styles.statCard}>
                  <LinearGradient colors={['rgba(78, 205, 196, 0.15)', 'rgba(78, 205, 196, 0.05)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statGradient}>
                    <Text style={styles.statEmoji}>⏱</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{stats.avgNapDuration > 0 ? formatDuration(stats.avgNapDuration) : '-'}</Text>
                    <Text style={[Typography.caption, { color: colors.textSecondary }]}>Avg Nap</Text>
                  </LinearGradient>
                </View>
                <View style={styles.statCard}>
                  <LinearGradient colors={['rgba(129, 140, 248, 0.15)', 'rgba(129, 140, 248, 0.05)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statGradient}>
                    <Text style={styles.statEmoji}>💤</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{stats.avgNightDuration > 0 ? formatDuration(stats.avgNightDuration) : '-'}</Text>
                    <Text style={[Typography.caption, { color: colors.textSecondary }]}>Avg Night</Text>
                  </LinearGradient>
                </View>
              </View>
            </View>

            {/* Session list (in week view) */}
            {viewMode === 'week' && (
              <View style={styles.section}>
                <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>
                  Sleep Sessions
                </Text>
                {sessions.length === 0 ? (
                  <EmptyState
                    icon="📊"
                    title="No sessions yet"
                    message="Sleep sessions will appear here once you start tracking."
                  />
                ) : (
                  sessions.slice(0, 20).map((session, index) => {
                    const isNap = session.type === 'nap';
                    return (
                      <Card
                        key={session.id}
                        style={[styles.sessionCard, index < Math.min(sessions.length, 20) - 1 && { marginBottom: Spacing.sm }]}
                        padding="md"
                      >
                        <View style={styles.sessionRow}>
                          <View
                            style={[
                              styles.sessionIcon,
                              { backgroundColor: isNap ? 'rgba(255, 184, 77, 0.15)' : 'rgba(91, 163, 232, 0.15)' },
                            ]}
                          >
                            <Text style={styles.sessionIconEmoji}>{isNap ? '☀️' : '🌙'}</Text>
                          </View>
                          <View style={styles.sessionInfo}>
                            <View style={styles.sessionHeader}>
                              <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
                                {isNap ? 'Nap' : 'Night Sleep'}
                              </Text>
                              <Text style={[Typography.small, { color: colors.textTertiary }]}>
                                {format(new Date(session.start_time), 'MMM d')}
                              </Text>
                            </View>
                            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                              {format(new Date(session.start_time), 'h:mm a')}
                              {session.end_time && ` - ${format(new Date(session.end_time), 'h:mm a')}`}
                            </Text>
                            {session.notes && (
                              <Text
                                style={[Typography.small, { color: colors.textTertiary, fontStyle: 'italic', marginTop: 2 }]}
                              >
                                {session.notes}
                              </Text>
                            )}
                          </View>
                          {session.duration_minutes != null && (
                            <Badge
                              label={formatDuration(session.duration_minutes)}
                              backgroundColor={isNap ? 'rgba(255, 184, 77, 0.15)' : 'rgba(91, 163, 232, 0.15)'}
                              color={isNap ? colors.napColor : colors.nightColor}
                              size="md"
                            />
                          )}
                        </View>
                      </Card>
                    );
                  })
                )}
              </View>
            )}
          </>
        )}

        {!currentBabyId && (
          <EmptyState icon="👶" title="Select a baby" message="Choose a baby to view their sleep history." />
        )}

        <View style={{ height: 110 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1426',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  header: {
    padding: Spacing.md,
    paddingTop: Spacing.sm,
  },
  viewModeRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  viewModePill: {
    flex: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  filterPill: {
    flex: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingVertical: Spacing.sm,
  },
  filterPillGradient: {
    width: '100%',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.full,
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  statGradient: {
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  statEmoji: {
    fontSize: 20,
    marginBottom: Spacing.xs,
  },
  statValue: {
    ...Typography.h3,
    marginBottom: 2,
  },
  sessionCard: {},
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionIconEmoji: {
    fontSize: 18,
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
