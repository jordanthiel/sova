import { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getPendingInvitations, acceptInvitation, type PendingInvitation } from '@/utils/babyInvitations';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-color';
import { shouldShowOnboarding } from '@/app/onboarding';

export default function InvitesChoiceScreen() {
  const [invites, setInvites] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | 'all' | null>(null);
  const colors = useThemeColors();

  useEffect(() => {
    loadInvites();
  }, []);

  const loadInvites = async () => {
    setLoading(true);
    try {
      const list = await getPendingInvitations();
      setInvites(list);
      if (list.length === 0) {
        router.replace('/baby-setup');
        return;
      }
    } catch (e) {
      console.error('Failed to load invitations', e);
      router.replace('/baby-setup');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptOne = async (invitationId: string) => {
    setAcceptingId(invitationId);
    try {
      await acceptInvitation(invitationId);
      setInvites((prev) => prev.filter((i) => i.id !== invitationId));
      await goToApp();
    } catch (e: any) {
      console.error('Accept failed', e);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleAcceptAll = async () => {
    if (invites.length === 0) return;
    setAcceptingId('all');
    try {
      for (const inv of invites) {
        await acceptInvitation(inv.id);
      }
      await goToApp();
    } catch (e: any) {
      console.error('Accept all failed', e);
    } finally {
      setAcceptingId(null);
    }
  };

  const goToApp = async () => {
    const showOnboarding = await shouldShowOnboarding();
    if (showOnboarding) {
      router.replace('/onboarding');
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleCreateNewBaby = () => {
    router.push('/baby-setup?from=invites');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.md }]}>
            Checking invitations...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const babyName = (inv: PendingInvitation) =>
    inv.baby_name ?? 'a baby';
  const inviterLabel = (inv: PendingInvitation) =>
    inv.inviter_name ? `Invited by ${inv.inviter_name}` : 'Invitation';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(600)} style={styles.headerSection}>
          <IconSymbol name="envelope.fill" size={56} color={colors.text} style={styles.heroIcon} />
          <Text style={[Typography.h1, { color: colors.text, textAlign: 'center' }]}>
            You're invited
          </Text>
          <Text
            style={[
              Typography.body,
              { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
            ]}
          >
            Someone invited you to help track sleep. Accept to join, or create your own baby profile.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.invitesSection}>
          {invites.map((inv) => (
            <Card key={inv.id} variant="outlined" padding="md" style={styles.inviteCard}>
              <View style={styles.inviteRow}>
                <View style={styles.inviteInfo}>
                  <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
                    {babyName(inv)}
                  </Text>
                  <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                    {inviterLabel(inv)}
                  </Text>
                </View>
                <Button
                  title={
                    acceptingId === inv.id ? 'Accepting...' : 'Accept'
                  }
                  onPress={() => handleAcceptOne(inv.id)}
                  disabled={acceptingId !== null}
                  size="sm"
                />
              </View>
            </Card>
          ))}

          {invites.length > 1 && (
            <Button
              title={acceptingId === 'all' ? 'Accepting all...' : 'Accept all'}
              onPress={handleAcceptAll}
              disabled={acceptingId !== null}
              fullWidth
              style={styles.acceptAllButton}
            />
          )}

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[Typography.caption, { color: colors.textTertiary, paddingHorizontal: Spacing.sm }]}>
              or
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.createNewButton, { borderColor: colors.border }]}
            onPress={handleCreateNewBaby}
            activeOpacity={0.7}
          >
            <Text style={[Typography.bodySemiBold, { color: colors.accent }]}>
              Create new baby profile
            </Text>
            <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
              Set up your own baby and start tracking from scratch
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1426',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  heroIcon: { marginBottom: Spacing.md },
  invitesSection: {
    marginBottom: Spacing.lg,
  },
  inviteCard: {
    marginBottom: Spacing.md,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  inviteInfo: {
    flex: 1,
  },
  acceptAllButton: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  createNewButton: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
});
