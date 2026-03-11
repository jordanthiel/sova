import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { track } from '@/services/analytics/track';
import type { Caregiver } from '@/types/domain';

interface CaregiversSectionProps {
  caregivers: Caregiver[];
  onInvite: (email: string) => void;
}

const PERMISSION_LABELS: Record<Caregiver['permission'], string> = {
  can_edit: 'Can Edit',
  can_log: 'Can Log',
  view_only: 'View Only',
};

const PERMISSION_COLORS: Record<Caregiver['permission'], string> = {
  can_edit: '#4ECDC4',
  can_log: '#FFB84D',
  view_only: '#5E7389',
};

export function CaregiversSection({ caregivers, onInvite }: CaregiversSectionProps) {
  const colors = useThemeColors();
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');

  const handleInvite = () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    track('invite_caregiver', { email: email.trim() });
    onInvite(email.trim());
    setEmail('');
    setShowInvite(false);
    Alert.alert('Invited!', `Invitation sent to ${email.trim()}`);
  };

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={[Typography.h3, { color: colors.text }]}>Caregivers</Text>
        <TouchableOpacity
          onPress={() => setShowInvite(!showInvite)}
          activeOpacity={0.7}
        >
          <Text style={[Typography.captionMedium, { color: colors.accent }]}>
            {showInvite ? 'Cancel' : '+ Invite'}
          </Text>
        </TouchableOpacity>
      </View>

      {showInvite && (
        <Card style={styles.inviteCard} padding="md">
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
            title="Send Invite"
            onPress={handleInvite}
            variant="primary"
            size="sm"
            fullWidth
          />
        </Card>
      )}

      {caregivers.length === 0 ? (
        <Card padding="md">
          <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            No other caregivers yet. Invite someone to share sleep tracking.
          </Text>
        </Card>
      ) : (
        caregivers.map((cg) => (
          <Card key={cg.id} style={styles.caregiverCard} padding="md">
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
                  {cg.role === 'owner' ? 'Owner' : 'Caregiver'}
                </Text>
              </View>
              <Badge
                label={PERMISSION_LABELS[cg.permission]}
                backgroundColor={`${PERMISSION_COLORS[cg.permission]}20`}
                color={PERMISSION_COLORS[cg.permission]}
                size="sm"
              />
            </View>
          </Card>
        ))
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
    backgroundColor: 'rgba(78, 205, 196, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...Typography.bodySemiBold,
    color: '#4ECDC4',
  },
  caregiverInfo: {
    flex: 1,
    gap: 2,
  },
});
