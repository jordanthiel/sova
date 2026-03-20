import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useCoachMemories } from '@/hooks/useCoachMemories';

interface CoachMemoriesSectionProps {
  babyId: string | null;
}

export function CoachMemoriesSection({ babyId }: CoachMemoriesSectionProps) {
  const colors = useThemeColors();
  const { memories, loading, removeMemory } = useCoachMemories(babyId);

  if (!babyId) return null;

  return (
    <View>
      <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>
        Coach memories
      </Text>
      <Text style={[Typography.small, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
        Preferences and context saved from coach conversations. These are used to personalize recommendations. Remove any you no longer want.
      </Text>
      {loading ? (
        <DarkPanel padding="md" style={styles.card} shadow="sm">
          <Text style={[Typography.small, { color: colors.textTertiary }]}>Loading…</Text>
        </DarkPanel>
      ) : memories.length === 0 ? (
        <DarkPanel padding="md" style={styles.card} shadow="sm">
          <Text style={[Typography.small, { color: colors.textTertiary }]}>
            No memories yet. Chat with the coach and choose to save suggested memories when they appear.
          </Text>
        </DarkPanel>
      ) : (
        memories.map((m) => (
          <DarkPanel key={m.id} padding="md" style={styles.card} shadow="sm">
            <View style={styles.memoryRow}>
              <Text style={[Typography.body, { color: colors.text, flex: 1 }]}>{m.content}</Text>
              <TouchableOpacity
                onPress={() => removeMemory(m.id)}
                style={styles.removeButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[Typography.captionMedium, { color: colors.accent }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </DarkPanel>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.sm,
  },
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  removeButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
});
