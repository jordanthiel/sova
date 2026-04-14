import { BabySwitcher } from '@/components/baby/BabySwitcher';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { PremiumUpsellCard } from '@/components/premium/PremiumUpsellCard';
import { TrialStatusChip } from '@/components/premium/TrialStatusChip';
import { AiForecastCard } from '@/components/recommendations/AiForecastCard';
import { ActiveSessionCard } from '@/components/sleep/ActiveSessionCard';
import { SessionEditModal } from '@/components/sleep/SessionEditModal';
import { SwipeableSessionCard } from '@/components/sleep/SwipeableSessionCard';
import { NightSleepScoreCard } from '@/components/today/NightSleepScoreCard';
import { StatusAndRecommendationCard } from '@/components/today/StatusAndRecommendationCard';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import { Spacing, Typography } from '@/constants/theme';
import { useAppNow } from '@/contexts/AppClockContext';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { usePremiumGate } from '@/hooks/usePremiumGate';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { useBabies } from '@/hooks/useBabies';
import { useCoachMemories } from '@/hooks/useCoachMemories';
import { useNapLiveActivity } from '@/hooks/useNapLiveActivity';
import { useNightSleepScores } from '@/hooks/useNightSleepScores';
import { useRealtimeCaregivers } from '@/hooks/useRealtimeCaregivers';
import { useRealtimeSleepSessions } from '@/hooks/useRealtimeSleepSessions';
import { useSleepData } from '@/hooks/useSleepData';
import { getAppNow, getAppNowMs } from '@/lib/appClock';
import { loadNotificationConfigForBaby } from '@/lib/notificationSettings';
import type { Database } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { getLocalNapRecommendation, getNextNapRecommendation, getSuggestedNapCap, isNighttimeWake, shouldCapNap } from '@/services/ai/recommendations';
import { track } from '@/services/analytics/track';
import {
  cancelNapWindowBedtimeAndWakeWindowReminders,
  scheduleBedtimeReminder,
  scheduleCapReminder,
  scheduleNapWindowReminder,
  scheduleWakeWindowAlert,
} from '@/services/notifications';
import { requestLiveActivityRefreshForCaregivers } from '@/services/liveActivity';
import { flushOfflineQueue, queueInsert, queueUpdate } from '@/services/offlineSleepQueue';
import { excludedDaysRepo } from '@/services/repositories/excludedDaysRepo';
import { babiesRepo } from '@/services/repositories/babiesRepo';
import { storedNapTargetsRepo } from '@/services/repositories/storedNapTargetsRepo';
import { getTrialDaysRemaining } from '@/services/subscription';
import type {
  AIRecommendation,
  Baby,
  BabyPreferences,
  NapRecommendationPayload,
  NotificationConfig,
  SleepEvent,
} from '@/types/domain';
import { DEFAULT_NOTIFICATION_CONFIG } from '@/types/domain';
import { isPremiumAccessRequiredError } from '@/types/subscription';
import { getExtendedDayBounds, getExtendedDayKey, sessionOverlapsExtendedDay } from '@/utils/dateUtils';
import { formatDuration } from '@/utils/formatTime';
import { getNightSummaries, isNightComplete } from '@/utils/nightSleepScore';
import { calculateAgeDays, getEffectiveWakeWindowMinutes } from '@/utils/wakeWindowCalculator';
import { addMinutes, format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useGlobalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

const DEFAULT_PREFS: BabyPreferences = {
  preferLongerNaps: null,
  preferEarlierBedtime: null,
  strictSchedule: null,
  sleepGoals: [],
  bedtimeType: 'flexible',
  bedtimeTargetTime: null,
  targetNapCount: null,
  lastWakeWindowMinutes: null,
};

function getGreeting(hour: number): { text: string; icon: 'moon.fill' | 'sun.max.fill' } {
  if (hour < 6) return { text: 'Good Night', icon: 'moon.fill' };
  if (hour < 12) return { text: 'Good Morning', icon: 'sun.max.fill' };
  if (hour < 17) return { text: 'Good Afternoon', icon: 'sun.max.fill' };
  if (hour < 21) return { text: 'Good Evening', icon: 'sun.max.fill' };
  return { text: 'Good Night', icon: 'moon.fill' };
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
  const appNow = useAppNow();
  const appClockMinute = Math.floor(appNow.getTime() / 60000);
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
  const [notificationConfig, setNotificationConfig] = useState<NotificationConfig>(DEFAULT_NOTIFICATION_CONFIG);
  const [excludedDateKeys, setExcludedDateKeys] = useState<Set<string>>(new Set());
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const { hasPremiumAccess, showPaywall } = usePremiumGate();
  const { isReady: subscriptionReady, isTrialActive, trialEndsAt } = useSubscription();
  const trialPaywallShownRef = useRef<number | null>(null);
  const trialDaysRemaining = getTrialDaysRemaining(trialEndsAt);
  const shouldShowTrialBanner = isTrialActive && trialDaysRemaining != null && trialDaysRemaining > 0;
  const shouldAutoShowTrialPaywall =
    subscriptionReady &&
    isTrialActive &&
    trialDaysRemaining != null &&
    trialDaysRemaining > 0 &&
    trialDaysRemaining <= 3;

  useEffect(() => {
    if (!currentBabyId) return;
    excludedDaysRepo.getExcludedDateKeys(currentBabyId).then((keys) => setExcludedDateKeys(new Set(keys)));
  }, [currentBabyId]);

  // Load notification preferences (Supabase + AsyncStorage cache; see `notificationSettings`)
  const loadNotificationConfig = useCallback(() => {
    if (!currentBabyId) return;
    loadNotificationConfigForBaby(currentBabyId)
      .then(setNotificationConfig)
      .catch(() => setNotificationConfig(DEFAULT_NOTIFICATION_CONFIG));
  }, [currentBabyId]);

  useEffect(() => {
    loadNotificationConfig();
  }, [loadNotificationConfig]);

  useFocusEffect(
    useCallback(() => {
      loadNotificationConfig();
      if (currentBabyId) {
        babiesRepo.getPreferences(currentBabyId).then(setPreferences);
      }
    }, [loadNotificationConfig, currentBabyId])
  );
  const greeting = useMemo(() => getGreeting(appNow.getHours()), [appClockMinute]);

  const activeSession = allSessions.find((s) => s.end_time === null) || null;

  const { start: todayStart, end: todayEnd } = getExtendedDayBounds(appNow);
  const todaySessions = allSessions.filter((s) => {
    return sessionOverlapsExtendedDay(s.start_time, s.end_time, todayStart, todayEnd);
  });

  const totalNapMinutes = todaySessions
    .filter((s) => s.type === 'nap' && s.duration_minutes)
    .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const napCount = todaySessions.filter((s) => s.type === 'nap').length;
  const nightCount = todaySessions.filter((s) => s.type === 'night').length;
  const currentExtendedDayKey = getExtendedDayKey(appNow);
  const hasStartedNighttimeSession = allSessions.some(
    (s) => s.type === 'night' && getExtendedDayKey(new Date(s.start_time)) === currentExtendedDayKey
  );

  useEffect(() => {
    const endedSessions = allSessions
      .filter((s) => s.end_time !== null)
      .sort((a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime());
    if (endedSessions.length > 0) {
      setLastWakeTime(new Date(endedSessions[0].end_time!));
    }
  }, [allSessions]);

  // Only default to first baby when none selected yet or selected baby is no longer in list (e.g. removed).
  // Do not overwrite a valid selection so switching to a child without logs stays persisted.
  useEffect(() => {
    if (!isHydrated || babiesLoading || babies.length === 0) return;
    const currentValid = currentBabyId && babies.some((b) => b.id === currentBabyId);
    if (currentValid) return;
    setCurrentBabyId(babies[0].id);
  }, [isHydrated, babies, babiesLoading, currentBabyId, setCurrentBabyId]);

  useEffect(() => {
    if (currentBabyId) {
      babiesRepo.getPreferences(currentBabyId).then(setPreferences);
    }
  }, [currentBabyId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await flushOfflineQueue();
    await Promise.all([refetchBabies(), refetchSessions?.()]);
    setRefreshing(false);
    setNightScoreRefreshTrigger((t) => t + 1);
  }, [refetchBabies, refetchSessions]);

  const hasMountedRef = useRef(false);
  const lastTimezoneRef = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      track('view_today', { babyId: currentBabyId });
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (lastTimezoneRef.current != null && lastTimezoneRef.current !== tz) {
        lastTimezoneRef.current = tz;
        refetchSessions?.();
        setNightScoreRefreshTrigger((t) => t + 1);
      } else {
        lastTimezoneRef.current = tz;
      }
      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        return;
      }
      refetchSessions?.();
      if (currentBabyId) {
        excludedDaysRepo.getExcludedDateKeys(currentBabyId).then((keys) => setExcludedDateKeys(new Set(keys)));
      }
    }, [refetchSessions, currentBabyId])
  );

  useEffect(() => {
    if (shouldAutoShowTrialPaywall) return;
    trialPaywallShownRef.current = null;
  }, [shouldAutoShowTrialPaywall]);

  useFocusEffect(
    useCallback(() => {
      if (!shouldAutoShowTrialPaywall || trialDaysRemaining == null) return;
      if (trialPaywallShownRef.current === trialDaysRemaining) return;
      trialPaywallShownRef.current = trialDaysRemaining;
      showPaywall();
    }, [shouldAutoShowTrialPaywall, trialDaysRemaining, showPaywall])
  );

  // Compute derived data
  const ageDays = baby ? calculateAgeDays(baby.birth_date) : 0;
  const prefs = preferences ?? DEFAULT_PREFS;
  const awakeMinutes = lastWakeTime
    ? Math.round((getAppNowMs() - lastWakeTime.getTime()) / 60000)
    : 0;

  const hasAnyEndedSessions = allSessions.some((s) => s.end_time != null);
  const MAX_AWAKE_MINUTES = 16 * 60; // don't show "awake since" if > 16h (stale)
  // When we have an active session, we intentionally show only the live timer card.
  // (Previously we also rendered the "Sleeping" hero above it for nap sessions.)
  const showStatusCard = !activeSession && hasAnyEndedSessions && awakeMinutes <= MAX_AWAKE_MINUTES;

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

  /** Sessions with excluded days removed, for wake window / LLM recommendations only. */
  const eventsForRecommendation = useMemo(
    () =>
      allSessions
        .filter((s) => !excludedDateKeys.has(getExtendedDayKey(new Date(s.start_time))))
        .map(sessionToSleepEvent),
    [allSessions, excludedDateKeys]
  );
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
      const today = getAppNow();
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
  }, [lastNightSummary, nightScoresByDateKey, appClockMinute]);

  const fetchKey = useMemo(
    () => (domainBaby ? `${domainBaby.id}:${sessionDataKey}:${memoryStrings.join(',')}` : null),
    [domainBaby, sessionDataKey, memoryStrings]
  );

  // Load stored target first; only refetch when session data changed or no stored target (target stays static until next rec)
  useEffect(() => {
    if (!hasPremiumAccess) {
      setRecommendation(null);
      setRecommendationLoading(false);
      lastFetchKeyRef.current = null;
      activeFetchKeyRef.current = null;
      currentStoredTargetIdRef.current = null;
      return;
    }
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
      const events = eventsForRecommendation;
      getNextNapRecommendation(domainBaby, events, getAppNow(), memoryStrings.length > 0 ? memoryStrings : undefined)
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
        .catch((error) => {
          if (activeFetchKeyRef.current !== key) return;
          if (isPremiumAccessRequiredError(error)) {
            showPaywall('recommendations');
            return;
          }
          const local = getLocalNapRecommendation(domainBaby, events, getAppNow());
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
  }, [hasPremiumAccess, domainBaby, activeSession, hasAnyEndedSessions, fetchKey, lastWakeTime, lastEndedSession, memoryStrings, allSessions, showPaywall, eventsForRecommendation, appClockMinute]);

  const handleRefreshRecommendation = useCallback(() => {
    if (!domainBaby || activeSession) return;
    if (!hasPremiumAccess) {
      showPaywall('recommendations');
      return;
    }
    const key = `${domainBaby.id}:${sessionDataKey}:${memoryStrings.join(',')}`;
    const existingId = currentStoredTargetIdRef.current;
    activeFetchKeyRef.current = null;
    setRecommendationLoading(true);
    lastFetchKeyRef.current = null;
    const events = eventsForRecommendation;
    void getNextNapRecommendation(domainBaby, events, getAppNow(), memoryStrings.length > 0 ? memoryStrings : undefined)
      .then((rec) => {
        setRecommendation(rec);
        setRecommendationLoading(false);
        const napPayload = (rec.type === 'next_nap' || rec.type === 'bedtime') ? (rec.payload as NapRecommendationPayload) : null;
        if (napPayload && (rec.type === 'next_nap' || rec.type === 'bedtime')) {
          if (existingId) {
            void storedNapTargetsRepo
              .update(existingId, rec.type as 'next_nap' | 'bedtime', napPayload, key)
              .catch(() => {});
          } else {
            void storedNapTargetsRepo
              .insert(domainBaby.id, rec.type as 'next_nap' | 'bedtime', napPayload, key)
              .then((id) => {
                currentStoredTargetIdRef.current = id;
              })
              .catch(() => {});
          }
        }
      })
      .catch((error) => {
        if (isPremiumAccessRequiredError(error)) {
          showPaywall('recommendations');
          setRecommendationLoading(false);
          return;
        }
        const local = getLocalNapRecommendation(domainBaby, events, getAppNow());
        setRecommendation(local);
        setRecommendationLoading(false);
        const napPayload = (local.type === 'next_nap' || local.type === 'bedtime') ? (local.payload as NapRecommendationPayload) : null;
        if (napPayload) {
          if (existingId) {
            void storedNapTargetsRepo
              .update(existingId, local.type as 'next_nap' | 'bedtime', napPayload, key)
              .catch(() => {});
          } else {
            void storedNapTargetsRepo
              .insert(domainBaby.id, local.type as 'next_nap' | 'bedtime', napPayload, key)
              .then((id) => {
                currentStoredTargetIdRef.current = id;
              })
              .catch(() => {});
          }
        }
      });
    track('refresh_recommendation', { babyId: domainBaby.id });
  }, [domainBaby, activeSession, hasPremiumAccess, sessionDataKey, memoryStrings, showPaywall, eventsForRecommendation]);

  const isBedtimeRec = recommendation?.type === 'bedtime';
  const napPayload =
    recommendation?.type === 'next_nap' || recommendation?.type === 'bedtime'
      ? (recommendation.payload as NapRecommendationPayload)
      : null;

  const nextNapTimeStr = napPayload
    ? format(new Date(napPayload.startWindowBegin), 'h:mm a')
    : null;

  // Wake window: while a fetch is in flight, avoid showing the previous recommendation's window (stale).
  const displayWakeWindow = recommendationLoading
    ? getEffectiveWakeWindowMinutes(ageDays, prefs, appNow.getHours() >= 16)
    : napPayload?.recommendedWakeWindowMinutes ??
      getEffectiveWakeWindowMinutes(ageDays, prefs, appNow.getHours() >= 16);

  const napPayloadForStatusCard = recommendationLoading ? null : napPayload;

  // Cap suggestion for active nap (for Live Activity)
  const capSuggestionForLA =
    hasPremiumAccess && domainBaby && activeSession?.type === 'nap'
      ? getSuggestedNapCap(
          domainBaby,
          allSessions.map(sessionToSleepEvent),
          sessionToSleepEvent(activeSession),
          appNow
        )
      : null;
  const capAtIso = capSuggestionForLA?.capAt ?? null;

  useNapLiveActivity({
    activeSession,
    napPayload,
    capAtIso,
    babyName: baby?.name ?? null,
    isBedtime: isBedtimeRec,
  });

  // Deep link from Live Activity action button (Start / Stop / View)
  const handlersRef = useRef<{ start: () => void; end: () => void; view: () => void } | null>(null);
  const pendingLiveActivityActionRef = useRef<string | null>(null);

  // When app cold-starts from a live activity tap, activeSession may not be loaded yet.
  // Process the pending viewSession action once data is available.
  useEffect(() => {
    if (pendingLiveActivityActionRef.current === 'viewSession' && activeSession && currentBabyId) {
      pendingLiveActivityActionRef.current = null;
      router.push({ pathname: '/log-sleep', params: { babyId: currentBabyId, sessionId: activeSession.id } });
    }
  }, [activeSession, currentBabyId]);

  // Schedule or cancel nap window / bedtime / wake window reminders. Always cancel first to avoid double notifications (e.g. nap + bedtime).
  useEffect(() => {
    if (!currentBabyId || activeSession) {
      void cancelNapWindowBedtimeAndWakeWindowReminders();
      return;
    }
    const config = notificationConfig;
    const isBedtime = recommendation?.type === 'bedtime';

    let cancelled = false;
    const run = async () => {
      await cancelNapWindowBedtimeAndWakeWindowReminders();
      if (cancelled || !napPayload) return;
      const windowStart = new Date(napPayload.startWindowBegin);

      if (config.napWindowSoon && !isBedtime) {
        const remindAt = addMinutes(windowStart, -15);
        if (remindAt.getTime() > Date.now()) {
          await scheduleNapWindowReminder(remindAt.toISOString(), currentBabyId);
        }
      }
      if (config.bedtimeReminder && isBedtime) {
        if (windowStart.getTime() > Date.now()) {
          await scheduleBedtimeReminder(napPayload.startWindowBegin, currentBabyId);
        }
      }
      if (
        config.wakeWindowAlert &&
        !isBedtime &&
        lastWakeTime != null &&
        typeof displayWakeWindow === 'number'
      ) {
        const windowEnd = addMinutes(lastWakeTime, displayWakeWindow);
        if (windowEnd.getTime() > Date.now()) {
          await scheduleWakeWindowAlert(windowEnd.toISOString(), currentBabyId);
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [
    currentBabyId,
    activeSession,
    recommendation?.type,
    napPayload?.startWindowBegin,
    notificationConfig.napWindowSoon,
    notificationConfig.bedtimeReminder,
    notificationConfig.wakeWindowAlert,
    lastWakeTime?.getTime(),
    displayWakeWindow,
  ]);

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
          getAppNow()
        );
        if (cap && notificationConfig.capNapReminder) {
          scheduleCapReminder(cap.capAt, currentBabyId, data.id);
        }
      }

      await refetchSessions?.();
      void requestLiveActivityRefreshForCaregivers(currentBabyId, user.id);
    } catch (err: any) {
      const isNetworkError =
        err?.message?.includes('network') ||
        err?.message?.includes('fetch') ||
        err?.code === 'ECONNABORTED' ||
        err?.code === 'NETWORK_ERROR';
      if (isNetworkError) {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (u) {
          await queueInsert(currentBabyId, isBedtime ? 'night' : 'nap', new Date().toISOString(), u.id);
          Alert.alert(
            "You're offline",
            "Sleep session saved locally and will sync when you're back online. You can still use the app — wake window recommendations use local data."
          );
          await refetchSessions?.();
          return;
        }
      }
      Alert.alert('Error', err?.message ?? 'Something went wrong');
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
      const { data: { user } } = await supabase.auth.getUser();
      if (currentBabyId && user) {
        void requestLiveActivityRefreshForCaregivers(currentBabyId, user.id);
      }
    } catch (err: any) {
      const isNetworkError =
        err?.message?.includes('network') ||
        err?.message?.includes('fetch') ||
        err?.code === 'ECONNABORTED' ||
        err?.code === 'NETWORK_ERROR';
      if (isNetworkError) {
        const now = new Date().toISOString();
        const dur = Math.round(
          (new Date(now).getTime() - new Date(activeSession.start_time).getTime()) / 60000
        );
        await queueUpdate(activeSession.id, now, dur);
        Alert.alert(
          "You're offline",
          "Session end saved locally and will sync when you're back online."
        );
        await refetchSessions?.();
      } else {
        Alert.alert('Error', err.message);
      }
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
    if (!hasPremiumAccess) {
      showPaywall('recommendations');
      return;
    }
    track('open_coach_from_why', { babyId: currentBabyId });
    const recommendationSummary =
      napPayload == null
        ? 'Why this recommendation?'
        : [
            isBedtimeRec
              ? `You suggested bedtime between ${format(new Date(napPayload.startWindowBegin), 'h:mm a')} and ${format(new Date(napPayload.startWindowEnd), 'h:mm a')}.`
              : `You suggested next nap between ${format(new Date(napPayload.startWindowBegin), 'h:mm a')} and ${format(new Date(napPayload.startWindowEnd), 'h:mm a')}.`,
            !isBedtimeRec
              ? `Current cap is ${napPayload.shouldCapNap === false ? 'no cap' : `${napPayload.recommendedCapMinutes} minutes`}.`
              : '',
            'Can we adjust this if I prefer something different?'
          ]
            .filter(Boolean)
            .join(' ')
        ;
    router.push({
      pathname: '/(tabs)/coach',
      params: { initialMessage: recommendationSummary },
    });
  };

  const handleSaveSession = async (sessionId: string, updates: any) => {
    const { error } = await supabase.from('sleep_sessions').update(updates).eq('id', sessionId);
    if (error) Alert.alert('Error', error.message);
    setEditSession(null);
    await refetchSessions?.();
    if (!error && currentBabyId) {
      const { data: { user } } = await supabase.auth.getUser();
      void requestLiveActivityRefreshForCaregivers(currentBabyId, user?.id ?? null);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    const { error } = await supabase.from('sleep_sessions').delete().eq('id', sessionId);
    if (error) Alert.alert('Error', error.message);
    setEditSession(null);
    await refetchSessions?.();
    if (!error && currentBabyId) {
      const { data: { user } } = await supabase.auth.getUser();
      void requestLiveActivityRefreshForCaregivers(currentBabyId, user?.id ?? null);
    }
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
          if (!error && currentBabyId) {
            const { data: { user } } = await supabase.auth.getUser();
            void requestLiveActivityRefreshForCaregivers(currentBabyId, user?.id ?? null);
          }
        },
      },
    ]);
  };

  handlersRef.current = {
    start: handleStartNap,
    end: handleEndNap,
    view: () => {
      if (activeSession && currentBabyId) {
        router.push({ pathname: '/log-sleep', params: { babyId: currentBabyId, sessionId: activeSession.id } });
      } else {
        pendingLiveActivityActionRef.current = 'viewSession';
      }
    },
  };

  const searchParams = useGlobalSearchParams<{ action?: string; run?: string }>();
  const liveActionFromParamsRef = useRef(false);

  // Run Live Activity action when we landed here via deep link with params (e.g. cold start from root index)
  useEffect(() => {
    const action = searchParams.action;
    if (action !== 'startNap' && action !== 'endSession' && action !== 'viewSession') return;
    if (liveActionFromParamsRef.current) return;
    liveActionFromParamsRef.current = true;
    router.replace('/(tabs)' as any);
    setTimeout(() => {
      if (action === 'startNap') handlersRef.current?.start();
      else if (action === 'endSession') handlersRef.current?.end();
      else if (action === 'viewSession') handlersRef.current?.view();
    }, 400);
  }, [searchParams.action]);

  useEffect(() => {
    const handleLiveActivityAction = (url: string) => {
      try {
        const parsed = new URL(url);
        const action = parsed.searchParams.get('action');
        const isLiveActivity = action === 'startNap' || action === 'endSession' || action === 'viewSession';

        if (isLiveActivity) {
          router.replace('/(tabs)' as any);
          setTimeout(() => {
            if (action === 'startNap') handlersRef.current?.start();
            else if (action === 'endSession') handlersRef.current?.end();
            else if (action === 'viewSession') handlersRef.current?.view();
          }, 400);
        }
      } catch {
        // ignore
      }
    };
    Linking.getInitialURL().then((url) => {
      if (url) handleLiveActivityAction(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => handleLiveActivityAction(url));
    return () => sub.remove();
  }, []);

  // Loading states
  if (babiesLoading || loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
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
        <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
        <EmptyState icon="figure.child" title="Welcome to Sova" message="Add your little one to start tracking their sleep and get personalized recommendations." actionTitle="Add Baby" onAction={() => router.push('/baby-setup')} />
      </SafeAreaView>
    );
  }

  if (!currentBabyId || !baby) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContainer}><SkeletonCard /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
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
            <View style={styles.headerActions}>
              {shouldShowTrialBanner && trialDaysRemaining != null ? (
                <TrialStatusChip
                  daysRemaining={trialDaysRemaining}
                  onPress={() => showPaywall()}
                />
              ) : null}
              <ProfileAvatarButton />
            </View>
          </View>
        </View>

        {/* Status & recommendation — one card when user has logged sessions and awake time is reasonable (≤16h) */}
        {showStatusCard &&
          (hasPremiumAccess ? (
            <StatusAndRecommendationCard
              key={
                recommendationLoading
                  ? 'rec-loading'
                  : `${napPayload?.startWindowBegin ?? ''}-${napPayload?.startWindowEnd ?? ''}-${(napPayload?.reasoning ?? '').slice(0, 120)}`
              }
              awakeMinutes={activeSession ? 0 : awakeMinutes}
              recommendedWakeWindow={displayWakeWindow}
              nextNapTime={recommendationLoading ? null : nextNapTimeStr}
              nextSleepLabel={
                recommendationLoading ? 'Sleep' : isBedtimeRec ? 'Bedtime' : 'Next nap'
              }
              confidence={recommendation?.confidence ?? 'medium'}
              isAsleep={!!activeSession}
              loading={recommendationLoading}
              napPayload={napPayloadForStatusCard}
              isBedtime={!recommendationLoading && isBedtimeRec}
              napsCompletedToday={napCount}
              onStartNap={handleStartNap}
              onDelay={handleDelay}
              onSkip={handleSkip}
              onWhy={handleWhy}
              onRefresh={handleRefreshRecommendation}
            />
          ) : (
            <PremiumUpsellCard
              feature="recommendations"
              title="Unlock AI sleep recommendations"
              message="Get personalized nap timing, bedtime guidance, and nap-cap suggestions tailored to your baby's day."
            />
          ))}

        {/* Active session card */}
        {activeSession && (
          <View style={{ marginTop: Spacing.sm }}>
            <ActiveSessionCard
              sessionId={activeSession.id}
              babyId={currentBabyId}
              startTime={new Date(activeSession.start_time)}
              type={activeSession.type as 'nap' | 'night'}
              capSuggestion={
                hasPremiumAccess && domainBaby && activeSession.type === 'nap'
                  ? getSuggestedNapCap(
                      domainBaby,
                      allSessions.map(sessionToSleepEvent),
                      sessionToSleepEvent(activeSession),
                      appNow
                    )
                  : null
              }
            />
          </View>
        )}

        {hasStartedNighttimeSession && (
          <View style={styles.section}>
            {hasPremiumAccess ? (
              <AiForecastCard babyId={currentBabyId} />
            ) : (
              <PremiumUpsellCard
                feature="insights"
                compact
                title="Unlock tonight's AI forecast"
                message="See your personalized nighttime outlook, expected wakes, and bedtime guidance."
              />
            )}
          </View>
        )}

        {/* Empty state when no sleep data yet (status card is hidden in that case) */}
        {!activeSession && !hasAnyEndedSessions && (
          <DarkPanel style={styles.recommendationEmptyCard} padding="lg" shadow="sm">
            <EmptyState
              icon="moon.zzz.fill"
              title="No sleep data yet"
              message="Log your first sleep session to get personalized nap and bedtime recommendations."
              actionTitle="Log first sleep session"
              onAction={handleStartNap}
            />
          </DarkPanel>
        )}
        {/* Last night — section title + score card */}
        {lastNightScore != null && (
          <View style={styles.lastNightSection}>
            <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.sm, paddingHorizontal: Spacing.md }]}>
              Last night
            </Text>
            <NightSleepScoreCard result={lastNightScore} />
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
            <View style={styles.summaryStatRow}>
              <IconSymbol name="sun.max.fill" size={14} color={colors.text} />
              <Text style={[styles.summaryStat, { color: colors.text }]}> {napCount} {napCount === 1 ? 'Nap' : 'Naps'}</Text>
            </View>
            <Text style={[Typography.caption, { color: colors.textTertiary }]}> · </Text>
            <View style={styles.summaryStatRow}>
              <IconSymbol name="clock.fill" size={14} color={colors.text} />
              <Text style={[styles.summaryStat, { color: colors.text }]} numberOfLines={1}> {formatDuration(totalNapMinutes)} total</Text>
            </View>
            <Text style={[Typography.caption, { color: colors.textTertiary }]}> · </Text>
            <View style={styles.summaryStatRow}>
              <IconSymbol name="moon.fill" size={14} color={colors.text} />
              <Text style={[styles.summaryStat, { color: colors.text }]}> {nightCount} Night</Text>
            </View>
          </View>
        </View>

        {/* Day Timeline: Today's Sessions */}
        <View style={styles.section}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>
            {`Today's Sessions`}
          </Text>
          {todaySessions.length === 0 ? (
            <DarkPanel padding="lg" shadow="sm">
              <View style={styles.emptySessions}>
                <IconSymbol name="moon.zzz.fill" size={40} color={colors.textSecondary} style={styles.emptyIcon} />
                <Text style={[Typography.bodyMedium, { color: colors.textSecondary, textAlign: 'center' }]}>
                  No sleep sessions logged yet today
                </Text>
                <Text style={[Typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: Spacing.xs }]}>
                  Use the quick actions above to get started
                </Text>
              </View>
            </DarkPanel>
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
  container: { flex: 1, backgroundColor: '#0D0918' },
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
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
  summaryStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emptySessions: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  emptyIcon: {
    marginBottom: Spacing.sm,
  },
});
