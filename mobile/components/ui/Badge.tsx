import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

export type BadgeProps = {
  label: string;
  color?: string;
  backgroundColor?: string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
};

export function Badge({ label, color, backgroundColor, size = 'sm', style }: BadgeProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: backgroundColor || colors.accentSoft,
          paddingHorizontal: size === 'sm' ? Spacing.sm : Spacing.md,
          paddingVertical: size === 'sm' ? 2 : Spacing.xs,
        },
        style,
      ]}
    >
      <Text
        style={[
          size === 'sm' ? Typography.small : Typography.captionMedium,
          { color: color || colors.accent },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
});
