import { Button } from '@/components/ui/Button';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useAppClock } from '@/contexts/AppClockContext';
import { useThemeColors } from '@/hooks/use-theme-color';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

/** Dev-only: override perceived "now" for recommendations, today bounds, and timers. */
export function AppClockDebugSection() {
  const colors = useThemeColors();
  const { now, isOverridden, persisted, useDeviceTime, setFixedTime, addOffsetMs } = useAppClock();
  const [isoDraft, setIsoDraft] = useState(() => now.toISOString());

  useEffect(() => {
    setIsoDraft(now.toISOString());
  }, [now, persisted.mode, persisted.offsetMs, persisted.fixedAtMs]);

  if (!__DEV__) return null;

  const applyIso = () => {
    const t = Date.parse(isoDraft.trim());
    if (Number.isNaN(t)) return;
    setFixedTime(new Date(t));
  };

  return (
    <View style={styles.section}>
      <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>Debug clock</Text>
      <DarkPanel padding="md" style={styles.panel} shadow="sm">
        <Text style={[Typography.small, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
          Overrides time used for Today, AI requests, wake windows, and the active session timer. Logging to the database still uses the real device time. Clear the override before shipping.
        </Text>
        <Text style={[Typography.bodyMedium, { color: colors.text, marginBottom: Spacing.xs }]}>
          Effective now
        </Text>
        <Text style={[Typography.small, { color: colors.accent, fontFamily: 'monospace', marginBottom: Spacing.sm }]}>
          {format(now, 'yyyy-MM-dd HH:mm:ss')} {isOverridden ? '(override on)' : '(device)'}
        </Text>
        <Text style={[Typography.small, { color: colors.textSecondary, marginBottom: Spacing.xs }]}>
          ISO 8601 (e.g. 2026-04-04T14:30:00)
        </Text>
        <TextInput
          value={isoDraft}
          onChangeText={setIsoDraft}
          placeholder="2026-04-04T14:30:00"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.input,
            { color: colors.text, borderColor: Colors.dark.border, backgroundColor: Colors.dark.surfaceSolid },
          ]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.row}>
          <Button title="Set fixed time" onPress={applyIso} variant="secondary" size="sm" />
          <Button title="Use device time" onPress={useDeviceTime} variant="secondary" size="sm" />
        </View>
        <Text style={[Typography.small, { color: colors.textSecondary, marginTop: Spacing.md, marginBottom: Spacing.xs }]}>
          Offset (simulated time still advances)
        </Text>
        <View style={styles.row}>
          <Button title="-6h" onPress={() => addOffsetMs(-6 * 60 * 60 * 1000)} variant="secondary" size="sm" />
          <Button title="-1h" onPress={() => addOffsetMs(-60 * 60 * 1000)} variant="secondary" size="sm" />
          <Button title="+1h" onPress={() => addOffsetMs(60 * 60 * 1000)} variant="secondary" size="sm" />
          <Button title="+6h" onPress={() => addOffsetMs(6 * 60 * 60 * 1000)} variant="secondary" size="sm" />
        </View>
        <Text style={[Typography.small, { color: colors.textTertiary, marginTop: Spacing.sm }]}>
          Or set EXPO_PUBLIC_APP_CLOCK_ISO in .env (used when no saved override).
        </Text>
      </DarkPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  panel: { marginBottom: Spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
