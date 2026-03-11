import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';

interface QuickLogButtonsProps {
  onStartNap: () => void;
  onEndNap: () => void;
  onStartNight: () => void;
  onEndNight: () => void;
  activeNap: boolean;
  activeNight: boolean;
}

export function QuickLogButtons({
  onStartNap,
  onStartNight,
}: QuickLogButtonsProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  const handleNap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onStartNap();
  };

  const handleNight = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onStartNight();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={handleNap}
        activeOpacity={0.8}
        style={[styles.buttonWrapper, Shadows.md]}
      >
        <LinearGradient
          colors={[...gradients.napSoft]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.button, { borderColor: colors.napColor }]}
        >
          <Text style={styles.emoji}>☀️</Text>
          <Text style={[Typography.bodySemiBold, { color: colors.text }]}>Start Nap</Text>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            Log a daytime nap
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleNight}
        activeOpacity={0.8}
        style={[styles.buttonWrapper, Shadows.md]}
      >
        <LinearGradient
          colors={[...gradients.nightSoft]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.button, { borderColor: colors.nightColor }]}
        >
          <Text style={styles.emoji}>🌙</Text>
          <Text style={[Typography.bodySemiBold, { color: colors.text }]}>Start Night</Text>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            Log nighttime sleep
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  buttonWrapper: {
    flex: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  button: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  emoji: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
});
