import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Shadows, Spacing } from '@/constants/theme';

export type GradientCardProps = ViewProps & {
  colors: readonly [string, string, ...string[]];
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'sm' | 'md' | 'lg' | 'none';
  start?: { x: number; y: number };
  end?: { x: number; y: number };
};

export function GradientCard({
  colors,
  padding = 'md',
  shadow = 'md',
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  style,
  children,
  ...rest
}: GradientCardProps) {
  const paddingValue =
    padding === 'none' ? 0 : padding === 'sm' ? Spacing.sm : padding === 'lg' ? Spacing.lg : Spacing.md;

  const shadowStyle = shadow === 'none' ? {} : shadow === 'lg' ? Shadows.lg : shadow === 'sm' ? Shadows.sm : Shadows.md;

  return (
    <View style={[styles.wrapper, shadowStyle, style]} {...rest}>
      <LinearGradient
        colors={[...colors]}
        start={start}
        end={end}
        style={[styles.gradient, { padding: paddingValue }]}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  gradient: {
    borderRadius: Radius.xl,
  },
});
