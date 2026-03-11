import { View, Text, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import type { Insight } from '@/types/domain';

interface InsightCardProps {
  insight: Insight;
}

export function InsightCard({ insight }: InsightCardProps) {
  const colors = useThemeColors();

  return (
    <Card style={styles.card} padding="md">
      <View style={styles.header}>
        <Text style={{ fontSize: 20 }}>💡</Text>
        <Text style={[Typography.bodySemiBold, { color: colors.text, flex: 1 }]}>
          {insight.title}
        </Text>
      </View>
      <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
        {insight.description}
      </Text>
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
});
