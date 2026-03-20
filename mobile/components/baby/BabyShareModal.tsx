import { useState } from 'react';
import { StyleSheet, Modal, Alert, KeyboardAvoidingView, Platform, View, Text } from 'react-native';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { caregiversRepo } from '@/services/repositories/caregiversRepo';
import { Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-color';

interface BabyShareModalProps {
  visible: boolean;
  babyId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function BabyShareModal({ visible, babyId, onClose, onSuccess }: BabyShareModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const colors = useThemeColors();

  const handleInvite = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    setLoading(true);
    try {
      await caregiversRepo.invite(babyId, email);
      Alert.alert('Success', 'Invitation sent!');
      setEmail('');
      onSuccess();
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
      >
        <View style={[styles.modalContent, { backgroundColor: '#132140', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' }, Shadows.lg]}>
          <IconSymbol name="envelope.fill" size={40} color={colors.text} style={styles.emojiIcon} />
          <Text style={[Typography.h2, { color: colors.text, marginBottom: Spacing.xs }]}>
            Invite Parent
          </Text>
          <Text style={[Typography.body, { color: colors.textSecondary, marginBottom: Spacing.lg }]}>
            Enter their email to share access
          </Text>

          <Input
            label="Email address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            icon={<IconSymbol name="envelope.fill" size={18} color={colors.textTertiary} />}
          />

          <View style={styles.buttonRow}>
            <Button title="Cancel" onPress={onClose} variant="ghost" style={{ flex: 1 }} />
            <Button
              title={loading ? 'Sending...' : 'Send Invite'}
              onPress={handleInvite}
              loading={loading}
              disabled={loading}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    width: '90%',
    maxWidth: 400,
  },
  emojiIcon: { marginBottom: Spacing.sm },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
