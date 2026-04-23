import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { getSleepSettings, getAutoSleepType, isNightTime } from '@/lib/sleepSettings';
import type { SleepSettings } from '@/lib/sleepSettings';
import { Spacing, Typography, Radius, Fonts } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { useRealtimeSleepSessions } from '@/hooks/useRealtimeSleepSessions';
import { format, differenceInMinutes } from 'date-fns';
import { formatDuration } from '@/utils/formatTime';
import { requestLiveActivityRefreshForCaregivers } from '@/services/liveActivity';
import { caregiversRepo } from '@/services/repositories/caregiversRepo';
import type { Caregiver } from '@/types/domain';
import { Avatar } from '@/components/ui/Avatar';

// ─── Helpers ──────────────────────────────────────────────────

function timerParts(ms: number): [string, string, string] {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h.toString().padStart(2, '0'), m.toString().padStart(2, '0'), s.toString().padStart(2, '0')];
}

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

function formatDateTimeCompact(date: Date): string {
  if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`;
  return format(date, 'MMM d, h:mm a');
}

/** Expo Router may pass `string | string[]`; DB expects a single id string. */
function coerceRouteParam(v: string | string[] | undefined): string | null {
  if (v == null) return null;
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.length > 0 ? s : null;
}

// ─── Types ────────────────────────────────────────────────────

type Mode = 'idle' | 'live' | 'stopped';

/** Main timer action button (play / stop / resume) inner diameter */
const CIRCLE = 168;
const CIRCLE_ICON_SIZE = 44;
const CIRCLE_ICON_COLOR = '#FFFFFF';

export default function LogSleepScreen() {
  const params = useLocalSearchParams<{
    babyId?: string | string[];
    sessionId?: string | string[];
    startTime?: string | string[];
    endTime?: string | string[];
  }>();
  const babyId = coerceRouteParam(params.babyId);
  const existingSessionId = coerceRouteParam(params.sessionId);

  const pingLiveActivitySync = useCallback(async () => {
    if (!babyId) return;
    const { data: { user } } = await supabase.auth.getUser();
    void requestLiveActivityRefreshForCaregivers(babyId, user?.id ?? null);
  }, [babyId]);
  const paramStartTime = coerceRouteParam(params.startTime);
  const paramEndTime = coerceRouteParam(params.endTime);

  const { sessions: allSessions } = useRealtimeSleepSessions(babyId);
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  // Settings (loaded for nap/night auto-selection only; edit in app Settings)
  const [settings, setSettings] = useState<SleepSettings>({ nightStartHour: 19, nightEndHour: 7 });

  // Core state
  const [mode, setMode] = useState<Mode>('idle');
  const [sessionId, setSessionId] = useState<string | null>(existingSessionId);
  const [type, setType] = useState<'nap' | 'night'>('nap');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  // Times
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [startTimeEdited, setStartTimeEdited] = useState(false);
  const [endTime, setEndTime] = useState<Date | null>(null);

  // Live timer
  const [timerParts3, setTimerParts3] = useState<[string, string, string]>(['00', '00', '00']);

  // Picker
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | 'datetime'>('datetime');
  const [androidPendingDate, setAndroidPendingDate] = useState<Date | null>(null);

  // Caregivers (who did this)
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [loggedByUserId, setLoggedByUserId] = useState<string | null>(null);

  // ── Init ────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const s = await getSleepSettings();
      setSettings(s);
      setType(getAutoSleepType(s));
    })();
  }, []);

  // Load caregivers for baby; when creating new session, default logged-by to current user
  useEffect(() => {
    if (!babyId) {
      setCaregivers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await caregiversRepo.list(babyId);
      if (cancelled) return;
      setCaregivers(list);
      // If we're creating (no session yet) and haven't set logged-by, default to current user
      if (!existingSessionId && !sessionId && list.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user && list.some((c) => c.id === user.id)) {
          setLoggedByUserId(user.id);
        } else if (list.length > 0) {
          setLoggedByUserId(list[0].id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [babyId, existingSessionId, sessionId]);

  // Pre-filled range from Log timeline (add past session) — takes precedence
  useEffect(() => {
    if (!paramStartTime || !paramEndTime) return;
    const start = new Date(paramStartTime);
    const end = new Date(paramEndTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return;
    setStartTime(start);
    setEndTime(end);
    setStartTimeEdited(true);
    setMode('idle');
    setSessionId(null);
    const hour = start.getHours();
    const minute = start.getMinutes();
    const atOrAfter630 = hour > 6 || (hour === 6 && minute >= 30);
    const before530 = hour < 17 || (hour === 17 && minute < 30);
    setType(atOrAfter630 && before530 ? 'nap' : 'night');
  }, [paramStartTime, paramEndTime]);

  useEffect(() => {
    if (paramStartTime && paramEndTime) return;
    if (!existingSessionId || !allSessions.length) return;
    const session = allSessions.find((s) => s.id === existingSessionId);
    if (!session) return;

    setSessionId(session.id);
    setType(session.type as 'nap' | 'night');
    setNotes(session.notes || '');
    setStartTime(new Date(session.start_time));
    setStartTimeEdited(true);
    setLoggedByUserId(session.logged_by);
    if (session.notes) setShowNotes(true);

    if (session.end_time) {
      setEndTime(new Date(session.end_time));
      setMode('stopped');
    } else {
      setEndTime(null);
      setMode('live');
    }
  }, [existingSessionId, allSessions, paramStartTime, paramEndTime]);

  useEffect(() => {
    if (paramStartTime && paramEndTime) return;
    if (existingSessionId || mode !== 'idle') return;
    const active = allSessions.find((s) => !s.end_time);
    if (active) {
      setSessionId(active.id);
      setType(active.type as 'nap' | 'night');
      setNotes(active.notes || '');
      setStartTime(new Date(active.start_time));
      setStartTimeEdited(true);
      setEndTime(null);
      setMode('live');
    }
  }, [allSessions, existingSessionId, mode, paramStartTime, paramEndTime]);

  // ── Timer tick ──────────────────────────────────────────────

  useEffect(() => {
    if (mode !== 'live') return;
    const tick = () => {
      const ms = Date.now() - startTime.getTime();
      setTimerParts3(timerParts(ms));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mode, startTime]);

  const stoppedParts: [string, string, string] = endTime
    ? timerParts(Math.max(0, endTime.getTime() - startTime.getTime()))
    : ['00', '00', '00'];

  const displayParts = mode === 'live' ? timerParts3 : stoppedParts;
  const durationMinutes = endTime ? Math.max(0, differenceInMinutes(endTime, startTime)) : 0;

  // ── Picker ──────────────────────────────────────────────────

  const openPicker = (target: 'start' | 'end') => {
    setAndroidPendingDate(null);
    setPickerTarget(target);
    setPickerMode(Platform.OS === 'ios' ? 'datetime' : 'date');
  };

  const getPickerValue = (): Date => {
    if (androidPendingDate) return androidPendingDate;
    if (pickerTarget === 'start') return startTime;
    if (pickerTarget === 'end') return endTime || new Date();
    return new Date();
  };

  const applyPickerResult = (target: 'start' | 'end', date: Date) => {
    if (target === 'start') {
      setStartTime(date);
      setStartTimeEdited(true);
      setType(isNightTime(date.getHours(), settings) ? 'night' : 'nap');
      if (mode === 'live' && sessionId) {
        supabase
          .from('sleep_sessions')
          .update({ start_time: date.toISOString() })
          .eq('id', sessionId)
          .then(({ error }) => {
            if (!error) void pingLiveActivitySync();
          });
      }
    } else {
      setEndTime(date);
    }
  };

  const onPickerChange = (_e: any, date?: Date) => {
    if (!date || !pickerTarget) {
      if (Platform.OS === 'android') {
        setPickerTarget(null);
        setAndroidPendingDate(null);
      }
      return;
    }
    if (Platform.OS === 'android') {
      if (pickerMode === 'date') {
        setAndroidPendingDate(date);
        setPickerMode('time');
      } else {
        const merged = androidPendingDate ? new Date(androidPendingDate) : new Date(date);
        if (androidPendingDate) {
          merged.setHours(date.getHours(), date.getMinutes(), date.getSeconds());
        }
        applyPickerResult(pickerTarget, merged);
        setPickerTarget(null);
        setAndroidPendingDate(null);
      }
    } else {
      applyPickerResult(pickerTarget, date);
    }
  };

  const closePicker = () => {
    setPickerTarget(null);
    setAndroidPendingDate(null);
  };

  // ── Actions ─────────────────────────────────────────────────

  const handleStart = async () => {
    if (!babyId) {
      Alert.alert('Error', 'No baby selected');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const actualStart = startTimeEdited ? startTime : new Date();
    setStartTime(actualStart);
    setStartTimeEdited(true);

    const { data, error } = await supabase
      .from('sleep_sessions')
      .insert({ baby_id: babyId, logged_by: user.id, type, start_time: actualStart.toISOString() })
      .select('id')
      .single();
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setSessionId(data?.id || null);
    setEndTime(null);
    setMode('live');
    void pingLiveActivitySync();
  };

  const handleStop = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const now = new Date();
    setEndTime(now);
    setMode('stopped');

    if (sessionId) {
      const dur = Math.max(0, differenceInMinutes(now, startTime));
      supabase
        .from('sleep_sessions')
        .update({ end_time: now.toISOString(), duration_minutes: dur, type })
        .eq('id', sessionId)
        .is('end_time', null)
        .then(({ error }) => {
          if (!error) void pingLiveActivitySync();
        });
    }
  };

  const handleResume = () => {
    Alert.alert(
      'Resume Session?',
      'This will remove the end time and continue tracking.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resume',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setEndTime(null);
            setMode('live');
            if (sessionId) {
              supabase
                .from('sleep_sessions')
                .update({ end_time: null, duration_minutes: null })
                .eq('id', sessionId)
                .then(({ error }) => {
                  if (!error) void pingLiveActivitySync();
                });
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (sessionId) {
      if (endTime && endTime <= startTime) {
        Alert.alert('Invalid Times', 'End time must be after start time.');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const dur = endTime ? Math.max(0, differenceInMinutes(endTime, startTime)) : null;
      const updatePayload: Record<string, unknown> = {
        start_time: startTime.toISOString(),
        end_time: endTime?.toISOString() || null,
        duration_minutes: dur,
        type,
        notes: notes.trim() || null,
      };
      if (loggedByUserId != null) updatePayload.logged_by = loggedByUserId;
      const { error } = await supabase
        .from('sleep_sessions')
        .update(updatePayload)
        .eq('id', sessionId);
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      void pingLiveActivitySync();
    } else {
      if (!endTime || endTime <= startTime) {
        Alert.alert('Invalid Times', 'End time must be after start time.');
        return;
      }
      if (!babyId) {
        Alert.alert('Error', 'No baby selected');
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const whoLogged = loggedByUserId ?? user.id;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const dur = differenceInMinutes(endTime, startTime);
      const { error } = await supabase.from('sleep_sessions').insert({
        baby_id: babyId,
        logged_by: whoLogged,
        type,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: dur,
        notes: notes.trim() || null,
      });
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      void pingLiveActivitySync();
    }
    router.back();
  };

  const handleDiscard = () => {
    const targetSessionId = sessionId ?? existingSessionId;
    const title = targetSessionId ? 'Delete Session' : 'Discard';
    Alert.alert(title, 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (targetSessionId) {
            const { error } = await supabase.from('sleep_sessions').delete().eq('id', targetSessionId);
            if (error) {
              Alert.alert('Could not delete', error.message);
              return;
            }
            void pingLiveActivitySync();
          }
          router.back();
        },
      },
    ]);
  };

  const isNap = type === 'nap';
  const grad = isNap ? gradients.nap : gradients.night;
  const showTimer = mode === 'live' || mode === 'stopped';
  const canSave = mode === 'stopped' || (mode === 'idle' && endTime !== null);

  // ── Render ──────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.headerClose}>
          <Text style={[styles.headerCloseText, { color: colors.textSecondary }]}>×</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Log Sleep</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Nap / Night pill toggle */}
        <View style={styles.pillWrap}>
          {(['nap', 'night'] as const).map((t) => {
            const active = type === t;
            const g = t === 'nap' ? gradients.nap : gradients.night;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => {
                  setType(t);
                  if (sessionId) {
                    supabase.from('sleep_sessions').update({ type: t }).eq('id', sessionId).then();
                  }
                }}
                activeOpacity={0.8}
                style={styles.pillOption}
              >
                {active ? (
                  <LinearGradient colors={[...g]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.pillActive}>
                    <IconSymbol name={t === 'nap' ? 'sun.max.fill' : 'moon.fill'} size={14} color={colors.text} />
                    <Text style={styles.pillTextActive}>{t === 'nap' ? 'Nap' : 'Night'}</Text>
                  </LinearGradient>
                ) : (
                  <View style={styles.pillInactive}>
                    <IconSymbol name={t === 'nap' ? 'sun.max.fill' : 'moon.fill'} size={14} color={colors.text} />
                    <Text style={[styles.pillTextInactive, { color: colors.textSecondary }]}>
                      {t === 'nap' ? 'Nap' : 'Night'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Time rows */}
        <TouchableOpacity
          onPress={() => openPicker('start')}
          style={styles.timeRow}
          activeOpacity={0.6}
        >
          <Text style={[styles.timeRowLabel, { color: colors.textSecondary }]}>Start Time</Text>
          <Text style={[styles.timeRowValue, { color: colors.accent }]}>
            {startTimeEdited || mode !== 'idle' ? formatDateTimeCompact(startTime) : 'Set time'}
          </Text>
        </TouchableOpacity>
        <View style={styles.timeRowDivider} />

        {mode !== 'live' && (
          <>
            <TouchableOpacity
              onPress={() => openPicker('end')}
              style={styles.timeRow}
              activeOpacity={0.6}
            >
              <Text style={[styles.timeRowLabel, { color: colors.textSecondary }]}>End Time</Text>
              <Text style={[styles.timeRowValue, { color: colors.accent }]}>
                {endTime ? formatDateTimeCompact(endTime) : 'Set time'}
              </Text>
            </TouchableOpacity>
            <View style={styles.timeRowDivider} />
          </>
        )}

        {/* Duration */}
        {endTime && mode !== 'live' && (
          <View style={styles.timeRow}>
            <Text style={[styles.timeRowLabel, { color: colors.textSecondary }]}>Duration</Text>
            <Text style={[styles.durationBadge, { color: colors.accent }]}>{formatDuration(durationMinutes)}</Text>
          </View>
        )}

        {/* Who did this? */}
        {caregivers.length > 0 && (
          <View style={styles.whoDidSection}>
            <Text style={[Typography.captionMedium, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
              Who did this?
            </Text>
            <View style={styles.caregiverRow}>
              {caregivers.map((c) => {
                const selected = loggedByUserId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setLoggedByUserId(c.id)}
                    style={[
                      styles.caregiverChip,
                      {
                        borderColor: selected ? colors.accent : colors.border,
                        backgroundColor: selected ? colors.accentSoft : 'rgba(255,255,255,0.06)',
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Avatar name={c.name} size={32} />
                    <Text style={[Typography.caption, { color: colors.text, marginTop: 4 }]} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Picker (inline) */}
        {pickerTarget && (
          <View style={styles.pickerWrap}>
            {Platform.OS === 'android' && (
              <Text style={[Typography.caption, { color: colors.textSecondary, marginBottom: 4 }]}>
                {pickerMode === 'date' ? 'Select date' : 'Select time'}
              </Text>
            )}
            <DateTimePicker
              value={getPickerValue()}
              mode={Platform.OS === 'ios' ? 'datetime' : pickerMode}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onPickerChange}
              maximumDate={new Date()}
              themeVariant="dark"
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity onPress={closePicker} style={[styles.pickerDone, { backgroundColor: colors.accent }]}>
                <Text style={[styles.pickerDoneText, { color: colors.background }]}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Timer display */}
        {showTimer && (
          <View style={styles.timerContainer}>
            <View style={styles.timerRow}>
              {[
                { val: displayParts[0], label: 'HOURS' },
                { val: displayParts[1], label: 'MIN' },
                { val: displayParts[2], label: 'SEC' },
              ].map((p, i) => (
                <View key={i} style={styles.timerSegment}>
                  {i > 0 && <Text style={styles.timerColon}>:</Text>}
                  <View style={styles.timerDigitWrap}>
                    <Text style={[styles.timerDigit, { color: colors.text, fontFamily: Fonts?.mono }]}>
                      {p.val}
                    </Text>
                    <Text style={[styles.timerUnit, { color: colors.textTertiary }]}>{p.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Big circle action button */}
        {mode === 'idle' && !endTime && (
          <View style={[styles.circleOuter, { borderColor: `${grad[0]}40` }]}>
            <TouchableOpacity onPress={handleStart} activeOpacity={0.85}>
              <LinearGradient
                colors={[...grad]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.circleGradient}
              >
                <IconSymbol name="play.fill" size={CIRCLE_ICON_SIZE} color={CIRCLE_ICON_COLOR} />
                <Text style={styles.circleLabel}>START</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'live' && (
          <View style={[styles.circleOuter, { borderColor: `${grad[0]}40` }]}>
            <TouchableOpacity onPress={handleStop} activeOpacity={0.85}>
              <LinearGradient
                colors={[...grad]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.circleGradient}
              >
                <IconSymbol name="stop.fill" size={CIRCLE_ICON_SIZE} color={CIRCLE_ICON_COLOR} />
                <Text style={styles.circleLabel}>STOP</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'stopped' && (
          <View style={[styles.circleOuter, { borderColor: `${grad[0]}40` }]}>
            <TouchableOpacity onPress={handleResume} activeOpacity={0.85}>
              <LinearGradient
                colors={[...grad]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.circleGradient}
              >
                <IconSymbol name="play.fill" size={CIRCLE_ICON_SIZE} color={CIRCLE_ICON_COLOR} />
                <Text style={styles.circleLabel}>RESUME</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Secondary actions */}
        <View style={styles.secondaryRow}>
          {(mode === 'live' ||
            mode === 'stopped' ||
            (mode === 'idle' && (sessionId ?? existingSessionId) && endTime)) && (
            <TouchableOpacity onPress={handleDiscard} hitSlop={8}>
              <Text style={[styles.secondaryAction, { color: colors.error }]}>
                {mode === 'live' ? 'Discard' : 'Delete'}
              </Text>
            </TouchableOpacity>
          )}
          {mode === 'idle' && endTime && <View />}
          <TouchableOpacity onPress={() => setShowNotes(!showNotes)} hitSlop={8}>
            <Text style={[styles.secondaryAction, { color: colors.accent }]}>
              {showNotes ? 'Hide Details' : 'Add Details'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Notes */}
        {showNotes && (
          <View style={styles.notesSection}>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="How did baby sleep?"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={300}
            />
          </View>
        )}

        {/* Save button */}
        {canSave && (
          <TouchableOpacity onPress={handleSave} activeOpacity={0.85} style={styles.saveWrap}>
            <LinearGradient
              colors={[...gradients.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtn}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0918' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerCloseText: { fontSize: 28, fontWeight: 300, lineHeight: 28 },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerSpacer: { width: 32 },

  scroll: { flex: 1 },
  scrollContent: { paddingTop: Spacing.sm },

  // Pill toggle
  pillWrap: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 3,
    gap: 3,
  },
  pillOption: { flex: 1 },
  pillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  pillInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  pillTextActive: { fontSize: 13, fontWeight: '500', color: '#FFF' },
  pillTextInactive: { fontSize: 13, fontWeight: '500' },

  // Time rows
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  timeRowDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  timeRowLabel: { fontSize: 15, fontWeight: '500' },
  timeRowValue: { fontSize: 15, fontWeight: '600' },
  durationBadge: { fontSize: 15, fontWeight: '700' },

  whoDidSection: {
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  caregiverRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  caregiverChip: {
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    minWidth: 72,
  },

  // Picker
  pickerWrap: {
    marginHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: Spacing.sm,
    marginTop: 4,
    marginBottom: Spacing.sm,
    alignItems: 'center',
  },
  pickerDone: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    borderRadius: Radius.full,
    marginTop: 4,
  },
  pickerDoneText: { fontSize: 13, fontWeight: '600' },

  // Timer
  timerContainer: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timerSegment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timerDigitWrap: {
    alignItems: 'center',
  },
  timerDigit: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '300',
  },
  timerColon: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '200',
    marginHorizontal: 2,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  timerUnit: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginTop: -2,
  },

  // Circle button
  circleOuter: {
    width: CIRCLE + 20,
    height: CIRCLE + 20,
    borderRadius: (CIRCLE + 20) / 2,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  circleGradient: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  circleIcon: {
    fontSize: 22,
    color: '#FFF',
    marginBottom: 2,
  },
  circleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 1.5,
  },

  // Secondary actions
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  secondaryAction: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Notes
  notesSection: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  notesInput: {
    fontSize: 14,
    lineHeight: 20,
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: 12,
    minHeight: 56,
    textAlignVertical: 'top',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    color: '#E8EDF2',
  },

  // Save
  saveWrap: { marginHorizontal: Spacing.md },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: Radius.xl,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#0D0918' },
});
