import { BabySwitcher } from '@/components/baby/BabySwitcher';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { ActiveSessionCard } from '@/components/sleep/ActiveSessionCard';
import { SessionEditModal } from '@/components/sleep/SessionEditModal';
import { SwipeableSessionCard } from '@/components/sleep/SwipeableSessionCard';
import { NightSleepScoreCard } from '@/components/today/NightSleepScoreCard';
import { StatusAndRecommendationCard } from '@/components/today/StatusAndRecommendationCard';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import { Spacing, Typography } from '@/constants/theme';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useBabies } from '@/hooks/useBabies';
import { useCoachMemories } from '@/hooks/useCoachMemories';
import { useNightSleepScores } from '@/hooks/useNightSleepScores';
import { useRealtimeCaregivers } from '@/hooks/useRealtimeCaregivers';
import { useRealtimeSleepSessions } from '@/hooks/useRealtimeSleepSessions';
import { useSleepData } from '@/hooks/useSleepData';
import type { Database } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { getLocalNapRecommendation, getNextNapRecommendation, getSuggestedNapCap, isNighttimeWake, shouldCapNap } from '@/services/ai/recommendations';
import { track } from '@/services/analytics/track';
import { scheduleCapReminder } from '@/services/notifications';
import { babiesRepo } from '@/services/repositories/babiesRepo';
import { storedNapTargetsRepo } from '@/services/repositories/storedNapTargetsRepo';
import type { AIRecommendation, Baby, BabyPreferences, NapRecommendationPayload, SleepEvent } from '@/types/domain';
import { getExtendedDayBounds, sessionOverlapsExtendedDay } from '@/utils/dateUtils';
import { formatDuration } from '@/utils/formatTime';
import { getNightSummaries, isNightComplete } from '@/utils/nightSleepScore';
import { calculateAgeDays, getEffectiveWakeWindowMinutes } from '@/utils/wakeWindowCalculator';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

const DEFAULT_PREFS: BabyPreferences = {
  preferLongerNaps: false,
  preferEarlierBedtime: false,
  strictSchedule: false,
  sleepGoals: [],
  bedtimeType: 'flexible',
  bedtimeTargetTime: null,
  targetNapCount: null,
  lastWakeWindowMinutes: null,
};

function getGreeting(): { text: string; icon: string } {
  const hour = new Date().getHours();
  if (hour < 6) return { text: 'Good Night', icon: '🌙' };
  if (hour < 12) return { text: 'Good Morning', icon: '☀️' };
  if (hour < 17) return { text: 'Good Afternoon', icon: '🌤' };
  if (hour < 21) return { text: 'Good Evening', icon: '🌅' };
  return { text: 'Good Night', icon: '🌙' };
}

function sessionToSleepEvent(s: SleepSession): SleepEvent {
  return {
    id: s.id,
    babyId: s.baby_id,
    type: s.type as 'nap' | 'night',
    start: s.start_time,
    end: s.end_time,
    createdBy: s.logged_by,
    note: s.notes,
    durationMinutes: s.duration_minutes,
  };
}

export default function TodayScreen() {
  const { babies, loading: babiesLoading, refetch: refetchBabies } = useBabies();
  const { currentBabyId, setCurrentBabyId, isHydrated } = useCurrentBaby();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { baby, loading } = useSleepData({ babyId: currentBabyId });
  const { sessions: allSessions, refetch: refetchSessions } = useRealtimeSleepSessions(currentBabyId);
  const { caregivers } = useRealtimeCaregivers(currentBabyId);
  const { memoryStrings } = useCoachMemories(currentBabyId);
  const [lastWakeTime, setLastWakeTime] = useState<Date | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [nightScoreRefreshTrigger, setNightScoreRefreshTrigger] = useState(0);
  const [editSession, setEditSession] = useState<SleepSession | null>(null);
  const [preferences, setPreferences] = useState<BabyPreferences | null>(null);
  const colors = useThemeColors();
  const greeting = getGreeting();

  const activeSession = allSessions.find((s) => s.end_time === null) || null;

  const { start: todayStart, end: todayEnd } = getExtendedDayBounds(new Date());
  const todaySessions = allSessions.filter((s) => {
    if (s.end_time === null) return false;
    return sessionOverlapsExtendedDay(s.start_time, s.end_time, todayStart, todayEnd);
  });

  const totalNapMinutes = todaySessions
    .filter((s) => s.type === 'nap' && s.duration_minutes)
    .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const napCount = todaySessions.filter((s) => s.type === 'nap').length;
  const nightCount = todaySessions.filter((s) => s.type === 'night').length;

  useEffect(() => {
    const endedSessions = allSessions
      .filter((s) => s.end_time !== null)
      .sort((a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime());
    if (endedSessions.length > 0) {
      setLastWakeTime(new Date(endedSessions[0].end_time!));
    }
  }, [allSessions]);

  useEffect(() => {
    if (isHydrated && !babiesLoading && babies.length > 0) {
      const currentValid = currentBabyId && babies.some((b) => b.id === currentBabyId);
      if (!currentValid) setCurrentBabyId(babies[0].id);
    }
  }, [isHydrated, babies, babiesLoading, currentBabyId, setCurrentBabyId]);

  useEffect(() => {
    if (currentBabyId) {
      babiesRepo.getPreferences(currentBabyId).then(setPreferences);
    }
  }, [currentBabyId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchBabies(), refetchSessions?.()]);
    setRefreshing(false);
    setNightScoreRefreshTrigger((t) => t + 1);
  }, [refetchBabies, refetchSessions]);

  const hasMountedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      track('view_today', { babyId: currentBabyId });
      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        return;
      }
      refetchSessions?.();
    }, [refetchSessions, currentBabyId])
  );

  // Compute derived data
  const ageDays = baby ? calculateAgeDays(baby.birth_date) : 0;
  const prefs = preferences ?? DEFAULT_PREFS;
  const awakeMinutes = lastWakeTime
    ? Math.round((Date.now() - lastWakeTime.getTime()) / 60000)
    : 0;

  const hasAnyEndedSessions = allSessions.some((s) => s.end_time != null);
  const MAX_AWAKE_MINUTES = 16 * 60; // don't show "awake since" if > 16h (stale)
  const showStatusCard =
    !!activeSession || (hasAnyEndedSessions && awakeMinutes <= MAX_AWAKE_MINUTES);

  const domainBaby: Baby | null = useMemo(
    () =>
      baby && currentBabyId
        ? {
            id: baby.id,
            name: baby.name,
            birthdate: baby.birth_date,
            preferences: preferences ?? DEFAULT_PREFS,
            caregivers: [],
          }
        : null,
    [baby?.id, baby?.name, baby?.birth_date, currentBabyId, preferences]
  );

  const [recommendation, setRecommendation] = useState<AIRecommendation | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const lastFetchKeyRef = useRef<string | null>(null);
  /** Current fetch key; only apply API results when they match (avoids race where an older response overwrites a newer one). */
  const activeFetchKeyRef = useRef<string | null>(null);
  /** Id of the stored_nap_targets row we're currently showing; used so regenerate (refresh) updates that row instead of inserting. */
  const currentStoredTargetIdRef = useRef<string | null>(null);

  // Fingerprint of recent session end times — target window only updates when this changes (e.g. nap completed) or user refreshes
  const sessionDataKey = useMemo(() => {
    const ended = allSessions
      .filter((s) => s.end_time != null)
      .sort((a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime())
      .slice(0, 10);
    return ended.map((s) => `${s.id}:${s.end_time}`).join('|');
  }, [allSessions]);

  // Determine the last ended session type (nap vs night) for isNighttimeWake
  const lastEndedSession = useMemo(() => {
    const ended = allSessions
      .filter((s) => s.end_time != null)
      .sort((a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime());
    return ended.length > 0 ? ended[0] : null;
  }, [allSessions]);

  const lastNightSummaries = useMemo(
    () => getNightSummaries(allSessions ?? [], { maxNights: 7 }),
    [allSessions]
  );
  /** Only show scores for nights that are actually complete (2h since last segment ended). */
  const completedNightSummaries = useMemo(
    () => lastNightSummaries.filter((s) => isNightComplete(s)),
    [lastNightSummaries]
  );
  const lastNightSummary = completedNightSummaries[0] ?? null;
  const lastNightScoreDateKeys = lastNightSummaries.map((s) => s.dateKey);
  const nightScoresByDateKey = useNightSleepScores(
    domainBaby?.id ?? null,
    lastNightScoreDateKeys,
    allSessions ?? [],
    nightScoreRefreshTrigger
  );
  const lastNightScore = useMemo(() => {
    const summary = lastNightSummary;
    if (!summary) return null;
    const s = nightScoresByDateKey[summary.dateKey];
    if (s == null) return null;
    const label = (() => {
      const d = new Date(summary.dateKey + 'T12:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = Math.floor((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
      if (diff <= 1) return 'Last night';
      if (diff === 2) return '2 nights ago';
      return `${diff} nights ago`;
    })();
    return {
      score: s,
      totalSleepMinutes: summary.totalSleepMinutes,
      wakeupCount: summary.wakeupCount,
      totalAwakeMinutes: summary.totalAwakeMinutes,
      dateKey: summary.dateKey,
      label,
    };
  }, [lastNightSummary, nightScoresByDateKey]);

  const nightScoreTrendData = useMemo(() => {
    if (completedNightSummaries.length < 2) return [];
    return [...completedNightSummaries].reverse()
      .filter((s) => nightScoresByDateKey[s.dateKey] != null)
      .map((s) => ({
        dateKey: s.dateKey,
        score: nightScoresByDateKey[s.dateKey],
      }));
  }, [completedNightSummaries, nightScoresByDateKey]);

  const fetchKey = useMemo(
    () => (domainBaby ? `${domainBaby.id}:${sessionDataKey}:${memoryStrings.join(',')}` : null),
    [domainBaby, sessionDataKey, memoryStrings]
  );

  // Load stored target first; only refetch when session data changed or no stored target (target stays static until next rec)
  useEffect(() => {
    if (!domainBaby || activeSession) {
      setRecommendation(null);
      setRecommendationLoading(false);
      lastFetchKeyRef.current = null;
      activeFetchKeyRef.current = null;
      currentStoredTargetIdRef.current = null;
      return;
    }
    if (!hasAnyEndedSessions) {
      setRecommendation(null);
      setRecommendationLoading(false);
      lastFetchKeyRef.current = null;
      activeFetchKeyRef.current = null;
      currentStoredTargetIdRef.current = null;
      return;
    }
    if (lastWakeTime && isNighttimeWake(lastWakeTime, lastEndedSession?.type as 'nap' | 'night' | undefined)) {
      setRecommendation(null);
      setRecommendationLoading(false);
      lastFetchKeyRef.current = null;
      activeFetchKeyRef.current = null;
      currentStoredTargetIdRef.current = null;
      return;
    }

    const key = fetchKey!;
    activeFetchKeyRef.current = key;
    setRecommendationLoading(true);

    const loadStoredThenMaybeRefetch = async () => {
      try {
        const stored = await storedNapTargetsRepo.get(domainBaby.id);
        if (stored && stored.sessionDataKey === key) {
          if (activeFetchKeyRef.current !== key) return;
          currentStoredTargetIdRef.current = stored.id;
          const synthetic: AIRecommendation = {
            id: `stored_${domainBaby.id}`,
            babyId: domainBaby.id,
            createdAt: new Date().toISOString(),
            type: stored.type,
            payload: stored.payload,
            confidence: 'medium',
          };
          setRecommendation(synthetic);
          setRecommendationLoading(false);
          lastFetchKeyRef.current = key;
          return;
        }
      } catch {
        // Ignore; fall through to refetch
      }

      if (activeFetchKeyRef.current !== key) return;
      setRecommendation(null);
      lastFetchKeyRef.current = key;
      const events = allSessions.map(sessionToSleepEvent);
      getNextNapRecommendation(domainBaby, events, new Date(), memoryStrings.length > 0 ? memoryStrings : undefined)
        .then((rec) => {
          if (activeFetchKeyRef.current !== key) return;
          setRecommendation(rec);
          const napPayload = (rec.type === 'next_nap' || rec.type === 'bedtime') ? (rec.payload as NapRecommendationPayload) : null;
          if (napPayload && (rec.type === 'next_nap' || rec.type === 'bedtime')) {
            storedNapTargetsRepo.insert(domainBaby.id, rec.type as 'next_nap' | 'bedtime', napPayload, key).then((id) => {
              if (activeFetchKeyRef.current === key) currentStoredTargetIdRef.current = id;
            }).catch(() => {});
          }
        })
        .catch(() => {
          if (activeFetchKeyRef.current !== key) return;
          const local = getLocalNapRecommendation(domainBaby, events, new Date());
          setRecommendation(local);
          const napPayload = (local.type === 'next_nap' || local.type === 'bedtime') ? (local.payload as NapRecommendationPayload) : null;
          if (napPayload) {
            storedNapTargetsRepo.insert(domainBaby.id, local.type as 'next_nap' | 'bedtime', napPayload, key).then((id) => {
              if (activeFetchKeyRef.current === key) currentStoredTargetIdRef.current = id;
            }).catch(() => {});
          }
        })
        .finally(() => {
          if (activeFetchKeyRef.current === key) setRecommendationLoading(false);
        });
    };

    loadStoredThenMaybeRefetch();
  }, [domainBaby, activeSession, hasAnyEndedSessions, fetchKey, lastWakeTime, lastEndedSession, memoryStrings, allSessions]);

  const handleRefreshRecommendation = useCallback(() => {
    if (!domainBaby || activeSession) return;
    const key = `${domainBaby.id}:${sessionDataKey}:${memoryStrings.join(',')}`;
    const existingId = currentStoredTargetIdRef.current;
    activeFetchKeyRef.current = null;
    setRecommendationLoading(true);
    lastFetchKeyRef.current = null;
    const events = allSessions.map(sessionToSleepEvent);
    getNextNapRecommendation(domainBaby, events, new Date(), memoryStrings.length > 0 ? memoryStrings : undefined)
      .then((rec) => {
        setRecommendation(rec);
        const napPayload = (rec.type === 'next_nap' || rec.type === 'bedtime') ? (rec.payload as NapRecommendationPayload) : null;
        if (napPayload && (rec.type === 'next_nap' || rec.type === 'bedtime')) {
          if (existingId) {
            return storedNapTargetsRepo.update(existingId, rec.type as 'next_nap' | 'bedtime', napPayload, key);
          }
          return storedNapTargetsRepo.insert(domainBaby.id, rec.type as 'next_nap' | 'bedtime', napPayload, key).then((id) => {
            currentStoredTargetIdRef.current = id;
          });
        }
      })
      .catch(() => {
        const local = getLocalNapRecommendation(domainBaby, events, new Date());
        setRecommendation(local);
        const napPayload = (local.type === 'next_nap' || local.type === 'bedtime') ? (local.payload as NapRecommendationPayload) : null;
        if (napPayload) {
          if (existingId) {
            return storedNapTargetsRepo.update(existingId, local.type as 'next_nap' | 'bedtime', napPayload, key);
          }
          return storedNapTargetsRepo.insert(domainBaby.id, local.type as 'next_nap' | 'bedtime', napPayload, key).then((id) => {
            currentStoredTargetIdRef.current = id;
          });
        }
      })
      .finally(() => setRecommendationLoading(false));
    track('refresh_recommendation', { babyId: domainBaby.id });
  }, [domainBaby, activeSession, sessionDataKey, memoryStrings, allSessions]);

  const isBedtimeRec = recommendation?.type === 'bedtime';
  const napPayload =
    recommendation?.type === 'next_nap' || recommendation?.type === 'bedtime'
      ? (recommendation.payload as NapRecommendationPayload)
      : null;

  const nextNapTimeStr = napPayload
    ? format(new Date(napPayload.startWindowBegin), 'h:mm a')
    : null;

  // Wake window: always use recommendation value when available for consistency
  const displayWakeWindow = napPayload?.recommendedWakeWindowMinutes
    ?? getEffectiveWakeWindowMinutes(ageDays, prefs, new Date().getHours() >= 16);

  // Handlers
  const handleStartNap = async () => {
    if (!currentBabyId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isBedtime = recommendation?.type === 'bedtime';
    track(isBedtime ? 'log_night_start' : 'log_nap_start', { babyId: currentBabyId });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Error', 'Not authenticated'); return; }

      const { data, error } = await supabase
        .from('sleep_sessions')
        .insert({
          baby_id: currentBabyId,
          type: isBedtime ? 'night' : 'nap',
          start_time: new Date().toISOString(),
          logged_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      if (data && domainBaby && !isBedtime) {
        const cap = shouldCapNap(
          domainBaby,
          allSessions.map(sessionToSleepEvent),
          sessionToSleepEvent(data),
          new Date()
        );
        if (cap) {
          scheduleCapReminder(cap.capAt, currentBabyId, data.id);
        }
      }

      await refetchSessions?.();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleEndNap = async () => {
    if (!activeSession) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track('log_nap_end', { babyId: currentBabyId, sessionId: activeSession.id });

    try {
      const now = new Date().toISOString();
      const dur = Math.round(
        (new Date(now).getTime() - new Date(activeSession.start_time).getTime()) / 60000
      );

      const { error } = await supabase
        .from('sleep_sessions')
        .update({ end_time: now, duration_minutes: dur })
        .eq('id', activeSession.id);

      if (error) throw error;
      await refetchSessions?.();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleAddNote = () => {
    if (!currentBabyId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/log-sleep', params: { babyId: currentBabyId } });
  };

  const handleDelay = () => {
    track('delay_recommendation', { babyId: currentBabyId });
    Alert.alert('Delayed', 'Recommendation noted as delayed. We\'ll adjust timing.');
  };

  const handleSkip = () => {
    track('skip_recommendation', { babyId: currentBabyId });
    Alert.alert('Skipped', 'Recommendation skipped. We\'ll factor this in.');
  };

  const handleWhy = () => {
    track('open_coach_from_why', { babyId: currentBabyId });
    router.push({
      pathname: '/(tabs)/coach',
      params: { initialMessage: 'Why this nap time?' },
    });
  };

  const handleSaveSession = async (sessionId: string, updates: any) => {
    const { error } = await supabase.from('sleep_sessions').update(updates).eq('id', sessionId);
    if (error) Alert.alert('Error', error.message);
    setEditSession(null);
    await refetchSessions?.();
  };

  const handleDeleteSession = async (sessionId: string) => {
    const { error } = await supabase.from('sleep_sessions').delete().eq('id', sessionId);
    if (error) Alert.alert('Error', error.message);
    setEditSession(null);
    await refetchSessions?.();
  };

  const handleSwipeDeleteSession = (sessionId: string) => {
    Alert.alert('Delete Session', 'Are you sure you want to delete this sleep session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('sleep_sessions').delete().eq('id', sessionId);
          if (error) Alert.alert('Error', error.message);
          await refetchSessions?.();
        },
      },
    ]);
  };

  // Loading states
  if (babiesLoading || loading) {
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

  if (babies.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
        <EmptyState icon="👶" title="Welcome to Sova" message="Add your little one to start tracking their sleep and get personalized recommendations." actionTitle="Add Baby" onAction={() => router.push('/baby-setup')} />
      </SafeAreaView>
    );
  }

  if (!currentBabyId || !baby) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContainer}><SkeletonCard /></View>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <BabySwitcher currentBabyId={currentBabyId} babies={babies} onBabyChange={(id) => {
              track('switch_baby', { babyId: id });
              setCurrentBabyId(id);
            }} />
            <ProfileAvatarButton />
          </View>
        </View>

        {/* Status & recommendation — one card when user has logged sessions and awake time is reasonable (≤16h) */}
        {showStatusCard && (
          <StatusAndRecommendationCard
            awakeMinutes={activeSession ? 0 : awakeMinutes}
            recommendedWakeWindow={displayWakeWindow}
            nextNapTime={recommendationLoading ? null : nextNapTimeStr}
            nextSleepLabel={isBedtimeRec ? 'Bedtime' : 'Next nap'}
            confidence={recommendation?.confidence ?? 'medium'}
            isAsleep={!!activeSession}
            loading={recommendationLoading}
            napPayload={napPayload}
            isBedtime={isBedtimeRec}
            napsCompletedToday={napCount}
            onStartNap={handleStartNap}
            onDelay={handleDelay}
            onSkip={handleSkip}
            onWhy={handleWhy}
            onRefresh={handleRefreshRecommendation}
          />
        )}

        {/* Active session card */}
        {activeSession && (
          <View style={{ marginTop: Spacing.sm }}>
            <ActiveSessionCard
              sessionId={activeSession.id}
              babyId={currentBabyId}
              startTime={new Date(activeSession.start_time)}
              type={activeSession.type as 'nap' | 'night'}
              capSuggestion={
                domainBaby && activeSession.type === 'nap'
                  ? getSuggestedNapCap(
                      domainBaby,
                      allSessions.map(sessionToSleepEvent),
                      sessionToSleepEvent(activeSession),
                      new Date()
                    )
                  : null
              }
            />
          </View>
        )}

        {/* Empty state when no sleep data yet (status card is hidden in that case) */}
        {!activeSession && !hasAnyEndedSessions && (
          <Card style={styles.recommendationEmptyCard} padding="lg">
            <EmptyState
              icon="😴"
              title="No sleep data yet"
              message="Log your first sleep session to get personalized nap and bedtime recommendations."
              actionTitle="Log first sleep session"
              onAction={handleStartNap}
            />
          </Card>
        )}
        {/* Last night — section title + score card */}
        {lastNightScore != null && (
          <View style={styles.lastNightSection}>
            <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.sm, paddingHorizontal: Spacing.md }]}>
              Last night
            </Text>
            <NightSleepScoreCard result={lastNightScore} trendData={nightScoreTrendData} />
          </View>
        )}

        {/* Quick Log buttons */}
        {/* <QuickLogRow
          hasActiveNap={!!activeSession}
          onStartNap={handleStartNap}
          onEndNap={handleEndNap}
          onAddNote={handleAddNote}
        /> */}

        {/* Caregiver indicator */}
        

        {/* Summary stats — one line */}
        <View style={styles.section}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
            {`Today's Summary`}
          </Text>
          <View style={styles.summaryStats}>
            <Text style={[styles.summaryStat, { color: colors.text }]}>
              <Text style={styles.summaryEmoji}>☀️</Text> {napCount} {napCount === 1 ? 'Nap' : 'Naps'}
            </Text>
            <Text style={[Typography.caption, { color: colors.textTertiary }]}> · </Text>
            <Text style={[styles.summaryStat, { color: colors.text }]} numberOfLines={1}>
              <Text style={styles.summaryEmoji}>⏱</Text> {formatDuration(totalNapMinutes)} total
            </Text>
            <Text style={[Typography.caption, { color: colors.textTertiary }]}> · </Text>
            <Text style={[styles.summaryStat, { color: colors.text }]}>
              <Text style={styles.summaryEmoji}>🌙</Text> {nightCount} Night
            </Text>
          </View>
        </View>

        {/* Day Timeline: Today's Sessions */}
        <View style={styles.section}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>
            {`Today's Sessions`}
          </Text>
          {todaySessions.length === 0 ? (
            <Card padding="lg">
              <View style={styles.emptySessions}>
                <Text style={styles.emptyEmoji}>😴</Text>
                <Text style={[Typography.bodyMedium, { color: colors.textSecondary, textAlign: 'center' }]}>
                  No sleep sessions logged yet today
                </Text>
                <Text style={[Typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: Spacing.xs }]}>
                  Use the quick actions above to get started
                </Text>
              </View>
            </Card>
          ) : (
            todaySessions.map((session, index) => {
              const loggedByCaregiver = caregivers.find((c) => c.id === session.logged_by) ?? null;
              return (
                <SwipeableSessionCard
                  key={session.id}
                  session={session}
                  onPress={() => {
                    if (!currentBabyId) return;
                    router.push({ pathname: '/log-sleep', params: { babyId: currentBabyId, sessionId: session.id } });
                  }}
                  onDelete={handleSwipeDeleteSession}
                  isLast={index === todaySessions.length - 1}
                  loggedByCaregiver={loggedByCaregiver ?? undefined}
                />
              );
            })
          )}
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>

      <SessionEditModal
        visible={!!editSession}
        session={editSession}
        caregivers={caregivers}
        onClose={() => setEditSession(null)}
        onSave={handleSaveSession}
        onDelete={handleDeleteSession}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1426' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.lg },
  loadingContainer: { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  lastNightSection: {
    paddingTop: Spacing.lg,
  },
  recommendationEmptyCard: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  summaryStat: {
    ...Typography.bodyMedium,
    fontSize: 14,
  },
  summaryEmoji: {
    fontSize: 14,
  },
  emptySessions: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: Spacing.sm,
  },
});
