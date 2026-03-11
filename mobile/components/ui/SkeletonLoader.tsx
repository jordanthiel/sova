import { useEffect, useRef } from 'react';
import { Animated, View, type ViewStyle } from 'react-native';
import { Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

export type SkeletonLoaderProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function SkeletonLoader({
  width = '100%',
  height = 16,
  borderRadius = Radius.sm,
  style,
}: SkeletonLoaderProps) {
  const colors = useThemeColors();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.06)',
          padding: 16,
          gap: 12,
        },
        style,
      ]}
    >
      <SkeletonLoader width="60%" height={20} />
      <SkeletonLoader width="100%" height={14} />
      <SkeletonLoader width="80%" height={14} />
    </View>
  );
}
