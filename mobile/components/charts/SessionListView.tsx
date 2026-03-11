import { StyleSheet, View, Text } from 'react-native';
import { format, startOfDay, isSameDay } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { formatDuration } from '@/utils/formatTime';
import type { Database } from '@/lib/supabase';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

interface SessionListViewProps {
  sessions: SleepSession[];
}

interface DayGroup {
  date: Date;
  label: string;
  sessions: SleepSession[];
  totalNapMin: number;
  totalNightMin: number;
}

export function SessionListView({ sessions }: SessionListViewProps) {
  const colors = useThemeColors();

  // Group by day
  const groups: DayGroup[] = [];
  const dayMap = new Map<string, SleepSession[]>();

  for (const s of sessions) {
    const dateKey = new Date(s.start_time).toISOString().split('T')[0];
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
    dayMap.get(dateKey)!.push(s);
  }

  // Sort days newest first
  const sortedKeys = Array.from(dayMap.keys()).sort((a, b) => b.localeCompare(a));

  for (const key of sortedKeys) {
    const daySessions = dayMap.get(key)!;
    const date = new Date(key + 'T12:00:00');
    const today = new Date();
    const isToday = isSameDay(date, today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = isSameDay(date, yesterday);

    let label: string;
    if (isToday) label = 'Today';
    else if (isYesterday) label = 'Yesterday';
    else label = format(date, 'EEEE, MMM d');

    const totalNapMin = daySessions
      .filter((s) => s.type === 'nap' && s.duration_minutes)
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const totalNightMin = daySessions
      .filter((s) => s.type === 'night' && s.duration_minutes)
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

    groups.push({ date, label, sessions: daySessions, totalNapMin, totalNightMin });
  }

  if (groups.length === 0) {
    return (
      <Card style={styles.emptyCard} padding="lg">
        <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
          No sessions to display
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      {groups.map((group) => (
        <View key={group.label} style={styles.dayGroup}>
          {/* Day header */}
          <View style={styles.dayHeader}>
            <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{group.label}</Text>
            <View style={styles.dayHeaderRight}>
              {group.totalNapMin > 0 && (
                <Badge
                  label={`☀️ ${formatDuration(group.totalNapMin)}`}
                  backgroundColor={colors.napColorSoft}
                  color={colors.napColor}
                />
              )}
              {group.totalNightMin > 0 && (
                <Badge
                  label={`🌙 ${formatDuration(group.totalNightMin)}`}
                  backgroundColor={colors.nightColorSoft}
                  color={colors.nightColor}
                />
              )}
            </View>
          </View>

          {/* Sessions */}
          {group.sessions.map((session, idx) => {
            const isNap = session.type === 'nap';
            return (
              <Card
                key={session.id}
                style={[styles.sessionCard, idx < group.sessions.length - 1 && { marginBottom: Spacing.xs }]}
                padding="sm"
              >
                <View style={styles.sessionRow}>
                  <View style={[styles.dot, { backgroundColor: isNap ? colors.napColor : colors.nightColor }]} />
                  <View style={styles.sessionInfo}>
                    <Text style={[Typography.caption, { color: colors.text }]}>
                      {isNap ? 'Nap' : 'Night'} · {format(new Date(session.start_time), 'h:mm a')}
                      {session.end_time ? ` – ${format(new Date(session.end_time), 'h:mm a')}` : ' (ongoing)'}
                    </Text>
                    {session.notes && (
                      <Text style={[Typography.small, { color: colors.textTertiary, fontStyle: 'italic' }]} numberOfLines={1}>
                        {session.notes}
                      </Text>
                    )}
                  </View>
                  {session.duration_minutes != null && (
                    <Text style={[Typography.captionMedium, { color: colors.textSecondary }]}>
                      {formatDuration(session.duration_minutes)}
                    </Text>
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
  },
  emptyCard: {
    marginHorizontal: Spacing.md,
  },
  dayGroup: {
    marginBottom: Spacing.md,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  dayHeaderRight: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  sessionCard: {},
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionInfo: {
    flex: 1,
    gap: 1,
  },
});
