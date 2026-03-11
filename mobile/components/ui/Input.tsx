import { useState, useRef } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  Text,
  Animated,
  type TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

export type InputProps = TextInputProps & {
  label: string;
  error?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconPress?: () => void;
};

export function Input({
  label,
  error,
  icon,
  rightIcon,
  onRightIconPress,
  value,
  onFocus,
  onBlur,
  style,
  ...rest
}: InputProps) {
  const colors = useThemeColors();
  const [isFocused, setIsFocused] = useState(false);
  const labelAnim = useRef(new Animated.Value(value ? 1 : 0)).current;

  const animateLabel = (toValue: number) => {
    Animated.timing(labelAnim, {
      toValue,
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  const handleFocus = (e: any) => {
    setIsFocused(true);
    animateLabel(1);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    if (!value) animateLabel(0);
    onBlur?.(e);
  };

  const labelTop = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 6],
  });

  const labelSize = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 12],
  });

  const borderColor = error
    ? colors.error
    : isFocused
      ? colors.accent
      : 'rgba(255, 255, 255, 0.08)';

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderColor,
          },
          isFocused && { borderWidth: 2, borderColor: colors.accent },
        ]}
      >
        {icon && <View style={styles.iconLeft}>{icon}</View>}
        <View style={styles.inputWrapper}>
          <Animated.Text
            style={[
              styles.label,
              {
                top: labelTop,
                fontSize: labelSize,
                color: error ? colors.error : isFocused ? colors.accent : colors.textSecondary,
              },
            ]}
          >
            {label}
          </Animated.Text>
          <TextInput
            value={value}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={[
              styles.input,
              {
                color: colors.text,
              },
              style,
            ]}
            placeholderTextColor={colors.textTertiary}
            {...rest}
          />
        </View>
        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress} style={styles.iconRight}>
            {rightIcon}
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    minHeight: 56,
  },
  iconLeft: {
    paddingLeft: Spacing.md,
  },
  inputWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  label: {
    position: 'absolute',
    left: Spacing.md,
    ...Typography.caption,
  },
  input: {
    ...Typography.body,
    paddingTop: 18,
    paddingBottom: 6,
  },
  iconRight: {
    paddingRight: Spacing.md,
  },
  error: {
    ...Typography.caption,
    marginTop: Spacing.xs,
    marginLeft: Spacing.md,
  },
});
