import { IconSymbol } from '@/components/ui/icon-symbol';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import type { ParsedRestOfDayRow } from '@/utils/restOfDaySchedule';
import Markdown from 'react-native-markdown-display';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function WhyRecommendationBlock({ reasoning }: { reasoning?: string | null }) {
  const colors = useThemeColors();
  const md = reasoning?.trim();
  if (!md) return null;

  const markdownStyles = {
    body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    text: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    paragraph: { marginTop: 0, marginBottom: Spacing.xs, color: colors.textSecondary },
    strong: { color: colors.text, fontWeight: '600' as const },
    em: { color: colors.textSecondary, fontStyle: 'italic' as const },
    link: { color: colors.accent },
    bullet_list: { marginTop: 0, marginBottom: 0, paddingLeft: 0 },
    ordered_list: { marginTop: 0, marginBottom: 0, paddingLeft: 0 },
    list_item: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: Spacing.xs,
    },
    bullet_list_icon: { color: colors.accent, marginRight: Spacing.sm, fontSize: 14, lineHeight: 20 },
    ordered_list_icon: { color: colors.accent, marginRight: Spacing.sm, fontSize: 14, lineHeight: 20 },
    code_inline: {
      color: colors.text,
      backgroundColor: 'rgba(255,255,255,0.08)',
      paddingHorizontal: 4,
      borderRadius: Radius.sm,
    },
    code_block: {
      color: colors.textSecondary,
      backgroundColor: 'rgba(255,255,255,0.06)',
      padding: Spacing.sm,
      borderRadius: Radius.md,
      fontSize: 14,
    },
    heading1: { color: colors.text, fontSize: 17, fontWeight: '600' as const, marginBottom: Spacing.sm },
    heading2: { color: colors.text, fontSize: 16, fontWeight: '600' as const, marginBottom: Spacing.xs },
    heading3: { color: colors.text, fontSize: 15, fontWeight: '600' as const, marginBottom: Spacing.xs },
    blockquote: { borderLeftColor: colors.accent, backgroundColor: 'rgba(102, 168, 255, 0.08)' },
    hr: { backgroundColor: colors.border },
  };

  return (
    <View style={styles.whySection}>
      <View style={styles.whyHeader}>
        <IconSymbol name="sparkles" size={16} color={colors.accent} />
        <Text style={[Typography.captionMedium, { color: colors.textSecondary }]}>
          Why this recommendation
        </Text>
      </View>
      <Markdown key={`why-${md.length}-${md.slice(0, 96)}`} style={markdownStyles} mergeStyle>
        {md}
      </Markdown>
    </View>
  );
}

function ScheduleRowCard({ row }: { row: ParsedRestOfDayRow }) {
  const colors = useThemeColors();
  const isNap = row.kind === 'nap';
  const bg = isNap ? colors.napColorSoft : colors.nightColorSoft;
  const accent = isNap ? colors.napColor : colors.nightColor;
  const icon = isNap ? ('moon.zzz.fill' as const) : ('moon.fill' as const);

  return (
    <View style={[styles.scheduleCard, { backgroundColor: bg, borderColor: colors.border }]}>
      <View style={[styles.scheduleIconWrap, { backgroundColor: `${accent}22` }]}>
        <IconSymbol name={icon} size={18} color={accent} />
      </View>
      <View style={styles.scheduleCardBody}>
        <Text style={[Typography.captionMedium, { color: colors.textSecondary }]}>
          {isNap ? row.napLabel : 'Bedtime'}
        </Text>
        <Text style={[Typography.bodySemiBold, { color: colors.text, marginTop: 2 }]}>
          {isNap ? row.timeRange : row.time}
        </Text>
        {isNap && row.capLabel ? (
          <View style={[styles.capPill, { backgroundColor: colors.border }]}>
            <Text style={[Typography.small, { color: colors.textTertiary }]}>{row.capLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ScheduleRowStack({ rows }: { rows: ParsedRestOfDayRow[] }) {
  return (
    <View style={styles.scheduleStack}>
      {rows.map((row) => (
        <ScheduleRowCard key={row.key} row={row} />
      ))}
    </View>
  );
}

/** Section title + timeline cards (for inline / expanded panels). */
export function RestOfDayScheduleList({ rows }: { rows: ParsedRestOfDayRow[] }) {
  const colors = useThemeColors();
  if (rows.length === 0) return null;

  return (
    <View style={styles.scheduleBlock}>
      <View style={styles.scheduleBlockHeader}>
        <IconSymbol name="calendar" size={17} color={colors.accent} />
        <Text style={[Typography.captionMedium, { color: colors.textSecondary }]}>
          Ideal rest of day
        </Text>
      </View>
      <ScheduleRowStack rows={rows} />
    </View>
  );
}

export function RestOfDayScheduleCollapsible({
  rows,
  expanded,
  onToggle,
}: {
  rows: ParsedRestOfDayRow[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const colors = useThemeColors();
  if (rows.length === 0) return null;

  return (
    <View>
      <TouchableOpacity
        style={styles.collapsibleHeader}
        onPress={onToggle}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={styles.collapsibleHeaderLeft}>
          <IconSymbol name="calendar" size={17} color={colors.accent} />
          <Text style={[Typography.bodySemiBold, { color: colors.text }]}>Ideal rest of day</Text>
        </View>
        <IconSymbol
          name={expanded ? 'chevron.up' : 'chevron.down'}
          size={22}
          color={colors.textTertiary}
        />
      </TouchableOpacity>
      {expanded ? (
        <View style={styles.collapsibleBody}>
          <ScheduleRowStack rows={rows} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Full width of parent — no inset border/bg so copy aligns with the rest of the card. */
  whySection: {
    alignSelf: 'stretch',
    width: '100%',
  },
  whyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  scheduleBlock: {
    gap: Spacing.sm,
  },
  scheduleBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  scheduleStack: {
    gap: Spacing.sm,
  },
  scheduleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  scheduleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleCardBody: {
    flex: 1,
    minWidth: 0,
  },
  capPill: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  collapsibleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  collapsibleBody: {
    paddingTop: Spacing.sm,
  },
});
