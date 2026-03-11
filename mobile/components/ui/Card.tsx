import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Shadows, Spacing } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';

export type CardProps = ViewProps & {
  variant?: 'default' | 'elevated' | 'outlined' | 'glass';
  accentColor?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
};

export function Card({
  style,
  variant = 'glass',
  accentColor,
  padding = 'md',
  children,
  ...rest
}: CardProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  const paddingValue =
    padding === 'none' ? 0 : padding === 'sm' ? Spacing.sm : padding === 'lg' ? Spacing.lg : Spacing.md;

  if (variant === 'glass') {
    return (
      <View
        style={[
          styles.base,
          {
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          },
          accentColor && { borderLeftWidth: 3, borderLeftColor: accentColor },
          style,
        ]}
        {...rest}
      >
        <LinearGradient
          colors={[...gradients.glassLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.glassGradient, { padding: paddingValue }]}
        >
          {children}
        </LinearGradient>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: colors.surface, padding: paddingValue },
        variant === 'elevated' && [{ backgroundColor: colors.surfaceElevated }, Shadows.md],
        variant === 'outlined' && { borderWidth: 1, borderColor: colors.border },
        variant === 'default' && { borderWidth: 1, borderColor: colors.border },
        accentColor && { borderLeftWidth: 3, borderLeftColor: accentColor },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  glassGradient: {
    borderRadius: Radius.lg,
  },
});
