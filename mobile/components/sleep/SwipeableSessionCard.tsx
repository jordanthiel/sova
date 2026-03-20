import { useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Animated } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import { Badge } from '@/components/ui/Badge';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { Avatar } from '@/components/ui/Avatar';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-color';
import { format } from 'date-fns';
import { formatDuration } from '@/utils/formatTime';
import type { Database } from '@/lib/supabase';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

/** Resolved caregiver who logged this session (for avatar + initials). */
export type LoggedByCaregiver = { id: string; name: string };

interface SwipeableSessionCardProps {
  session: SleepSession;
  onPress: () => void;
  onDelete: (sessionId: string) => void;
  isLast?: boolean;
  /** When set, shows avatar with initials for who entered the session. */
  loggedByCaregiver?: LoggedByCaregiver | null;
}

export function SwipeableSessionCard({ session, onPress, onDelete, isLast, loggedByCaregiver }: SwipeableSessionCardProps) {
  const colors = useThemeColors();
  const swipeableRef = useRef<Swipeable>(null);
  const isNap = session.type === 'nap';

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    swipeableRef.current?.close();
    onDelete(session.id);
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const translateX = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [0, 80],
      extrapolate: 'clamp',
    });

    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    return (
      <Animated.View style={[styles.deleteContainer, { opacity, transform: [{ translateX }] }]}>
        <TouchableOpacity
          onPress={handleDelete}
          style={[styles.deleteBtn, { backgroundColor: colors.error }]}
          activeOpacity={0.8}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
      onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
      >
        <DarkPanel
          style={[styles.sessionCard, !isLast && { marginBottom: Spacing.sm }]}
          padding="md"
          shadow="sm"
        >
          <View style={styles.sessionRow}>
            <View style={[styles.sessionIcon, { backgroundColor: isNap ? colors.napColorSoft : colors.nightColorSoft }]}>
              <IconSymbol name={isNap ? 'sun.max.fill' : 'moon.fill'} size={18} color={isNap ? colors.napColor : colors.nightColor} />
            </View>
            <View style={styles.sessionInfo}>
              <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
                {isNap ? 'Nap' : 'Night Sleep'}
              </Text>
              <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                {format(new Date(session.start_time), 'h:mm a')} -{' '}
                {session.end_time ? format(new Date(session.end_time), 'h:mm a') : 'Ongoing'}
              </Text>
              {session.notes && (
                <Text style={[Typography.small, { color: colors.textTertiary, fontStyle: 'italic', marginTop: 2 }]} numberOfLines={1}>
                  {session.notes}
                </Text>
              )}
            </View>
            <View style={styles.sessionRight}>
              {loggedByCaregiver != null && (
                <View style={styles.loggedByWrap}>
                  <Avatar name={loggedByCaregiver.name} size={28} />
                </View>
              )}
              {session.duration_minutes != null && (
                <Badge
                  label={formatDuration(session.duration_minutes)}
                  backgroundColor={isNap ? colors.napColorSoft : colors.nightColorSoft}
                  color={isNap ? colors.napColor : colors.nightColor}
                />
              )}
              <Text style={[Typography.small, { color: colors.textTertiary, marginTop: 4 }]}>
                ← swipe
              </Text>
            </View>
          </View>
        </DarkPanel>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
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
  sessionInfo: { flex: 1, gap: 2 },
  sessionRight: { alignItems: 'flex-end', gap: Spacing.xs },
  loggedByWrap: { marginBottom: 2 },
  deleteContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginBottom: Spacing.sm,
  },
  deleteBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: Radius.lg,
  },
  deleteText: {
    ...Typography.buttonSmall,
    color: '#FFFFFF',
  },
});
