import { useState, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Radius, Spacing, Typography, Fonts } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

interface SleepTimerProps {
  startTime: Date;
  type: 'nap' | 'night';
}

export function SleepTimer({ startTime, type }: SleepTimerProps) {
  const [duration, setDuration] = useState('00:00:00');
  const colors = useThemeColors();

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const diff = now.getTime() - startTime.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setDuration(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const isNap = type === 'nap';
  const accentColor = isNap ? colors.napColor : colors.nightColor;
  const bgColor = isNap ? colors.napColorSoft : colors.nightColorSoft;
  const emoji = isNap ? '☀️' : '🌙';

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Decorative circle */}
      <View style={[styles.ring, { borderColor: accentColor }]}>
        <View style={[styles.innerRing, { borderColor: accentColor }]}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {isNap ? 'Nap in progress' : 'Night sleep in progress'}
      </Text>

      <Text style={[styles.timer, { color: colors.text, fontFamily: Fonts?.mono }]}>
        {duration}
      </Text>

      <View style={[styles.dot, { backgroundColor: accentColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    borderRadius: Radius.xl,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
  },
  ring: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.8,
    marginBottom: Spacing.md,
  },
  innerRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  emoji: {
    fontSize: 28,
  },
  label: {
    ...Typography.captionMedium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  timer: {
    ...Typography.timer,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: Spacing.sm,
  },
});
