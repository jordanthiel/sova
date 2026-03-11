import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { format } from 'date-fns';

interface RecommendationCardProps {
  recommendation: string;
  createdAt: string;
  onPress?: () => void;
  isLatest?: boolean;
}

export function RecommendationCard({ recommendation, createdAt, onPress, isLatest }: RecommendationCardProps) {
  const colors = useThemeColors();
  const formattedDate = format(new Date(createdAt), 'MMM d, h:mm a');

  const content = (
    <Card
      accentColor={isLatest ? colors.accent : colors.border}
      padding="md"
      style={[styles.card, !isLatest && { opacity: 0.85 }]}
    >
      <View style={styles.header}>
        <Text style={styles.icon}>{isLatest ? '✨' : '💡'}</Text>
        <Text style={[Typography.small, { color: colors.textTertiary }]}>{formattedDate}</Text>
      </View>
      <Text style={[Typography.body, { color: colors.text, lineHeight: 22 }]}>{recommendation}</Text>
    </Card>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  icon: {
    fontSize: 18,
  },
});
