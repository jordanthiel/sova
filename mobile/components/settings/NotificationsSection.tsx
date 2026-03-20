import { View, Text, StyleSheet, Switch } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { useThemeColors } from '@/hooks/use-theme-color';
import { track } from '@/services/analytics/track';
import type { NotificationConfig } from '@/types/domain';

interface NotificationsSectionProps {
  config: NotificationConfig;
  onUpdate: (patch: Partial<NotificationConfig>) => void;
}

const NOTIFICATION_OPTIONS: Array<{
  key: keyof NotificationConfig;
  label: string;
  description: string;
}> = [
  {
    key: 'napWindowSoon',
    label: 'Nap window soon',
    description: 'Alert when the recommended nap time is approaching',
  },
  {
    key: 'capNapReminder',
    label: 'Cap nap reminder',
    description: 'Remind to wake baby when nap cap is reached',
  },
  {
    key: 'bedtimeReminder',
    label: 'Bedtime reminder',
    description: 'Remind when it\'s time to start the bedtime routine',
  },
  {
    key: 'wakeWindowAlert',
    label: 'Wake window alert',
    description: 'Alert when the wake window is being exceeded',
  },
];

export function NotificationsSection({
  config,
  onUpdate,
}: NotificationsSectionProps) {
  const colors = useThemeColors();

  const handleToggle = (key: keyof NotificationConfig, value: boolean) => {
    track('toggle_notification', { key, value });
    onUpdate({ [key]: value });
  };

  return (
    <View>
      <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>
        Notifications
      </Text>

      {NOTIFICATION_OPTIONS.map(({ key, label, description }) => (
        <DarkPanel key={key} padding="md" style={styles.card} shadow="sm">
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                {label}
              </Text>
              <Text style={[Typography.small, { color: colors.textTertiary }]}>
                {description}
              </Text>
            </View>
            <Switch
              value={config[key]}
              onValueChange={(val) => handleToggle(key, val)}
              trackColor={{
                false: 'rgba(255, 255, 255, 0.1)',
                true: Colors.dark.accentSoft,
              }}
              thumbColor={config[key] ? colors.accent : '#5E7389'}
            />
          </View>
        </DarkPanel>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  info: {
    flex: 1,
    gap: 2,
  },
});
