import { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useSleepPlans } from '@/hooks/useSleepPlans';
import { useThemeColors } from '@/hooks/use-theme-color';
import { sleepPlansRepo } from '@/services/repositories/sleepPlansRepo';
import type { SleepPlan, SleepPlanInstruction } from '@/types/domain';
import { format } from 'date-fns';

interface SleepPlansSectionProps {
  babyId: string;
  authorType: SleepPlan['authorType'];
}

function linesToInstructions(text: string): SleepPlanInstruction[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      title: `Step ${index + 1}`,
      body: line,
    }));
}

export function SleepPlansSection({ babyId, authorType }: SleepPlansSectionProps) {
  const colors = useThemeColors();
  const { plans, activePlan, loading, refetch } = useSleepPlans(babyId);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [instructionsText, setInstructionsText] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setTitle('');
    setSummary('');
    setInstructionsText('');
    setShowCreate(false);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Add a title', 'Give this sleep plan a short title.');
      return;
    }

    setSaving(true);
    try {
      await sleepPlansRepo.create(babyId, {
        title,
        summary,
        instructions: linesToInstructions(instructionsText),
        status: 'active',
        clientVisible: true,
        authorType,
      });
      resetForm();
      await refetch();
    } catch (err: any) {
      Alert.alert('Could not save plan', err.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (plan: SleepPlan) => {
    Alert.alert('Archive sleep plan?', 'This will remove it as the active plan for this baby.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        onPress: async () => {
          await sleepPlansRepo.archive(plan.id);
          await refetch();
        },
      },
    ]);
  };

  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.h3, { color: colors.text }]}>Sleep Plans</Text>
          <Text style={[Typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
            Create instructions families and trainers can follow alongside the log.
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowCreate(!showCreate)} activeOpacity={0.7}>
          <Text style={[Typography.captionMedium, { color: colors.accent }]}>
            {showCreate ? 'Cancel' : '+ Plan'}
          </Text>
        </TouchableOpacity>
      </View>

      {showCreate ? (
        <DarkPanel style={styles.formCard} padding="md" shadow="sm">
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder="Plan title"
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.border }]}
            placeholder="Summary for the family"
            placeholderTextColor={colors.textTertiary}
            value={summary}
            onChangeText={setSummary}
            multiline
          />
          <TextInput
            style={[styles.input, styles.multiline, { color: colors.text, borderColor: colors.border }]}
            placeholder="Instructions, one per line"
            placeholderTextColor={colors.textTertiary}
            value={instructionsText}
            onChangeText={setInstructionsText}
            multiline
          />
          <Button
            title={saving ? 'Saving...' : 'Save Active Plan'}
            onPress={handleCreate}
            loading={saving}
            disabled={saving}
            size="sm"
            fullWidth
          />
        </DarkPanel>
      ) : null}

      {loading ? (
        <DarkPanel padding="md" shadow="sm">
          <Text style={[Typography.body, { color: colors.textSecondary }]}>Loading plans...</Text>
        </DarkPanel>
      ) : plans.length === 0 ? (
        <DarkPanel padding="md" shadow="sm">
          <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            No sleep plans yet. Add one to share structured guidance.
          </Text>
        </DarkPanel>
      ) : (
        plans.map((plan) => (
          <DarkPanel key={plan.id} style={styles.planCard} padding="md" shadow="sm">
            <View style={styles.planHeader}>
              <Text style={[Typography.bodyMedium, { color: colors.text, flex: 1 }]}>{plan.title}</Text>
              <Badge
                label={plan.status === 'active' ? 'Active' : plan.status}
                backgroundColor={plan.status === 'active' ? Colors.dark.accentSoft : 'rgba(255,255,255,0.08)'}
                color={plan.status === 'active' ? Colors.dark.accent : colors.textSecondary}
                size="sm"
              />
            </View>
            {plan.summary ? (
              <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
                {plan.summary}
              </Text>
            ) : null}
            {plan.instructions.length > 0 ? (
              <View style={styles.instructions}>
                {plan.instructions.slice(0, 4).map((instruction, index) => (
                  <Text key={`${plan.id}:${index}`} style={[Typography.caption, { color: colors.textSecondary }]}>
                    {index + 1}. {instruction.body}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={styles.planFooter}>
              <Text style={[Typography.small, { color: colors.textTertiary }]}>
                {plan.authorType === 'trainer' ? 'Trainer plan' : plan.authorType === 'ai_agent' ? 'AI agent plan' : 'Family plan'} • {format(new Date(plan.createdAt), 'MMM d')}
              </Text>
              {activePlan?.id === plan.id ? (
                <TouchableOpacity onPress={() => handleArchive(plan)} activeOpacity={0.7}>
                  <Text style={[Typography.captionMedium, { color: colors.error }]}>Archive</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </DarkPanel>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  formCard: {
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Typography.body,
  },
  multiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  planCard: {
    marginBottom: Spacing.sm,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  instructions: {
    marginTop: Spacing.sm,
    gap: 2,
  },
  planFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
