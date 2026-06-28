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
import { useThemeColors } from '@/hooks/use-theme-color';
import type { TrainerClientFamily } from '@/types/domain';

interface TrainerClientsSectionProps {
  clients: TrainerClientFamily[];
  onRequestAccess: (familyAccessCode: string) => Promise<void>;
  onMessageClient: (client: TrainerClientFamily) => void;
}

const STATUS_LABELS: Record<TrainerClientFamily['status'], string> = {
  pending: 'Pending',
  accepted: 'Active',
  declined: 'Declined',
  revoked: 'Removed',
};

export function TrainerClientsSection({
  clients,
  onRequestAccess,
  onMessageClient,
}: TrainerClientsSectionProps) {
  const colors = useThemeColors();
  const [familyCode, setFamilyCode] = useState('');
  const [requesting, setRequesting] = useState(false);

  const handleRequest = async () => {
    const code = familyCode.trim();
    if (!code) {
      Alert.alert('Missing code', 'Ask the family for their Sova family access code.');
      return;
    }

    setRequesting(true);
    try {
      await onRequestAccess(code);
      setFamilyCode('');
      Alert.alert('Request sent', 'A family admin can approve your access in their Sleep Trainers settings.');
    } catch (err: any) {
      Alert.alert('Request failed', err.message ?? 'Could not request access to that family.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={[Typography.h3, { color: colors.text }]}>Trainer Clients</Text>
        <Text style={[Typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
          Request family access, then review logs, comments, messages, and plans once approved.
        </Text>
      </View>

      <DarkPanel style={styles.requestCard} padding="md" shadow="sm">
        <Text style={[Typography.bodyMedium, { color: colors.text, marginBottom: Spacing.xs }]}>
          Add a client family
        </Text>
        <Text style={[Typography.small, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
          Paste the family access code shared by the parent.
        </Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          placeholder="Family access code"
          placeholderTextColor={colors.textTertiary}
          value={familyCode}
          onChangeText={setFamilyCode}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          title={requesting ? 'Requesting...' : 'Request Access'}
          onPress={handleRequest}
          variant="primary"
          size="sm"
          fullWidth
          loading={requesting}
          disabled={requesting}
        />
      </DarkPanel>

      {clients.length === 0 ? (
        <DarkPanel padding="md" shadow="sm">
          <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            No client families yet. Ask a family to share their access code to get started.
          </Text>
        </DarkPanel>
      ) : (
        clients.map((client) => {
          const label = client.familyName || `Family ${client.familyId.slice(0, 8)}`;
          const babies = client.babyNames.length > 0 ? client.babyNames.join(', ') : 'Waiting for approval';
          return (
            <DarkPanel key={client.assignmentId} style={styles.clientCard} padding="md" shadow="sm">
              <View style={styles.clientRow}>
                <View style={styles.clientAvatar}>
                  <Text style={styles.avatarText}>{label.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.clientInfo}>
                  <Text style={[Typography.bodyMedium, { color: colors.text }]}>{label}</Text>
                  <Text style={[Typography.small, { color: colors.textTertiary }]}>{babies}</Text>
                </View>
                <Badge
                  label={STATUS_LABELS[client.status]}
                  backgroundColor={client.status === 'accepted' ? Colors.dark.accentSoft : 'rgba(255, 184, 77, 0.12)'}
                  color={client.status === 'accepted' ? Colors.dark.accent : '#FFB84D'}
                  size="sm"
                />
              </View>
              {client.status === 'accepted' ? (
                <TouchableOpacity
                  style={styles.messageButton}
                  onPress={() => onMessageClient(client)}
                  activeOpacity={0.7}
                >
                  <Text style={[Typography.captionMedium, { color: colors.accent }]}>Message family</Text>
                </TouchableOpacity>
              ) : null}
            </DarkPanel>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    marginBottom: Spacing.md,
  },
  requestCard: {
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Typography.body,
  },
  clientCard: {
    marginBottom: Spacing.sm,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  clientAvatar: {
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
  clientInfo: {
    flex: 1,
    gap: 2,
  },
  messageButton: {
    alignSelf: 'flex-end',
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
});
