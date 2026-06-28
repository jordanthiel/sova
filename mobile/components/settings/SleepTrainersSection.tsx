import { useState } from 'react';
import {
  ActivityIndicator,
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
import { useThemeColors } from '@/hooks/use-theme-color';
import type { SleepTrainer } from '@/types/domain';

interface SleepTrainersSectionProps {
  trainers: SleepTrainer[];
  onInvite: (email: string) => Promise<void>;
  onRemove: (trainer: SleepTrainer) => Promise<void>;
  canManage: boolean;
}

const STATUS_LABELS: Record<SleepTrainer['status'], string> = {
  pending: 'Invited',
  accepted: 'Active',
  declined: 'Declined',
  revoked: 'Removed',
};

export function SleepTrainersSection({
  trainers,
  onInvite,
  onRemove,
  canManage,
}: SleepTrainersSectionProps) {
  const colors = useThemeColors();
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleInvite = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid trainer email address.');
      return;
    }

    setInviteLoading(true);
    try {
      await onInvite(normalizedEmail);
      setEmail('');
      setShowInvite(false);
      Alert.alert('Trainer invited', `${normalizedEmail} can accept access to this family.`);
    } catch (err: any) {
      Alert.alert('Invite failed', err.message ?? 'Could not invite that trainer.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemove = (trainer: SleepTrainer) => {
    Alert.alert(
      trainer.status === 'pending' ? 'Cancel trainer invite' : 'Remove trainer',
      trainer.status === 'pending'
        ? `Cancel the invite for ${trainer.email ?? trainer.name}?`
        : `Remove ${trainer.name}? They will lose access to logs, comments, messages, and plans for this family.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: trainer.status === 'pending' ? 'Cancel Invite' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(trainer.assignmentId);
            try {
              await onRemove(trainer);
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Could not update trainer access.');
            } finally {
              setRemovingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.h3, { color: colors.text }]}>Sleep Trainers</Text>
          <Text style={[Typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
            Give a coach or AI agent access to review logs, comment, message, and create plans.
          </Text>
        </View>
        {canManage ? (
          <TouchableOpacity
            onPress={() => setShowInvite(!showInvite)}
            disabled={inviteLoading}
            activeOpacity={0.7}
          >
            <Text style={[Typography.captionMedium, { color: colors.accent }]}>
              {showInvite ? 'Cancel' : '+ Invite'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {showInvite ? (
        <DarkPanel style={styles.inviteCard} padding="md" shadow="sm">
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder="Trainer email address"
            placeholderTextColor={colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
          />
          <Button
            title={inviteLoading ? 'Inviting...' : 'Invite Sleep Trainer'}
            onPress={handleInvite}
            variant="primary"
            size="sm"
            fullWidth
            loading={inviteLoading}
            disabled={inviteLoading}
          />
        </DarkPanel>
      ) : null}

      {trainers.length === 0 ? (
        <DarkPanel padding="md" shadow="sm">
          <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            No sleep trainers yet. Invite one when you want outside guidance on sleep sessions and plans.
          </Text>
        </DarkPanel>
      ) : (
        trainers.map((trainer) => (
          <DarkPanel key={trainer.assignmentId} style={styles.trainerCard} padding="md" shadow="sm">
            <View style={styles.trainerRow}>
              <View style={styles.trainerAvatar}>
                <Text style={styles.avatarText}>{trainer.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.trainerInfo}>
                <Text style={[Typography.bodyMedium, { color: colors.text }]}>{trainer.name}</Text>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>
                  {trainer.trainerType === 'ai_agent' ? 'AI sleep agent' : 'Sleep trainer'}
                  {trainer.email ? ` • ${trainer.email}` : ''}
                </Text>
              </View>
              {removingId === trainer.assignmentId ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Badge
                  label={STATUS_LABELS[trainer.status]}
                  backgroundColor={trainer.status === 'accepted' ? Colors.dark.accentSoft : 'rgba(255, 184, 77, 0.12)'}
                  color={trainer.status === 'accepted' ? Colors.dark.accent : '#FFB84D'}
                  size="sm"
                />
              )}
            </View>
            {canManage ? (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemove(trainer)}
                disabled={removingId !== null}
                activeOpacity={0.7}
              >
                <Text style={[Typography.captionMedium, { color: colors.error }]}>
                  {trainer.status === 'pending' ? 'Cancel invite' : 'Remove access'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </DarkPanel>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  inviteCard: {
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Typography.body,
  },
  trainerCard: {
    marginBottom: Spacing.sm,
  },
  trainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  trainerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...Typography.bodySemiBold,
    color: Colors.dark.accent,
  },
  trainerInfo: {
    flex: 1,
    gap: 2,
  },
  removeButton: {
    alignSelf: 'flex-end',
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
});
