import { View, type ViewStyle } from 'react-native';
import { Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

export type DividerProps = {
  spacing?: number;
  style?: ViewStyle;
};

export function Divider({ spacing = Spacing.md, style }: DividerProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        {
          height: 1,
          backgroundColor: colors.borderLight,
          marginVertical: spacing,
        },
        style,
      ]}
    />
  );
}
