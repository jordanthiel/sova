import { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { IconSymbolName } from '@/components/ui/icon-symbol';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { formatDuration } from '@/utils/formatTime';
import type { SleepEvent } from '@/types/domain';

interface EventListProps {
  events: SleepEvent[];
  onEventPress: (event: SleepEvent) => void;
  onLongPress?: (event: SleepEvent) => void;
  onDelete?: (event: SleepEvent) => void;
  selectionMode?: boolean;
  selectedEventIds?: Set<string>;
}

const TYPE_CONFIG: Record<'nap' | 'night', { icon: IconSymbolName; label: string; color: string; bg: string }> = {
  nap: { icon: 'sun.max.fill', label: 'Nap', color: '#FFB84D', bg: 'rgba(255, 184, 77, 0.15)' },
  night: { icon: 'moon.fill', label: 'Night Sleep', color: '#5BA3E8', bg: 'rgba(91, 163, 232, 0.15)' },
};

function EventCard({
  event,
  onPress,
  onLongPress,
  onDelete,
  isLast,
  isSelected,
}: {
  event: SleepEvent;
  onPress: () => void;
  onLongPress?: () => void;
  onDelete?: () => void;
  isLast: boolean;
  isSelected?: boolean;
}) {
  const colors = useThemeColors();
  const swipeableRef = useRef<Swipeable>(null);
  const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.nap;
  const isActive = !event.end;

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (!onDelete) return null;
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
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            swipeableRef.current?.close();
            onDelete();
          }}
          style={[styles.deleteBtn, { backgroundColor: colors.error }]}
          activeOpacity={0.8}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const card = (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      delayLongPress={400}
    >
      <Card
        style={[
          styles.eventCard,
          !isLast && { marginBottom: Spacing.sm },
          isActive && styles.activeCard,
          isSelected && styles.selectedCard,
        ]}
        padding="md"
      >
        <View style={styles.row}>
          {isSelected != null && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
          )}
          <View style={[styles.icon, { backgroundColor: config.bg }]}>
            <IconSymbol name={config.icon} size={18} color={config.color} />
          </View>
          <View style={styles.info}>
            <View style={styles.infoHeader}>
              <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
                {config.label}
                {isActive && (
                  <Text style={{ color: colors.accent }}> (Active)</Text>
                )}
              </Text>
            </View>
            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              {format(new Date(event.start), 'h:mm a')}
              {event.end && ` – ${format(new Date(event.end), 'h:mm a')}`}
              {isActive && ' – now'}
            </Text>
            {event.note && (
              <Text
                style={[
                  Typography.small,
                  {
                    color: colors.textTertiary,
                    fontStyle: 'italic',
                    marginTop: 2,
                  },
                ]}
                numberOfLines={1}
              >
                {event.note}
              </Text>
            )}
          </View>
          {event.durationMinutes != null && (
            <Badge
              label={formatDuration(event.durationMinutes)}
              backgroundColor={config.bg}
              color={config.color}
              size="md"
            />
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );

  if (onDelete && isSelected == null) {
    return (
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        friction={2}
        rightThreshold={40}
        onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      >
        {card}
      </Swipeable>
    );
  }
  return card;
}

export function EventList({
  events,
  onEventPress,
  onLongPress,
  onDelete,
  selectionMode = false,
  selectedEventIds = new Set(),
}: EventListProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon="list.clipboard"
        title="No events this day"
        message="Tap the + button to log a sleep event."
      />
    );
  }

  return (
    <View style={styles.container}>
      {events.map((event, index) => (
        <EventCard
          key={event.id}
          event={event}
          onPress={() => onEventPress(event)}
          onLongPress={onLongPress ? () => onLongPress(event) : undefined}
          onDelete={onDelete && !selectionMode ? () => onDelete(event) : undefined}
          isLast={index === events.length - 1}
          isSelected={selectionMode ? selectedEventIds.has(event.id) : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  eventCard: {},
  activeCard: {
    borderColor: 'rgba(78, 205, 196, 0.3)',
    borderWidth: 1,
  },
  selectedCard: {
    borderColor: 'rgba(78, 205, 196, 0.5)',
    borderWidth: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  checkboxSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
  },
  checkmark: {
    color: '#4ECDC4',
    fontSize: 14,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
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
