import { useLocalSearchParams, router } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import { useState, useEffect } from 'react';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { Card } from '@/components/ui/Card';
import { SleepScoreRing } from '@/components/ui/SleepScoreRing';
import { formatDuration } from '@/utils/formatTime';
import { getNightSummaries, isNightComplete, computeNightSleepScore } from '@/utils/nightSleepScore';
import { useRealtimeSleepSessions } from '@/hooks/useRealtimeSleepSessions';
import { useNightSleepScores } from '@/hooks/useNightSleepScores';
import type { NightScoreSession } from '@/utils/nightSleepScore';
import { getExtendedDayBounds, sessionOverlapsExtendedDay } from '@/utils/dateUtils';
import { excludedDaysRepo } from '@/services/repositories/excludedDaysRepo';

export default function DayOverviewScreen() {
  const { dateKey, babyId } = useLocalSearchParams<{ dateKey: string; babyId: string }>();
  const colors = useThemeColors();
  const { sessions: allSessions } = useRealtimeSleepSessions(babyId ?? null);

  if (!dateKey || !babyId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Text style={[Typography.body, { color: colors.text }]}>Missing date or baby</Text>
      </SafeAreaView>
    );
  }

  const date = new Date(dateKey + 'T12:00:00');
  const { start: dayStart, end: dayEnd } = getExtendedDayBounds(date);

  const daySessions = (allSessions ?? []).filter((s) => {
    if (s.end_time === null) return false;
    return sessionOverlapsExtendedDay(s.start_time, s.end_time, dayStart, dayEnd);
  });

  const napSessions = daySessions.filter((s) => s.type === 'nap');
  const nightSessions = daySessions.filter((s) => s.type === 'night');
  const totalNapMin = napSessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
  const totalNightMin = nightSessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);

  const nightSummaries = getNightSummaries(
    (allSessions ?? []) as NightScoreSession[],
    { maxNights: 30 }
  );
  const nightForDay = nightSummaries.find((n) => n.dateKey === dateKey);
  const nightScoresByDateKey = useNightSleepScores(
    babyId,
    nightForDay ? [dateKey] : [],
    allSessions ?? []
  );
  const nightScore = nightForDay && isNightComplete(nightForDay)
    ? (nightScoresByDateKey[dateKey] ?? computeNightSleepScore(nightForDay))
    : null;

  const [excluded, setExcluded] = useState(false);
  useEffect(() => {
    if (!babyId) return;
    excludedDaysRepo.isDayExcluded(babyId, dateKey).then(setExcluded);
  }, [babyId, dateKey]);

  const handleToggleExclude = async () => {
    if (!babyId) return;
    const next = await excludedDaysRepo.toggleDayExcluded(babyId, dateKey);
    setExcluded(next);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <Text style={[styles.closeText, { color: colors.textSecondary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[Typography.h3, { color: colors.text }]}>
          {format(date, 'EEEE, MMM d')}
        </Text>
        <View style={styles.closeBtn} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={[Typography.captionMedium, { color: colors.textTertiary, marginBottom: Spacing.sm }]}>
            Day stats (6am–6am)
          </Text>
          <Card padding="lg" style={styles.card}>
            <View style={styles.statRow}>
              <Text style={[Typography.small, { color: colors.textTertiary }]}>Daytime sleep</Text>
              <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                {formatDuration(totalNapMin)}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={[Typography.small, { color: colors.textTertiary }]}>Naps</Text>
              <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                {napSessions.length}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={[Typography.small, { color: colors.textTertiary }]}>Night sleep</Text>
              <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                {totalNightMin > 0 ? formatDuration(totalNightMin) : '—'}
              </Text>
            </View>
            {nightScore != null && (
              <View style={[styles.statRow, { alignItems: 'center' }]}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>Night score</Text>
                <SleepScoreRing score={nightScore} size={44} />
              </View>
            )}
          </Card>
        </View>
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.excludeBtn, excluded && styles.excludeBtnActive]}
            onPress={handleToggleExclude}
            activeOpacity={0.8}
          >
            <Text style={[Typography.captionMedium, { color: excluded ? colors.text : colors.textTertiary }]}>
              {excluded ? '✓ Excluded from recommendations' : 'Exclude this day from recommendations'}
            </Text>
            <Text style={[Typography.small, { color: colors.textTertiary, marginTop: 2 }]}>
              {excluded ? 'Tap to include again' : 'Use for anomaly or travel days'}
            </Text>
          </TouchableOpacity>
        </View>
        {nightForDay && (
          <View style={styles.section}>
            <Text style={[Typography.captionMedium, { color: colors.textTertiary, marginBottom: Spacing.sm }]}>
              Night details
            </Text>
            <Card padding="lg" style={styles.card}>
              <View style={styles.statRow}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>Total sleep</Text>
                <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                  {formatDuration(nightForDay.totalSleepMinutes)}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>Wakeups</Text>
                <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                  {nightForDay.wakeupCount}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>Time awake</Text>
                <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                  {formatDuration(nightForDay.totalAwakeMinutes)}
                </Text>
              </View>
            </Card>
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  closeBtn: { minWidth: 60 },
  closeText: { fontSize: 16 },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.md },
  section: { marginBottom: Spacing.lg },
  card: { borderRadius: Radius.lg },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  excludeBtn: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  excludeBtnActive: {
    borderColor: 'rgba(78, 205, 196, 0.4)',
    backgroundColor: 'rgba(78, 205, 196, 0.08)',
  },
});
