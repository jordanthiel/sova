import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

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
              <Text style={styles.buttonEmoji}>⏹</Text>
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
              colors={['#4ECDC4', '#3BA8A0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonEmoji}>😴</Text>
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
            <Text style={styles.outlineEmoji}>📝</Text>
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
  buttonEmoji: {
    fontSize: 18,
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
    borderColor: 'rgba(78, 205, 196, 0.3)',
    backgroundColor: 'rgba(78, 205, 196, 0.08)',
    gap: Spacing.sm,
  },
  outlineEmoji: {
    fontSize: 18,
  },
  outlineText: {
    ...Typography.button,
  },
});
