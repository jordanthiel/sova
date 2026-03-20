import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface QuickLogRowProps {
  hasActiveNap: boolean;
  onStartNap: () => void;
  onEndNap: () => void;
  onAddNote: () => void;
}

export function QuickLogRow({
  hasActiveNap,
  onStartNap,
  onEndNap,
  onAddNote,
}: QuickLogRowProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  const handlePress = (action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    action();
  };

  return (
    <View style={styles.container}>
      <Text style={[Typography.captionMedium, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
        Quick Actions
      </Text>
      <View style={styles.row}>
        {hasActiveNap ? (
          <TouchableOpacity
            style={styles.button}
            onPress={() => handlePress(onEndNap)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#F6AD55', '#FF9A3C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <IconSymbol name="stop.fill" size={18} color="#0B1426" />
              <Text style={styles.buttonText}>End Nap</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.button}
            onPress={() => handlePress(onStartNap)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[...gradients.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <IconSymbol name="moon.zzz.fill" size={18} color="#0B1426" />
              <Text style={styles.buttonText}>Start Nap</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={() => handlePress(onAddNote)}
          activeOpacity={0.8}
        >
          <View style={styles.outlineButton}>
            <IconSymbol name="note.text" size={18} color={colors.accent} />
            <Text style={[styles.outlineText, { color: colors.accent }]}>
              Add Note
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  button: {
    flex: 1,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    minHeight: 52,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.xl,
    gap: Spacing.sm,
  },
  buttonText: {
    ...Typography.button,
    color: '#0B1426',
  },
  outlineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(199, 174, 255, 0.3)',
    backgroundColor: 'rgba(199, 174, 255, 0.08)',
    gap: Spacing.sm,
  },
  outlineText: {
    ...Typography.button,
  },
});
