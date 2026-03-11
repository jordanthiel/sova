import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Radius, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

export type AvatarProps = {
  name: string;
  size?: number;
  backgroundColor?: string;
  textColor?: string;
  style?: ViewStyle;
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function Avatar({ name, size = 40, backgroundColor, textColor, style }: AvatarProps) {
  const colors = useThemeColors();
  const initials = getInitials(name || '?');
  const fontSize = size * 0.4;

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: backgroundColor || colors.accentSoft,
        },
        style,
      ]}
    >
      <Text
        style={[
          {
            fontSize,
            fontWeight: Typography.bodySemiBold.fontWeight,
            color: textColor || colors.accent,
          },
        ]}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
