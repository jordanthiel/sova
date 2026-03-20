import { StyleSheet, View, Text } from 'react-native';
import { Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { Button } from './Button';
import { IconSymbol, type IconSymbolName } from './icon-symbol';

export type EmptyStateProps = {
  icon: IconSymbolName;
  title: string;
  message: string;
  actionTitle?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, message, actionTitle, onAction }: EmptyStateProps) {
  const colors = useThemeColors();

  return (
    <View style={styles.container}>
      <IconSymbol name={icon} size={56} color={colors.text} style={styles.icon} />
      <Text style={[Typography.h3, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      <Text
        style={[
          Typography.body,
          {
            color: colors.textSecondary,
            textAlign: 'center',
            marginTop: Spacing.sm,
            paddingHorizontal: Spacing.xl,
          },
        ]}
      >
        {message}
      </Text>
      {actionTitle && onAction && (
        <View style={styles.action}>
          <Button title={actionTitle} onPress={onAction} variant="secondary" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  icon: {
    marginBottom: Spacing.md,
  },
  action: {
    marginTop: Spacing.lg,
  },
});
