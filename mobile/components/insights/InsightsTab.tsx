import { InsightsBundleCard } from '@/components/insights/InsightsBundleCard';
import { AiForecastCard } from '@/components/recommendations/AiForecastCard';
import { AiScheduleCard } from '@/components/recommendations/AiScheduleCard';
import { Button } from '@/components/ui/Button';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useBabies } from '@/hooks/useBabies';
import { useCoachMemories } from '@/hooks/useCoachMemories';
import { useRealtimeSleepSessions } from '@/hooks/useRealtimeSleepSessions';
import { useSleepData } from '@/hooks/useSleepData';
import type { Database } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { track } from '@/services/analytics/track';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

type Recommendation = Database['public']['Tables']['recommendations']['Row'];

export function InsightsTab() {
  const { babies, loading: babiesLoading } = useBabies();
  const { currentBabyId, setCurrentBabyId, isHydrated } = useCurrentBaby();
  const { baby, ageDays } = useSleepData({ babyId: currentBabyId });
  const { sessions: allSessions } = useRealtimeSleepSessions(currentBabyId);
  const { memoryStrings } = useCoachMemories(currentBabyId);
  const [pastRecommendations, setPastRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const colors = useThemeColors();

  useEffect(() => {
    if (!isHydrated || babiesLoading || babies.length === 0) return;
    const currentValid = currentBabyId && babies.some((b) => b.id === currentBabyId);
    if (currentValid) return;
    setCurrentBabyId(babies[0].id);
  }, [isHydrated, babies, babiesLoading, currentBabyId, setCurrentBabyId]);

  const endedSessions = allSessions
    .filter((s) => s.end_time !== null)
    .sort((a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime());
  const rawLastWakeTime = endedSessions.length > 0 ? endedSessions[0].end_time : null;
  const awakeMinutes = rawLastWakeTime
    ? Math.round((Date.now() - new Date(rawLastWakeTime).getTime()) / 60000)
    : 0;
  const MAX_AWAKE_MINUTES = 16 * 60;
  const lastWakeTime =
    rawLastWakeTime && awakeMinutes <= MAX_AWAKE_MINUTES ? rawLastWakeTime : null;

  const openSleepSessions = allSessions.filter((s) => s.end_time === null);
  const activeSleepSession =
    openSleepSessions.length === 0
      ? null
      : openSleepSessions.reduce((a, b) =>
          new Date(b.start_time).getTime() > new Date(a.start_time).getTime() ? b : a
        );

  useEffect(() => {
    if (currentBabyId) loadPastRecommendations();
  }, [currentBabyId]);

  const loadPastRecommendations = async () => {
    if (!currentBabyId) return;
    setLoadingRecs(true);
    try {
      const { data, error: recError } = await supabase
        .from('recommendations')
        .select('*')
        .eq('baby_id', currentBabyId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (recError) throw recError;
      setPastRecommendations(data || []);
    } catch (err) {
      console.error('Error loading recommendations:', err);
    } finally {
      setLoadingRecs(false);
    }
  };

  const openCoachWithMessage = useCallback((initialMessage: string) => {
    track('insight_ask_coach', { prompt: initialMessage.substring(0, 50) });
    router.push({
      pathname: '/(tabs)/coach',
      params: { initialMessage },
    });
  }, []);

  const handleGetFullRecommendation = useCallback(() => {
    if (!currentBabyId) {
      Alert.alert('Error', 'Please select a baby first');
      return;
    }
    openCoachWithMessage(
      'Give me a full sleep analysis: a comprehensive assessment with age-appropriate schedule recommendations and actionable tips.'
    );
  }, [currentBabyId, openCoachWithMessage]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPastRecommendations();
    setRefreshing(false);
  };

  const ageMonths = Math.floor(ageDays / 30);
  const ageDaysRemainder = ageDays % 30;

  if (babiesLoading) {
    return (
      <View style={styles.loadingContainer}>
        <SkeletonCard style={{ marginBottom: Spacing.md }} />
        <SkeletonCard style={{ marginBottom: Spacing.md }} />
        <SkeletonCard />
      </View>
    );
  }

  if (babies.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <EmptyState
          icon="sparkles"
          title="Select a baby"
          message="Choose a baby to view insights and recommendations."
        />
      </View>
    );
  }

  if (!currentBabyId || !baby) {
    return (
      <View style={styles.loadingContainer}>
        <EmptyState
          icon="sparkles"
          title="Select a baby"
          message="Choose a baby to view insights and recommendations."
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      

      {/* Quick AI insight chips */}
      

      {/* AI Discoveries - clickable to start coach conversation */}
      <View style={styles.section}>
        <InsightsBundleCard babyId={currentBabyId} onInsightPress={openCoachWithMessage} />
      </View>

      {/* Today's schedule & forecast */}
      <View style={styles.section}>
        <AiScheduleCard
          babyId={currentBabyId}
          lastWakeTime={lastWakeTime}
          activeSession={
            activeSleepSession
              ? { type: activeSleepSession.type, start_time: activeSleepSession.start_time }
              : null
          }
        />
        <AiForecastCard babyId={currentBabyId} />
      </View>

      {/* Get full analysis CTA */}
      <View style={styles.section}>
        <DarkPanel style={styles.ctaCard} padding="lg" shadow="sm">
            <IconSymbol name="list.clipboard" size={32} color={colors.text} style={{ alignSelf: 'center', marginBottom: Spacing.sm }} />
            <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs, textAlign: 'center' }]}>
              Full Sleep Analysis
            </Text>
            <Text style={[Typography.body, { color: colors.textSecondary, marginBottom: Spacing.md, textAlign: 'center' }]}>
              Get a comprehensive assessment with age-appropriate schedule recommendations and actionable tips.
            </Text>
            <Button
              title="Get Full Recommendation"
              onPress={handleGetFullRecommendation}
              fullWidth
              variant="primary"
            />
        </DarkPanel>
      </View>

      {/* Latest recommendation (from recommendations table, e.g. legacy or other flows) */}
      

      {/* Past recommendations */}
      

      <View style={{ height: 110 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.lg },
  loadingContainer: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    alignItems: 'stretch',
  },
  babyInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  babyInfoText: {
    flex: 1,
  },
  ctaCard: {
    borderRadius: Radius.xl,
  },
});
