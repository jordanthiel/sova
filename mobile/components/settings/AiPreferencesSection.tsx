import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { track } from '@/services/analytics/track';
import { getRecommendedNapCountForAge, getNapTransitionInsight, calculateAgeDays } from '@/utils/wakeWindowCalculator';
import type { BabyPreferences } from '@/types/domain';

interface AiPreferencesSectionProps {
  preferences: BabyPreferences;
  birthdate: string;
  onUpdate: (patch: Partial<BabyPreferences>) => void;
}

function timeTo24h(str: string): string | null {
  const trimmed = str.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = (match[3] || '').toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function format24toDisplay(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function AiPreferencesSection({
  preferences,
  birthdate,
  onUpdate,
}: AiPreferencesSectionProps) {
  const colors = useThemeColors();
  const ageDays = calculateAgeDays(birthdate);
  const napRec = getRecommendedNapCountForAge(ageDays);
  const targetNapCount = preferences.targetNapCount ?? null;
  const effectiveNapCount = targetNapCount ?? napRec.typical;
  const transitionInsight = getNapTransitionInsight(ageDays, effectiveNapCount);

  const bedtimeType = preferences.bedtimeType ?? 'flexible';
  const bedtimeTargetTime = preferences.bedtimeTargetTime ?? null;

  const setBedtimeType = (type: 'target' | 'flexible') => {
    track('change_ai_preference', { key: 'bedtimeType', value: type });
    onUpdate({
      bedtimeType: type,
      bedtimeTargetTime: type === 'flexible' ? null : (preferences.bedtimeTargetTime || '19:30'),
    });
  };

  const setTargetNapCount = (n: number | null) => {
    track('change_ai_preference', { key: 'targetNapCount', value: n });
    onUpdate({ targetNapCount: n });
  };

  const [bedtimeInput, setBedtimeInput] = useState(format24toDisplay(bedtimeTargetTime));
  useEffect(() => {
    setBedtimeInput(format24toDisplay(bedtimeTargetTime));
  }, [bedtimeTargetTime, bedtimeType]);

  return (
    <View>
      <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>
        AI Preferences
      </Text>

      <DarkPanel padding="md" style={styles.card} shadow="sm">
        <TriPreferenceRow
          label="Nap preference"
          leftLabel="Longer naps"
          middleLabel="No preference"
          rightLabel="More frequent"
          value={
            preferences.preferLongerNaps === true
              ? 'left'
              : preferences.preferLongerNaps === false
                ? 'right'
                : 'middle'
          }
          onChange={(v) => {
            const key = 'preferLongerNaps' as const;
            const next = v === 'left' ? true : v === 'right' ? false : null;
            track('change_ai_preference', { key, value: next });
            onUpdate({ preferLongerNaps: next });
          }}
        />
      </DarkPanel>

      <DarkPanel padding="md" style={styles.card} shadow="sm">
        <Text style={[Typography.captionMedium, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
          Bedtime
        </Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleOption, bedtimeType === 'flexible' && styles.toggleOptionActive]}
            onPress={() => setBedtimeType('flexible')}
            activeOpacity={0.7}
          >
            <Text style={[Typography.captionMedium, { color: bedtimeType === 'flexible' ? '#0B1426' : colors.textSecondary }]}>
              Flexible
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleOption, bedtimeType === 'target' && styles.toggleOptionActive]}
            onPress={() => setBedtimeType('target')}
            activeOpacity={0.7}
          >
            <Text style={[Typography.captionMedium, { color: bedtimeType === 'target' ? '#0B1426' : colors.textSecondary }]}>
              Target time
            </Text>
          </TouchableOpacity>
        </View>
        {bedtimeType === 'target' && (
          <TextInput
            style={[styles.timeInput, { color: colors.text, borderColor: colors.border }]}
            placeholder="e.g. 7:30 PM"
            placeholderTextColor={colors.textTertiary}
            value={bedtimeInput}
            onChangeText={setBedtimeInput}
            onBlur={() => {
              const t = timeTo24h(bedtimeInput);
              if (t !== null) onUpdate({ bedtimeTargetTime: t });
            }}
          />
        )}
      </DarkPanel>

      <DarkPanel padding="md" style={styles.card} shadow="sm">
        <Text style={[Typography.captionMedium, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
          Number of naps
        </Text>
        <Text style={[Typography.small, { color: colors.textTertiary, marginBottom: Spacing.sm }]}>
          For this age we recommend {napRec.min}–{napRec.max} naps (typically {napRec.typical}). You can override below.
        </Text>
        <View style={styles.napRow}>
          {[null, 1, 2, 3, 4].map((n) => {
            const isActive = n === null
              ? targetNapCount === null
              : (targetNapCount ?? napRec.typical) === n;
            return (
              <TouchableOpacity
                key={n ?? 'rec'}
                style={[styles.napChip, isActive && styles.napChipActive]}
                onPress={() => setTargetNapCount(n)}
                activeOpacity={0.7}
              >
                <Text style={[Typography.captionMedium, { color: isActive ? '#0B1426' : colors.textSecondary }]}>
                  {n === null ? 'Use recommendation' : `${n}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {transitionInsight ? (
          <View style={styles.insightRow}>
            <IconSymbol name="lightbulb.fill" size={14} color={colors.accent} style={styles.insightIcon} />
            <Text style={[Typography.small, { color: colors.accent, flex: 1 }]}>
              {transitionInsight}
            </Text>
          </View>
        ) : null}
      </DarkPanel>

      {preferences.lastWakeWindowMinutes != null ? (
        <DarkPanel padding="md" style={styles.card} shadow="sm">
          <View style={styles.lastWakeRow}>
            <View>
              <Text style={[Typography.captionMedium, { color: colors.textSecondary }]}>
                Last wake window before bed
              </Text>
              <Text style={[Typography.small, { color: colors.textTertiary, marginTop: 2 }]}>
                Set from coach conversation
              </Text>
            </View>
            <View style={styles.lastWakeValueRow}>
              <Text style={[Typography.body, { color: colors.text }]}>
                {preferences.lastWakeWindowMinutes >= 60
                  ? `${Math.floor(preferences.lastWakeWindowMinutes / 60)}h${preferences.lastWakeWindowMinutes % 60 ? ` ${preferences.lastWakeWindowMinutes % 60}m` : ''}`
                  : `${preferences.lastWakeWindowMinutes} min`}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  track('change_ai_preference', { key: 'lastWakeWindowMinutes', value: null });
                  onUpdate({ lastWakeWindowMinutes: null });
                }}
                style={styles.clearButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[Typography.captionMedium, { color: colors.accent }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </DarkPanel>
      ) : null}

      <DarkPanel padding="md" style={styles.card} shadow="sm">
        <TriPreferenceRow
          label="Schedule style"
          leftLabel="Strict"
          middleLabel="No preference"
          rightLabel="Flexible"
          value={
            preferences.strictSchedule === true
              ? 'left'
              : preferences.strictSchedule === false
                ? 'right'
                : 'middle'
          }
          onChange={(v) => {
            const key = 'strictSchedule' as const;
            const next = v === 'left' ? true : v === 'right' ? false : null;
            track('change_ai_preference', { key, value: next });
            onUpdate({ strictSchedule: next });
          }}
        />
      </DarkPanel>
    </View>
  );
}

type TriSide = 'left' | 'middle' | 'right';

function TriPreferenceRow({
  label,
  leftLabel,
  middleLabel,
  rightLabel,
  value,
  onChange,
}: {
  label: string;
  leftLabel: string;
  middleLabel: string;
  rightLabel: string;
  value: TriSide;
  onChange: (v: TriSide) => void;
}) {
  const colors = useThemeColors();

  const chip = (side: TriSide, text: string) => {
    const active = value === side;
    return (
      <TouchableOpacity
        style={[styles.triChip, active && styles.toggleOptionActive]}
        onPress={() => onChange(side)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            Typography.captionMedium,
            { color: active ? '#0B1426' : colors.textSecondary, textAlign: 'center' },
          ]}
          numberOfLines={2}
        >
          {text}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <Text style={[Typography.captionMedium, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
        {label}
      </Text>
      <View style={styles.triRow}>
        {chip('left', leftLabel)}
        {chip('middle', middleLabel)}
        {chip('right', rightLabel)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  triRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'stretch',
  },
  triChip: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  toggleOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  toggleOptionActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  timeInput: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Typography.body,
  },
  napRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  napChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  napChipActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  lastWakeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastWakeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  clearButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  insightIcon: { marginTop: 2 },
});
