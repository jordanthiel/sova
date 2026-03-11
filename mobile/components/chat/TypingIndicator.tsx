import { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Text } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

export function TypingIndicator() {
  const colors = useThemeColors();
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(600 - delay),
        ])
      );

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [
      {
        translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
      },
    ],
  });

  return (
    <View style={styles.container}>
      <Avatar name="SC" size={30} backgroundColor={colors.accentSoft} textColor={colors.accent} />
      <View style={[styles.bubble, { backgroundColor: colors.chatAssistant }]}>
        <Animated.View style={[styles.dot, { backgroundColor: colors.textTertiary }, dotStyle(dot1)]} />
        <Animated.View style={[styles.dot, { backgroundColor: colors.textTertiary }, dotStyle(dot2)]} />
        <Animated.View style={[styles.dot, { backgroundColor: colors.textTertiary }, dotStyle(dot3)]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.lg,
    borderBottomLeftRadius: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
