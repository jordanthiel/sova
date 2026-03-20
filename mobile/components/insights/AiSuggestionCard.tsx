import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/ui/Card';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-color';
import type { AISuggestion } from '@/types/domain';

interface AiSuggestionCardProps {
  suggestion: AISuggestion;
  onApply: (suggestion: AISuggestion) => void;
}

export function AiSuggestionCard({ suggestion, onApply }: AiSuggestionCardProps) {
  const colors = useThemeColors();

  return (
    <Card style={styles.card} padding="md">
      <View style={styles.header}>
        <IconSymbol name="sparkles" size={18} color={colors.text} />
        <Text style={[Typography.bodySemiBold, { color: colors.text, flex: 1 }]}>
          {suggestion.title}
        </Text>
      </View>
      <Text
        style={[
          Typography.body,
          { color: colors.textSecondary, marginTop: Spacing.sm },
        ]}
      >
        {suggestion.description}
      </Text>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => onApply(suggestion)}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={['rgba(199, 174, 255, 0.2)', 'rgba(199, 174, 255, 0.1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.actionGradient}
        >
          <Text style={[Typography.buttonSmall, { color: colors.accent }]}>
            {suggestion.actionLabel}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionBtn: {
    marginTop: Spacing.md,
    alignSelf: 'flex-start',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  actionGradient: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(199, 174, 255, 0.25)',
  },
});
