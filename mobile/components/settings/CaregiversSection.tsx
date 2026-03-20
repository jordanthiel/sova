import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Animated } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { track } from '@/services/analytics/track';
import type { Caregiver } from '@/types/domain';

interface CaregiversSectionProps {
  caregivers: Caregiver[];
  onInvite: (email: string) => Promise<void>;
  /** When true, owner can remove non-owner caregivers. */
  canRemoveCaregivers?: boolean;
  onRemove?: (caregiver: Caregiver) => Promise<void>;
}

const PERMISSION_LABELS: Record<Caregiver['permission'], string> = {
  can_edit: 'Can Edit',
  can_log: 'Can Log',
  view_only: 'View Only',
};

const PERMISSION_COLORS: Record<Caregiver['permission'], string> = {
  can_edit: Colors.dark.accent,
  can_log: '#FFB84D',
  view_only: '#5E7389',
};

export function CaregiversSection({ caregivers, onInvite, canRemoveCaregivers, onRemove }: CaregiversSectionProps) {
  const colors = useThemeColors();
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const handleRemove = (cg: Caregiver) => {
    if (!onRemove || cg.role === 'owner') return;
    const isPending = cg.status === 'pending';
    Alert.alert(
      isPending ? 'Cancel invite' : 'Remove family member',
      isPending
        ? `Cancel the invite for ${cg.email ?? cg.name}? They will no longer be able to join this family from that invitation.`
        : `Remove ${cg.name} from this family? They will lose access to every baby in the family.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPending ? 'Cancel Invite' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(cg.id);
            try {
              await onRemove(cg);
            } catch (err: any) {
              Alert.alert('Error', err.message ?? (isPending ? 'Could not cancel invite.' : 'Could not remove caregiver.'));
            } finally {
              setRemovingId(null);
            }
          },
        },
      ]
    );
  };

  const handleInvite = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    const normalizedEmail = email.trim();
    track('invite_caregiver', { email: normalizedEmail });
    setInviteLoading(true);
    try {
      await onInvite(normalizedEmail);
      setEmail('');
      setShowInvite(false);
      Alert.alert('Invited!', `Invitation created for ${normalizedEmail}.`);
    } catch (err: any) {
      Alert.alert('Invite Failed', err.message ?? 'Could not create invitation.');
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={[Typography.h3, { color: colors.text }]}>Family Members</Text>
        <TouchableOpacity
          onPress={() => setShowInvite(!showInvite)}
          disabled={inviteLoading}
          activeOpacity={0.7}
        >
          <Text style={[Typography.captionMedium, { color: colors.accent }]}>
            {showInvite ? 'Cancel' : '+ Invite'}
          </Text>
        </TouchableOpacity>
      </View>

      {showInvite && (
        <DarkPanel style={styles.inviteCard} padding="md" shadow="sm">
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder="Email address"
            placeholderTextColor={colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
          />
          <Button
            title={inviteLoading ? 'Sending...' : 'Send Invite'}
            onPress={handleInvite}
            variant="primary"
            size="sm"
            fullWidth
            loading={inviteLoading}
            disabled={inviteLoading}
          />
        </DarkPanel>
      )}

      {caregivers.length === 0 ? (
        <DarkPanel padding="md" shadow="sm">
          <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            No other family members yet. Invite someone to share access to every baby in this family.
          </Text>
        </DarkPanel>
      ) : (
        caregivers.map((cg) => {
          const isPending = cg.status === 'pending';
          const isRemovable = !!canRemoveCaregivers && cg.role !== 'owner' && !!onRemove;
          const subtitle = isPending
            ? 'Invited'
            : cg.role === 'owner'
              ? 'Admin'
              : 'Member';

          const caregiverCard = (
            <DarkPanel style={styles.caregiverCard} padding="md" shadow="sm">
              <View style={styles.caregiverRow}>
                <View style={styles.caregiverAvatar}>
                  <Text style={styles.avatarText}>
                    {cg.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.caregiverInfo}>
                  <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                    {cg.name}
                  </Text>
                  <Text style={[Typography.small, { color: colors.textTertiary }]}>
                    {subtitle}
                    {cg.email ? ` • ${cg.email}` : ''}
                  </Text>
                </View>
                {isPending ? (
                  <Badge
                    label="Invited"
                    backgroundColor="rgba(255, 184, 77, 0.12)"
                    color="#FFB84D"
                    size="sm"
                  />
                ) : (
                  <Badge
                    label={PERMISSION_LABELS[cg.permission]}
                    backgroundColor={`${PERMISSION_COLORS[cg.permission]}20`}
                    color={PERMISSION_COLORS[cg.permission]}
                    size="sm"
                  />
                )}
              </View>
            </DarkPanel>
          );

          if (!isRemovable) {
            return (
              <View key={cg.id}>
                {caregiverCard}
              </View>
            );
          }

          const renderRightActions = (
            progress: Animated.AnimatedInterpolation<number>,
            dragX: Animated.AnimatedInterpolation<number>
          ) => {
            const translateX = dragX.interpolate({
              inputRange: [-80, 0],
              outputRange: [0, 80],
              extrapolate: 'clamp',
            });
            const opacity = progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 1],
            });

            return (
              <Animated.View style={[styles.deleteContainer, { opacity, transform: [{ translateX }] }]}>
                <TouchableOpacity
                  onPress={() => handleRemove(cg)}
                  disabled={removingId !== null}
                  style={[styles.deleteBtn, { backgroundColor: colors.error }]}
                  activeOpacity={0.8}
                >
                  {removingId === cg.id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.deleteText}>{isPending ? 'Cancel' : 'Delete'}</Text>
                  )}
                </TouchableOpacity>
              </Animated.View>
            );
          };

          return (
            <Swipeable
              key={cg.id}
              renderRightActions={renderRightActions}
              overshootRight={false}
              friction={2}
              rightThreshold={40}
            >
              {caregiverCard}
            </Swipeable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  caregiverCard: {
    marginBottom: Spacing.sm,
  },
  caregiverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  caregiverAvatar: {
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
  caregiverInfo: {
    flex: 1,
    gap: 2,
  },
  deleteContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginBottom: Spacing.sm,
  },
  deleteBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    borderRadius: Radius.lg,
  },
  deleteText: {
    ...Typography.buttonSmall,
    color: '#FFFFFF',
  },
});
