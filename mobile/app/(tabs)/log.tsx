import { BabySwitcher } from '@/components/baby/BabySwitcher';
import { DaySelector } from '@/components/log/DaySelector';
import { EventList } from '@/components/log/EventList';
import { LogDayTimeline } from '@/components/log/LogDayTimeline';
import { LogEventSheet } from '@/components/log/LogEventSheet';
import { WeekSelector } from '@/components/log/WeekSelector';
import { WeekTimelineStrip } from '@/components/log/WeekTimelineStrip';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import { SleepScoreRing } from '@/components/ui/SleepScoreRing';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { useBabies } from '@/hooks/useBabies';
import { useNightSleepScores } from '@/hooks/useNightSleepScores';
import { useRealtimeSleepSessions } from '@/hooks/useRealtimeSleepSessions';
import { supabase } from '@/lib/supabase';
import { requestLiveActivityRefreshForCaregivers } from '@/services/liveActivity';
import { track } from '@/services/analytics/track';
import type { CareEvent } from '@/services/repositories/careEventsRepo';
import { careEventsRepo } from '@/services/repositories/careEventsRepo';
import { eventsRepo } from '@/services/repositories/eventsRepo';
import type { EventLogType, SleepEvent } from '@/types/domain';
import { getExtendedDayBounds, getExtendedDayCalendarDate, getExtendedDayKey } from '@/utils/dateUtils';
import { formatDuration } from '@/utils/formatTime';
import { getNightSummaries } from '@/utils/nightSleepScore';
import { addDays, addWeeks, format, startOfWeek, subDays, subWeeks } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ViewMode = 'list' | 'daily' | 'weekly';

const LIST_DAYS = 14;
const STRIP_INITIAL_WEEKS = 26;
const STRIP_LOAD_MORE_WEEKS = 4;

export default function LogScreen() {
  const { babies, loading: babiesLoading } = useBabies();
  const { currentBabyId, setCurrentBabyId, isHydrated } = useCurrentBaby();
  const [selectedDate, setSelectedDate] = useState(() => getExtendedDayCalendarDate(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [displayWeekStart, setDisplayWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [stripStart, setStripStart] = useState<Date>(() =>
    subWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), STRIP_INITIAL_WEEKS)
  );
  const [stripEnd, setStripEnd] = useState<Date>(() =>
    addDays(addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), STRIP_INITIAL_WEEKS), 6)
  );
  const [events, setEvents] = useState<SleepEvent[]>([]);
  const [careEvents, setCareEvents] = useState<CareEvent[]>([]);
  const [lastNight, setLastNight] = useState<SleepEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [timelineDrawMode, setTimelineDrawMode] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const isInitialLoad = useRef(true);
  const stripRangeRef = useRef({ stripStart, stripEnd });
  stripRangeRef.current = { stripStart, stripEnd };
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const { sessions: allSessions } = useRealtimeSleepSessions(currentBabyId);

  useEffect(() => {
    if (!isHydrated || babiesLoading || babies.length === 0) return;
    const currentValid = currentBabyId && babies.some((b) => b.id === currentBabyId);
    if (currentValid) return;
    setCurrentBabyId(babies[0].id);
  }, [isHydrated, babies, babiesLoading, currentBabyId, setCurrentBabyId]);

  const loadEvents = useCallback(async () => {
    if (!currentBabyId) {
      setLoading(false);
      return;
    }
    // Only show loading skeleton on initial load, not on week/date changes
    if (isInitialLoad.current) {
      setLoading(true);
    }
    try {
      if (viewMode === 'daily') {
        const dayBefore = subDays(selectedDate, 1);
        const dayAfter = addDays(selectedDate, 1);
        const [sleepData, careData, lastNightData] = await Promise.all([
          eventsRepo.listByDateRange(currentBabyId, dayBefore, dayAfter),
          careEventsRepo.listByDateRange(currentBabyId, dayBefore, dayAfter),
          eventsRepo.getLastCompletedNight(currentBabyId),
        ]);
        setEvents(sleepData);
        setCareEvents(careData);
        setLastNight(lastNightData);
      } else if (viewMode === 'list') {
        const end = new Date();
        const start = subDays(end, LIST_DAYS);
        const [sleepData, lastNightData] = await Promise.all([
          eventsRepo.listByDateRange(currentBabyId, start, end),
          eventsRepo.getLastCompletedNight(currentBabyId),
        ]);
        setEvents(sleepData.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()));
        setCareEvents(await careEventsRepo.listByDateRange(currentBabyId, start, end));
        setLastNight(lastNightData);
      } else {
        // Weekly: load strip range (can grow via load-more at edges)
        const { stripStart: sStart, stripEnd: sEnd } = stripRangeRef.current;
        const rangeStart = subDays(sStart, 1);
        const rangeEnd = addDays(sEnd, 8);
        const [sleepData, careData, lastNightData] = await Promise.all([
          eventsRepo.listByDateRangeOverlap(currentBabyId, rangeStart, rangeEnd),
          careEventsRepo.listByDateRange(currentBabyId, rangeStart, rangeEnd),
          eventsRepo.getLastCompletedNight(currentBabyId),
        ]);
        setEvents(sleepData);
        setCareEvents(careData);
        setLastNight(lastNightData);
      }
    } catch (err: any) {
      console.error('Error loading events:', err);
    } finally {
      setLoading(false);
      isInitialLoad.current = false;
    }
  }, [currentBabyId, selectedDate, viewMode, weekStart]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setDisplayWeekStart(weekStart);
  }, [weekStart]);

  useFocusEffect(
    useCallback(() => {
      track('view_log', { babyId: currentBabyId });
      loadEvents();
    }, [loadEvents, currentBabyId])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const loadMorePast = useCallback(async () => {
    if (!currentBabyId || viewMode !== 'weekly') return;
    const newStripStart = subWeeks(stripStart, STRIP_LOAD_MORE_WEEKS);
    const rangeStart = subDays(newStripStart, 1);
    const rangeEnd = addDays(stripStart, 1);
    try {
      const [sleepData, careData] = await Promise.all([
        eventsRepo.listByDateRangeOverlap(currentBabyId, rangeStart, rangeEnd),
        careEventsRepo.listByDateRange(currentBabyId, rangeStart, rangeEnd),
      ]);
      setEvents((prev) => {
        const byId = new Map(prev.map((e) => [e.id, e]));
        sleepData.forEach((e) => byId.set(e.id, e));
        return Array.from(byId.values()).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      });
      setCareEvents((prev) => {
        const byId = new Map(prev.map((e) => [e.id, e]));
        careData.forEach((e) => byId.set(e.id, e));
        return Array.from(byId.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });
      setStripStart(newStripStart);
    } catch (err: any) {
      console.error('Load more past failed:', err);
    }
  }, [currentBabyId, viewMode, stripStart]);

  const loadMoreFuture = useCallback(async () => {
    if (!currentBabyId || viewMode !== 'weekly') return;
    const newStripEnd = addDays(stripEnd, STRIP_LOAD_MORE_WEEKS * 7);
    const rangeStart = subDays(stripEnd, 1);
    const rangeEnd = addDays(newStripEnd, 8);
    try {
      const [sleepData, careData] = await Promise.all([
        eventsRepo.listByDateRangeOverlap(currentBabyId, rangeStart, rangeEnd),
        careEventsRepo.listByDateRange(currentBabyId, rangeStart, rangeEnd),
      ]);
      setEvents((prev) => {
        const byId = new Map(prev.map((e) => [e.id, e]));
        sleepData.forEach((e) => byId.set(e.id, e));
        return Array.from(byId.values()).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      });
      setCareEvents((prev) => {
        const byId = new Map(prev.map((e) => [e.id, e]));
        careData.forEach((e) => byId.set(e.id, e));
        return Array.from(byId.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });
      setStripEnd(newStripEnd);
    } catch (err: any) {
      console.error('Load more future failed:', err);
    }
  }, [currentBabyId, viewMode, stripEnd]);

  const handleEventPress = (event: SleepEvent) => {
    if (!currentBabyId) return;
    router.push({
      pathname: '/log-sleep',
      params: { babyId: currentBabyId, sessionId: event.id },
    });
  };

  const handleDeleteEvent = (event: SleepEvent) => {
    Alert.alert(
      'Delete entry?',
      'This sleep entry will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await eventsRepo.delete(event.id);
              await loadEvents();
              if (currentBabyId) {
                const { data: { user } } = await supabase.auth.getUser();
                void requestLiveActivityRefreshForCaregivers(currentBabyId, user?.id ?? null);
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Could not delete entry.');
            }
          },
        },
      ]
    );
  };

  const handleLongPressEvent = (event: SleepEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedEventIds(new Set([event.id]));
    } else {
      setSelectedEventIds((prev) => {
        const next = new Set(prev);
        if (next.has(event.id)) next.delete(event.id);
        else next.add(event.id);
        return next;
      });
    }
  };

  const handlePressEvent = (event: SleepEvent) => {
    if (isSelectionMode) {
      setSelectedEventIds((prev) => {
        const next = new Set(prev);
        if (next.has(event.id)) next.delete(event.id);
        else next.add(event.id);
        return next;
      });
    } else {
      handleEventPress(event);
    }
  };

  const handleCancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedEventIds(new Set());
  };

  const handleDeleteSelected = () => {
    const ids = Array.from(selectedEventIds);
    if (ids.length === 0) return;
    Alert.alert(
      'Delete entries?',
      `${ids.length} sleep ${ids.length === 1 ? 'entry' : 'entries'} will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const id of ids) {
                await eventsRepo.delete(id);
              }
              await loadEvents();
              handleCancelSelection();
              if (currentBabyId) {
                const { data: { user } } = await supabase.auth.getUser();
                void requestLiveActivityRefreshForCaregivers(currentBabyId, user?.id ?? null);
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Could not delete entries.');
            }
          },
        },
      ]
    );
  };

  const handleLogEvent = async (type: EventLogType, note?: string) => {
    if (!currentBabyId) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (type === 'nap' || type === 'night') {
      track('log_event_manual', { babyId: currentBabyId, type });
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { Alert.alert('Error', 'Not authenticated'); return; }

        const { error: insErr } = await supabase
          .from('sleep_sessions')
          .insert({
            baby_id: currentBabyId,
            type,
            start_time: new Date().toISOString(),
            logged_by: user.id,
          });
        if (insErr) throw insErr;
        void requestLiveActivityRefreshForCaregivers(currentBabyId, user.id);

        await loadEvents();
      } catch (err: any) {
        Alert.alert('Error', err.message);
      }
      return;
    }

    // Care events: feed, diaper, medication, note
    track(type === 'note' ? 'log_note' : 'log_event_manual', { babyId: currentBabyId, type });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Error', 'Not authenticated'); return; }

      await careEventsRepo.create({
        babyId: currentBabyId,
        type: type as 'feed' | 'diaper' | 'medication' | 'note' | 'night_wake',
        timestamp: new Date().toISOString(),
        note: note || undefined,
        createdBy: user.id,
      });

      await loadEvents();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // Extended day (7am–7am) for selected date — used for daily-view stats and care events.
  const { start: dayStartExtended, end: dayEndExtended } = getExtendedDayBounds(selectedDate);
  const dayStartMs = dayStartExtended.getTime();
  const dayEndMs = dayEndExtended.getTime();

  // In daily view, use realtime sessions as the single source of truth for stat totals.
  // This avoids brief mismatches caused by async eventsRepo fetch updates.
  const dailyStatsEvents = useMemo(() => {
    if (viewMode !== 'daily') return [] as SleepEvent[];
    return (allSessions ?? [])
      .map((s) => ({
        id: s.id,
        babyId: s.baby_id,
        type: s.type as 'nap' | 'night',
        start: s.start_time,
        end: s.end_time,
        createdBy: s.logged_by,
        note: s.notes,
        durationMinutes: s.duration_minutes,
      }))
      .filter((e) => {
        const st = new Date(e.start).getTime();
        const et = e.end ? new Date(e.end).getTime() : Date.now();
        return st < dayEndMs && et > dayStartMs;
      });
  }, [viewMode, allSessions, dayStartMs, dayEndMs]);

  // In daily view, use dailyStatsEvents; otherwise use loaded events.
  const eventsForStats =
    viewMode === 'daily'
      ? dailyStatsEvents
      : events;

  // For daily stats, count only the minutes that overlap the selected extended day window.
  const overlapMinutesInSelectedDay = (e: SleepEvent): number => {
    if (!e.end) return 0;
    const st = new Date(e.start).getTime();
    const et = new Date(e.end).getTime();
    const overlapStart = Math.max(st, dayStartMs);
    const overlapEnd = Math.min(et, dayEndMs);
    if (overlapEnd <= overlapStart) return 0;
    return Math.round((overlapEnd - overlapStart) / 60000);
  };

  const completedEvents = eventsForStats.filter((e) => e.end != null);
  const totalSleepMin = completedEvents.reduce(
    (sum, e) => sum + (viewMode === 'daily' ? overlapMinutesInSelectedDay(e) : (e.durationMinutes || 0)),
    0
  );
  const napEvents = completedEvents.filter((e) => e.type === 'nap');
  const nightEvents = completedEvents.filter((e) => e.type === 'night');
  const totalDaytimeSleepMin = napEvents.reduce(
    (sum, e) => sum + (viewMode === 'daily' ? overlapMinutesInSelectedDay(e) : (e.durationMinutes || 0)),
    0
  );
  const totalNightSleepMin = nightEvents.reduce(
    (sum, e) => sum + (viewMode === 'daily' ? overlapMinutesInSelectedDay(e) : (e.durationMinutes || 0)),
    0
  );
  const hasAnomalies = napEvents.some((e) => (e.durationMinutes || 0) > 150);

  // Group events by day for list view (day headers)
  const listEventsByDay = (() => {
    if (viewMode !== 'list') return null;
    const groups: Record<string, SleepEvent[]> = {};
    for (const e of events) {
      const key = format(new Date(e.start), 'yyyy-MM-dd');
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }
    return groups;
  })();

  // List view sections with per-day nap/night totals (for SectionList)
  const listSections = useMemo(() => {
    if (!listEventsByDay) return [];
    return Object.entries(listEventsByDay)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dayKey, dayEvents]) => {
        const totalNapMin = dayEvents
          .filter((e) => e.type === 'nap')
          .reduce((s, e) => s + (e.durationMinutes || 0), 0);
        const totalNightMin = dayEvents
          .filter((e) => e.type === 'night')
          .reduce((s, e) => s + (e.durationMinutes || 0), 0);
        return {
          dayKey,
          dayEvents,
          totalNapMin,
          totalNightMin,
          data: [dayEvents],
        };
      });
  }, [listEventsByDay]);

  // In daily view, care events are filtered to the extended day (7am–7am)
  const displayCareEvents =
    viewMode === 'daily'
      ? careEvents.filter((ce) => {
          const t = new Date(ce.timestamp).getTime();
          return t >= dayStartMs && t < dayEndMs;
        })
      : careEvents;

  // Group events by extended day for weekly view
  const eventsByDay = useMemo(() => {
    if (viewMode !== 'weekly') return {};
    const groups: Record<string, SleepEvent[]> = {};
    for (const e of events) {
      const key = getExtendedDayKey(new Date(e.start));
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }
    return groups;
  }, [viewMode, events]);

  const listEventsByDayKeys = listEventsByDay ? Object.keys(listEventsByDay) : [];
  const weekViewDayKeys = useMemo(() => {
    if (viewMode !== 'weekly') return [];
    const keys: string[] = [];
    let cur = new Date(stripStart);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(stripEnd);
    end.setHours(23, 59, 59, 999);
    while (cur <= end) {
      keys.push(format(cur, 'yyyy-MM-dd'));
      cur = addDays(cur, 1);
    }
    return keys;
  }, [viewMode, stripStart, stripEnd]);
  const nightScoresByDateKey = useNightSleepScores(
    currentBabyId ?? null,
    viewMode === 'list' ? listEventsByDayKeys : viewMode === 'daily' ? [format(selectedDate, 'yyyy-MM-dd')] : weekViewDayKeys,
    allSessions ?? []
  );

  const nightScoreForDisplay = useMemo(() => {
    if (!allSessions?.length) return null;
    if (viewMode === 'list') return null; // no card in list view; score is in section header
    if (viewMode === 'daily') {
      const summaries = getNightSummaries(allSessions, { maxNights: 30 });
      const dateKey = format(selectedDate, 'yyyy-MM-dd');
      const summary = summaries.find((s) => s.dateKey === dateKey);
      const score = nightScoresByDateKey[dateKey] ?? null;
      if (score == null || !summary) return null;
      return {
        score,
        totalSleepMinutes: summary.totalSleepMinutes,
        wakeupCount: summary.wakeupCount,
        totalAwakeMinutes: summary.totalAwakeMinutes,
        dateKey: summary.dateKey,
        label: format(selectedDate, 'EEEE, MMM d'),
      };
    }
    return null;
  }, [allSessions, viewMode, selectedDate, nightScoresByDateKey]);

  if (babiesLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContainer}>
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
        <EmptyState icon="list.clipboard" title="No babies yet" message="Add a baby to start logging sleep events." actionTitle="Add Baby" onAction={() => router.push('/baby-setup')} />
      </SafeAreaView>
    );
  }

  const listHeaderComponent = (
    <>
      <View style={styles.header}>
        <BabySwitcher
          currentBabyId={currentBabyId}
          babies={babies}
          onBabyChange={(id) => {
            track('switch_baby', { babyId: id });
            setCurrentBabyId(id);
          }}
        />
        <ProfileAvatarButton />
      </View>
      <View style={styles.viewModeRow}>
        {(['list', 'daily', 'weekly'] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.viewModeChip, viewMode === mode && styles.viewModeChipActive]}
            onPress={() => {
              track('log_view_mode', { mode });
              setViewMode(mode);
              if (mode === 'weekly') {
                setWeekStart(startOfWeek(selectedDate, { weekStartsOn: 0 }));
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={[Typography.captionMedium, { color: viewMode === mode ? colors.background : colors.textSecondary }]}>
              {mode === 'list' ? 'List' : mode === 'daily' ? 'Daily' : 'Weekly'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {hasAnomalies && (
        <View style={styles.anomalyBanner}>
          <LinearGradient
            colors={['rgba(246, 173, 85, 0.15)', 'rgba(246, 173, 85, 0.05)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.anomalyGradient}
          >
            <IconSymbol name="exclamationmark.triangle.fill" size={16} color={colors.warning} />
            <Text style={[Typography.caption, { color: colors.warning, flex: 1 }]}>
              Unusually long nap detected. This may affect bedtime.
            </Text>
          </LinearGradient>
        </View>
      )}
    </>
  );

  const careEventsFooter = (
    <>
      {displayCareEvents.length > 0 && (
        <View style={styles.careSection}>
          <Text style={[Typography.captionMedium, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
            Other Events
          </Text>
          {displayCareEvents.map((ce) => {
            const iconMap: Record<string, IconSymbolName> = { feed: 'figure.child', diaper: 'figure.child', medication: 'pills.fill', note: 'note.text', night_wake: 'bed.double.fill' };
            return (
              <View key={ce.id} style={styles.careItem}>
                <IconSymbol name={iconMap[ce.type] || 'pin'} size={16} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <Text style={[Typography.captionMedium, { color: colors.text }]}>
                    {ce.type.charAt(0).toUpperCase() + ce.type.slice(1)}
                  </Text>
                  {ce.note ? (
                    <Text style={[Typography.small, { color: colors.textTertiary }]} numberOfLines={1}>
                      {ce.note}
                    </Text>
                  ) : null}
                </View>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>
                  {new Date(ce.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      <View style={{ height: 140 }} />
    </>
  );

  if (viewMode === 'list') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
        {isSelectionMode && (
          <View style={[styles.selectionBar, styles.selectionBarTop, { backgroundColor: colors.surface }]}>
            <TouchableOpacity onPress={handleCancelSelection} style={styles.selectionBarBtn} activeOpacity={0.7}>
              <Text style={[Typography.buttonSmall, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDeleteSelected}
              style={[
                styles.selectionBarBtn,
                styles.selectionBarBtnDelete,
                selectedEventIds.size === 0 && styles.selectionBarBtnDisabled,
              ]}
              activeOpacity={0.7}
              disabled={selectedEventIds.size === 0}
            >
              <Text style={[Typography.buttonSmall, { color: '#FFFFFF' }]}>
                Delete {selectedEventIds.size}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        <SectionList
          sections={listSections}
          keyExtractor={(_, index) => `list-${index}`}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }: { section: (typeof listSections)[0] }) => {
            const nightScore = nightScoresByDateKey[section.dayKey];
            return (
              <View style={styles.listDayHeaderSticky}>
                <Text style={[Typography.captionMedium, styles.listDayHeader, { color: colors.textSecondary }]}>
                  {format(new Date(section.dayKey), 'EEEE, MMM d')}
                </Text>
                <DarkPanel style={styles.dayTotalsCard} padding="sm" shadow="sm">
                  <View style={styles.dayTotalsRow}>
                    {nightScore != null && (
                      <View style={[styles.summaryItem, { alignItems: 'center' }]}>
                        <Text style={[Typography.small, { color: colors.textTertiary }]}>Night score</Text>
                        <SleepScoreRing score={nightScore} size={36} />
                      </View>
                    )}
                    <View style={styles.summaryItem}>
                      <Text style={[Typography.small, { color: colors.textTertiary }]}>Daytime sleep</Text>
                      <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                        {section.totalNapMin > 0 ? formatDuration(section.totalNapMin) : '—'}
                      </Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={[Typography.small, { color: colors.textTertiary }]}>Night</Text>
                      <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                        {section.totalNightMin > 0 ? formatDuration(section.totalNightMin) : '—'}
                      </Text>
                    </View>
                  </View>
                </DarkPanel>
              </View>
            );
          }}
          renderItem={({ item }: { item: SleepEvent[] }) => (
            <View style={[styles.listDayBlock, styles.listDayBlockPadding]}>
              <EventList
                events={item}
                onEventPress={handlePressEvent}
                onLongPress={handleLongPressEvent}
                onDelete={handleDeleteEvent}
                selectionMode={isSelectionMode}
                selectedEventIds={selectedEventIds}
              />
            </View>
          )}
          ListHeaderComponent={listHeaderComponent}
          ListEmptyComponent={
            loading ? (
              <View style={{ padding: Spacing.md }}>
                <SkeletonCard style={{ marginBottom: Spacing.sm }} />
                <SkeletonCard />
              </View>
            ) : (
              <EmptyState icon="list.clipboard" title="No events" message="Logs from the last 14 days will appear here." />
            )
          }
          ListFooterComponent={careEventsFooter}
          contentContainerStyle={listSections.length === 0 ? styles.scrollContent : undefined}
          style={styles.listSectionList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        />
        <LogEventSheet
          visible={showLogSheet}
          onClose={() => setShowLogSheet(false)}
          onSubmit={handleLogEvent}
        />
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
        directionalLockEnabled
        scrollEnabled={!timelineDrawMode}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <BabySwitcher
            currentBabyId={currentBabyId}
            babies={babies}
            onBabyChange={(id) => {
              track('switch_baby', { babyId: id });
              setCurrentBabyId(id);
            }}
          />
          <ProfileAvatarButton />
        </View>

        {/* View mode tabs */}
        <View style={styles.viewModeRow}>
          {(['list', 'daily', 'weekly'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.viewModeChip, viewMode === mode && styles.viewModeChipActive]}
              onPress={() => {
                track('log_view_mode', { mode });
                setViewMode(mode);
                if (mode === 'weekly') {
                  const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
                  setWeekStart(ws);
                  setStripStart(subWeeks(ws, STRIP_INITIAL_WEEKS));
                  setStripEnd(addDays(addWeeks(ws, STRIP_INITIAL_WEEKS), 6));
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={[Typography.captionMedium, { color: viewMode === mode ? colors.background : colors.textSecondary }]}>
                {mode === 'list' ? 'List' : mode === 'daily' ? 'Daily' : 'Weekly'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Selectors */}
        {viewMode === 'daily' && (
          <DaySelector
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            todayAnchor={getExtendedDayCalendarDate(new Date())}
          />
        )}
        {viewMode === 'weekly' && (
          <WeekSelector
            selectedWeekStart={displayWeekStart}
            onWeekChange={(ws) => {
              setWeekStart(ws);
            }}
          />
        )}

        {/* AI anomaly banner */}
        {hasAnomalies && (
          <View style={styles.anomalyBanner}>
            <LinearGradient
              colors={['rgba(246, 173, 85, 0.15)', 'rgba(246, 173, 85, 0.05)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.anomalyGradient}
            >
              <IconSymbol name="exclamationmark.triangle.fill" size={16} color={colors.warning} />
              <Text style={[Typography.caption, { color: colors.warning, flex: 1 }]}>
                Unusually long nap detected. This may affect bedtime.
              </Text>
            </LinearGradient>
          </View>
        )}

        {viewMode === 'daily' && (
          <>
            <TouchableOpacity
              style={styles.summaryRowWrap}
              onPress={() =>
                currentBabyId &&
                router.push({
                  pathname: '/day-overview',
                  params: {
                    dateKey: format(selectedDate, 'yyyy-MM-dd'),
                    babyId: currentBabyId,
                  },
                })
              }
              activeOpacity={0.8}
            >
              <DarkPanel padding="md" shadow="sm" style={styles.summaryPanel}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={[Typography.small, { color: colors.textTertiary }]}>Daytime sleep</Text>
                    <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                      {formatDuration(totalDaytimeSleepMin)}
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[Typography.small, { color: colors.textTertiary }]}>Night sleep</Text>
                    <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                      {totalNightSleepMin > 0 ? formatDuration(totalNightSleepMin) : '—'}
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[Typography.small, { color: colors.textTertiary }]}>Naps</Text>
                    <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                      {napEvents.length}
                    </Text>
                  </View>
                  {nightScoreForDisplay != null && (
                    <View style={[styles.summaryItem, { alignItems: 'center' }]}>
                      <Text style={[Typography.small, { color: colors.textTertiary }]}>Night score</Text>
                      <SleepScoreRing score={nightScoreForDisplay.score} size={40} />
                    </View>
                  )}
                </View>
              </DarkPanel>
            </TouchableOpacity>
            <Text style={[Typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: Spacing.xs }]}>
              Tap for day overview
            </Text>
            {/* {nightScoreForDisplay != null && (
              <View style={{ marginTop: Spacing.sm }}>
                <NightSleepScoreCard result={nightScoreForDisplay} />
              </View>
            )} */}
          </>
        )}

        {/* Sleep event list */}
        {loading ? (
          <View style={{ padding: Spacing.md }}>
            <SkeletonCard style={{ marginBottom: Spacing.sm }} />
            <SkeletonCard />
          </View>
        ) : viewMode === 'daily' ? (
          <LogDayTimeline
            date={selectedDate}
            events={events}
            onEventPress={handleEventPress}
            onAddSleepRange={
              currentBabyId
                ? (start, end) => {
                    router.push({
                      pathname: '/log-sleep',
                      params: {
                        babyId: currentBabyId,
                        startTime: start.toISOString(),
                        endTime: end.toISOString(),
                      },
                    });
                  }
                : undefined
            }
            onDrawModeChange={setTimelineDrawMode}
          />
        ) : viewMode === 'weekly' ? (
          <WeekTimelineStrip
            stripStart={stripStart}
            stripEnd={stripEnd}
            weekStart={weekStart}
            eventsByDay={eventsByDay}
            nightScoresByDayKey={nightScoresByDateKey}
            onEventPress={handleEventPress}
            onVisibleWeekChange={setDisplayWeekStart}
            onLoadMorePast={loadMorePast}
            onLoadMoreFuture={loadMoreFuture}
          />
        ) : null}

        {/* Care events */}
        {displayCareEvents.length > 0 && (
          <View style={styles.careSection}>
            <Text style={[Typography.captionMedium, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
              Other Events
            </Text>
            {displayCareEvents.map((ce) => {
              const iconMap: Record<string, IconSymbolName> = { feed: 'figure.child', diaper: 'figure.child', medication: 'pills.fill', note: 'note.text', night_wake: 'bed.double.fill' };
              return (
                <View key={ce.id} style={styles.careItem}>
                  <IconSymbol name={iconMap[ce.type] || 'pin'} size={16} color={colors.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={[Typography.captionMedium, { color: colors.text }]}>
                      {ce.type.charAt(0).toUpperCase() + ce.type.slice(1)}
                    </Text>
                    {ce.note ? (
                      <Text style={[Typography.small, { color: colors.textTertiary }]} numberOfLines={1}>
                        {ce.note}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[Typography.small, { color: colors.textTertiary }]}>
                    {new Date(ce.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 140 }} />
      </ScrollView>

      <LogEventSheet
        visible={showLogSheet}
        onClose={() => setShowLogSheet(false)}
        onSubmit={handleLogEvent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0918',
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.lg },
  loadingContainer: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    paddingTop: Spacing.sm,
  },
  viewModeRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  viewModeChip: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  viewModeChipActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  listWithHeaders: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  listDayBlock: {
    marginBottom: Spacing.lg,
  },
  listDayHeader: {
    marginBottom: Spacing.sm,
  },
  listDayHeaderSticky: {
    backgroundColor: Colors.dark.background,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  listDayBlockPadding: {
    paddingHorizontal: Spacing.md,
  },
  dayTotalsCard: {
    marginBottom: Spacing.sm,
  },
  dayTotalsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  listSectionList: {
    flex: 1,
  },
  weeklyContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  weeklyDayBlock: {
    marginBottom: Spacing.lg,
  },
  anomalyBanner: {
    marginHorizontal: Spacing.md,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(246, 173, 85, 0.2)',
  },
  anomalyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  summaryRowWrap: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  summaryPanel: {
    borderRadius: Radius.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    gap: 2,
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: Spacing.md,
    borderRadius: Radius.full,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabGradient: {
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
  },
  fabText: {
    ...Typography.button,
    color: '#0D0918',
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  selectionBarTop: {
    flexShrink: 0,
  },
  selectionBarBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  selectionBarBtnDelete: {
    backgroundColor: '#FC8181',
    borderRadius: Radius.full,
  },
  selectionBarBtnDisabled: {
    opacity: 0.5,
  },
  careSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  careItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
});
