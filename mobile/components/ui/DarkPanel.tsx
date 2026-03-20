import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius, Shadows, Spacing } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';

export type DarkPanelProps = ViewProps & {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'sm' | 'md';
  tone?: 'base' | 'elevated';
};

export function DarkPanel({
  style,
  padding = 'md',
  shadow = 'sm',
  tone = 'base',
  children,
  ...rest
}: DarkPanelProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  const paddingValue =
    padding === 'none' ? 0 : padding === 'sm' ? Spacing.sm : padding === 'lg' ? Spacing.lg : Spacing.md;

  const shadowStyle = shadow === 'none' ? {} : shadow === 'md' ? Shadows.md : Shadows.sm;
  const gradientColors = tone === 'elevated' ? gradients.glassLight : gradients.cardBackground;

  return (
    <View
      style={[
        styles.wrapper,
        shadowStyle,
        {
          borderColor: colors.border,
        },
        style,
      ]}
      {...rest}
    >
      <LinearGradient
        colors={[...gradientColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { padding: paddingValue }]}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  gradient: {
    borderRadius: Radius.lg,
  },
});
