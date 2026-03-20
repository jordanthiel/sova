import { StyleSheet, Text, TouchableOpacity, ActivityIndicator, View, type ViewStyle, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing, Typography, Shadows } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  fullWidth?: boolean;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  fullWidth = false,
}: ButtonProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const getContainerStyle = (): ViewStyle => {
    const base: ViewStyle = {
      borderRadius: size === 'sm' ? Radius.sm : Radius.xl,
      paddingHorizontal: size === 'sm' ? Spacing.md : size === 'lg' ? Spacing.xl : Spacing.lg,
      paddingVertical: size === 'sm' ? Spacing.sm : size === 'lg' ? 14 : 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: Spacing.sm,
    };

    switch (variant) {
      case 'primary':
        return {
          ...base,
          backgroundColor: disabled ? colors.accentSoft : colors.accent,
          borderWidth: 1,
          borderColor: disabled ? colors.borderLight : colors.border,
        };
      case 'secondary':
        return { ...base, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.border };
      case 'ghost':
        return { ...base, backgroundColor: 'transparent' };
      case 'danger':
        return { ...base, backgroundColor: disabled ? 'rgba(252, 129, 129, 0.3)' : colors.error };
      case 'gradient':
        return { ...base, backgroundColor: 'transparent', overflow: 'hidden' as const };
      default:
        return base;
    }
  };

  const getTextStyle = (): TextStyle => {
    const base = size === 'sm' ? Typography.buttonSmall : Typography.button;

    switch (variant) {
      case 'primary':
        return { ...base, color: colors.background };
      case 'secondary':
        return { ...base, color: colors.accent };
      case 'ghost':
        return { ...base, color: colors.accent };
      case 'danger':
        return { ...base, color: '#FFFFFF' };
      case 'gradient':
        return { ...base, color: '#FFFFFF' };
      default:
        return { ...base, color: '#FFFFFF' };
    }
  };

  if ((variant === 'primary' || variant === 'gradient') && !disabled) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        disabled={disabled || loading}
        style={[fullWidth && styles.fullWidth, { borderRadius: Radius.xl, overflow: 'hidden' }, style]}
      >
        <LinearGradient
          colors={[...gradients.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.2 }}
          style={[getContainerStyle(), fullWidth && styles.fullWidth]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <>
              {icon}
              <Text style={getTextStyle()}>{title}</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      disabled={disabled || loading}
      style={[getContainerStyle(), fullWidth && styles.fullWidth, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? colors.background : variant === 'danger' ? '#FFF' : colors.accent} />
      ) : (
        <>
          {icon}
          <Text style={getTextStyle()}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
});
