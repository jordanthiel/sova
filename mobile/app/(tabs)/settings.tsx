import { AppClockDebugSection } from '@/components/dev/AppClockDebugSection';
import { BabySwitcher } from '@/components/baby/BabySwitcher';
import { AiPreferencesSection } from '@/components/settings/AiPreferencesSection';
import { BabyProfileSection } from '@/components/settings/BabyProfileSection';
import { CaregiversSection } from '@/components/settings/CaregiversSection';
import { CoachMemoriesSection } from '@/components/settings/CoachMemoriesSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { SleepTrainersSection } from '@/components/settings/SleepTrainersSection';
import { Button } from '@/components/ui/Button';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { useBabies } from '@/hooks/useBabies';
import { useRealtimeCaregivers } from '@/hooks/useRealtimeCaregivers';
import { useRealtimeTrainers } from '@/hooks/useRealtimeTrainers';
import { loadNotificationConfigForBaby, saveNotificationConfigForBaby } from '@/lib/notificationSettings';
import { supabase } from '@/lib/supabase';
import { track } from '@/services/analytics/track';
import { importSleepSessions, pickAndReadCsv } from '@/services/importSleepCsv';
import { babiesRepo } from '@/services/repositories/babiesRepo';
import { caregiversRepo } from '@/services/repositories/caregiversRepo';
import { trainersRepo } from '@/services/repositories/trainersRepo';
import {
  DEFAULT_NOTIFICATION_CONFIG,
  type Baby,
  type BabyPreferences,
  type NotificationConfig,
} from '@/types/domain';
import { parseSleepCsv } from '@/utils/sleepCsvImport';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const { babies, loading: babiesLoading, refetch: refetchBabies } = useBabies();
  const { currentBabyId, setCurrentBabyId, isHydrated } = useCurrentBaby();
  const [domainBaby, setDomainBaby] = useState<Baby | null>(null);
  const { caregivers, loading: caregiversLoading, refetch: refetchCaregivers } = useRealtimeCaregivers(currentBabyId);
  const { trainers, loading: trainersLoading, refetch: refetchTrainers } = useRealtimeTrainers(currentBabyId);
  const [notificationConfig, setNotificationConfig] = useState<NotificationConfig>(DEFAULT_NOTIFICATION_CONFIG);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importCode, setImportCode] = useState<string | null>(null);
  const [importCodeLoading, setImportCodeLoading] = useState(false);
  const [importCodeError, setImportCodeError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
      setCurrentUserEmail(data.user?.email ?? null);
    });
  }, []);

  const inboundDomain = process.env.EXPO_PUBLIC_SLEEP_IMPORT_INBOUND_DOMAIN ?? '';
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '';
  const importEmailAddress = inboundDomain && importCode ? `import+${importCode}@${inboundDomain}` : null;

  useEffect(() => {
    if (!isHydrated || babiesLoading || babies.length === 0) return;
    const currentValid = currentBabyId && babies.some((b) => b.id === currentBabyId);
    if (currentValid) return;
    setCurrentBabyId(babies[0].id);
  }, [isHydrated, babies, babiesLoading, currentBabyId, setCurrentBabyId]);

  const loadDetails = useCallback(async () => {
    if (!currentBabyId) return;
    setLoadingDetails(true);
    try {
      const selectedBaby = babies.find((b) => b.id === currentBabyId);
      if (!selectedBaby) return;

      const prefs = await babiesRepo.getPreferences(currentBabyId);

      setDomainBaby({
        id: selectedBaby.id,
        name: selectedBaby.name,
        birthdate: selectedBaby.birth_date,
        preferences: prefs,
        caregivers,
      });

      try {
        const cfg = await loadNotificationConfigForBaby(currentBabyId);
        setNotificationConfig(cfg);
      } catch {
        setNotificationConfig(DEFAULT_NOTIFICATION_CONFIG);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoadingDetails(false);
    }
  }, [currentBabyId, babies]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const fetchOrCreateImportCode = useCallback(async () => {
    if (!currentBabyId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setImportCodeError(null);
    setImportCodeLoading(true);
    try {
      const { data: row, error: selectError } = await supabase
        .from('sleep_import_codes')
        .select('code')
        .eq('user_id', user.id)
        .eq('baby_id', currentBabyId)
        .maybeSingle();

      if (selectError) {
        setImportCodeError(selectError.message || 'Could not load import address. Run the DB migration if you use email import.');
        return;
      }
      if (row?.code) {
        setImportCode(row.code);
        return;
      }

      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let code = '';
      for (let i = 0; i < 16; i++) code += chars[Math.floor(Math.random() * chars.length)];
      const { error: insertError } = await supabase.from('sleep_import_codes').insert({
        code,
        user_id: user.id,
        baby_id: currentBabyId,
      });

      if (insertError) {
        const { data: retry } = await supabase
          .from('sleep_import_codes')
          .select('code')
          .eq('user_id', user.id)
          .eq('baby_id', currentBabyId)
          .maybeSingle();
        if (retry?.code) {
          setImportCode(retry.code);
          return;
        }
        setImportCodeError(insertError.message || 'Could not create import address.');
        return;
      }
      setImportCode(code);
    } finally {
      setImportCodeLoading(false);
    }
  }, [currentBabyId]);

  useFocusEffect(
    useCallback(() => {
      if (!currentBabyId) {
        setImportCode(null);
        setImportCodeError(null);
        return;
      }
      fetchOrCreateImportCode();
    }, [currentBabyId, fetchOrCreateImportCode])
  );

  useFocusEffect(
    useCallback(() => {
      track('view_settings', { babyId: currentBabyId });
    }, [currentBabyId])
  );

  const handlePreferencesUpdate = async (patch: Partial<BabyPreferences>) => {
    if (!currentBabyId || !domainBaby) return;
    const updated = await babiesRepo.updatePreferences(currentBabyId, patch);
    setDomainBaby({ ...domainBaby, preferences: updated });
  };

  const handleNotificationUpdate = async (
    patch: Partial<NotificationConfig>
  ) => {
    if (!currentBabyId) return;
    const updated = await saveNotificationConfigForBaby(currentBabyId, patch);
    setNotificationConfig(updated);
  };

  const handleInviteCaregiver = async (email: string) => {
    if (!currentBabyId) return;
    await caregiversRepo.invite(currentBabyId, email);
    await refetchCaregivers();
  };

  const handleInviteTrainer = async (email: string) => {
    if (!currentBabyId) return;
    await trainersRepo.inviteTrainerByEmail(currentBabyId, email);
    await refetchTrainers();
  };

  const handleRemoveCaregiver = async (caregiver: Baby['caregivers'][number]) => {
    if (!currentBabyId) return;
    await caregiversRepo.remove(currentBabyId, caregiver);
    await refetchCaregivers();
  };

  const handleRemoveTrainer = async (trainer: (typeof trainers)[number]) => {
    await trainersRepo.removeAssignment(trainer.assignmentId);
    await refetchTrainers();
  };

  const canRemoveCaregivers = Boolean(
    currentUserId && caregivers.some((member) => member.id === currentUserId && member.role === 'owner')
  );
  const canManageTrainers = canRemoveCaregivers;

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleRequestAccountDeletion = async () => {
    track('request_account_deletion_tap', { userId: currentUserId });
    if (!supportEmail) {
      Alert.alert(
        'Support email not configured',
        'Set EXPO_PUBLIC_SUPPORT_EMAIL to enable account deletion requests from Settings.'
      );
      return;
    }

    const subject = 'Account deletion request';
    const bodyLines = [
      'Hello,',
      '',
      'I would like to request deletion of my Sova account.',
      '',
      `Account email: ${currentUserEmail ?? 'Not available'}`,
      `User ID: ${currentUserId ?? 'Not available'}`,
      '',
      'Please let me know if you need anything else to verify this request.',
    ];
    const mailto = `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;

    try {
      const supported = await Linking.canOpenURL(mailto);
      if (!supported) {
        Alert.alert(
          'Mail app unavailable',
          `Please email ${supportEmail} to request account deletion.`
        );
        return;
      }
      await Linking.openURL(mailto);
    } catch {
      Alert.alert(
        'Could not open mail',
        `Please email ${supportEmail} to request account deletion.`
      );
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchBabies(), loadDetails(), refetchCaregivers(), refetchTrainers(), fetchOrCreateImportCode()]);
    setRefreshing(false);
  };

  const handleImportCsv = async () => {
    if (!currentBabyId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'You must be signed in to import.');
      return;
    }
    setImporting(true);
    try {
      const file = await pickAndReadCsv();
      if (!file) {
        setImporting(false);
        return;
      }
      const { rows, skipped, errors: parseErrors } = parseSleepCsv(file.content);
      if (rows.length === 0) {
        Alert.alert(
          'No sleep data found',
          parseErrors.length > 0
            ? `Could not find valid sleep rows. ${parseErrors.slice(0, 3).join(' ')}`
            : 'The file had no "Sleep" rows or Start/End dates were invalid.'
        );
        setImporting(false);
        return;
      }
      const minDate = format(new Date(Math.min(...rows.map((r) => r.startTime.getTime()))), 'MMM d, yyyy');
      const maxDate = format(new Date(Math.max(...rows.map((r) => r.startTime.getTime()))), 'MMM d, yyyy');
      const napCount = rows.filter((r) => r.type === 'nap').length;
      const nightCount = rows.filter((r) => r.type === 'night').length;
      Alert.alert(
        'Import sleep data?',
        `${rows.length} sleep sessions (${napCount} naps, ${nightCount} night) from ${minDate} to ${maxDate} will be added for this baby.${skipped > 0 ? ` ${skipped} non-sleep rows were skipped.` : ''}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: async () => {
              track('import_sleep_csv', { babyId: currentBabyId, count: rows.length });
              const result = await importSleepSessions(currentBabyId, user.id, rows);
              if (result.failed > 0) {
                Alert.alert(
                  'Import completed with errors',
                  `Imported ${result.imported} sessions. ${result.failed} failed. ${result.errors.join(' ')}`
                );
              } else {
                Alert.alert('Import complete', `${result.imported} sleep sessions added.`);
              }
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Import failed', err.message || 'Could not read or import the file.');
    } finally {
      setImporting(false);
    }
  };

  if (babiesLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContainer}>
          <SkeletonCard style={{ marginBottom: Spacing.md }} />
          <SkeletonCard style={{ marginBottom: Spacing.md }} />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[Typography.h2, { color: colors.text }]}>Settings</Text>
        </View>

        {babies.length > 0 && (
          <View style={styles.switcherSection}>
            <BabySwitcher
              currentBabyId={currentBabyId}
              babies={babies}
              onBabyChange={(id) => {
                track('switch_baby', { babyId: id });
                setCurrentBabyId(id);
              }}
            />
          </View>
        )}

        {domainBaby && !loadingDetails ? (
          <>
            {/* Baby Profile */}
            <View style={styles.section}>
              <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>
                Baby Profile
              </Text>
              <BabyProfileSection baby={domainBaby} />
            </View>

            

            {/* Caregivers */}
            <View style={styles.section}>
              {caregiversLoading ? (
                <SkeletonCard style={{ marginBottom: Spacing.sm }} />
              ) : (
                <CaregiversSection
                  caregivers={caregivers}
                  onInvite={handleInviteCaregiver}
                  canRemoveCaregivers={canRemoveCaregivers}
                  onRemove={canRemoveCaregivers ? handleRemoveCaregiver : undefined}
                />
              )}
            </View>

            {/* Sleep trainers */}
            <View style={styles.section}>
              {trainersLoading ? (
                <SkeletonCard style={{ marginBottom: Spacing.sm }} />
              ) : (
                <SleepTrainersSection
                  trainers={trainers}
                  onInvite={handleInviteTrainer}
                  onRemove={handleRemoveTrainer}
                  canManage={canManageTrainers}
                />
              )}
            </View>

            {/* AI Preferences */}
            <View style={styles.section}>
              <AiPreferencesSection
                preferences={domainBaby.preferences}
                birthdate={domainBaby.birthdate}
                onUpdate={handlePreferencesUpdate}
              />
            </View>

            {/* Coach memories */}
            <View style={styles.section}>
              <CoachMemoriesSection babyId={currentBabyId} />
            </View>

            {/* Notifications */}
            <View style={styles.section}>
              <NotificationsSection
                config={notificationConfig}
                onUpdate={handleNotificationUpdate}
              />
            </View>
          </>
        ) : loadingDetails ? (
          <View style={{ padding: Spacing.lg }}>
            <SkeletonCard style={{ marginBottom: Spacing.md }} />
            <SkeletonCard style={{ marginBottom: Spacing.md }} />
            <SkeletonCard />
          </View>
        ) : babies.length === 0 ? (
          <EmptyState
            icon="gearshape.fill"
            title="No babies yet"
            message="Add a baby to configure settings."
            actionTitle="Add Baby"
            onAction={() => router.push('/baby-setup')}
          />
        ) : null}
        {/* Import sleep data */}
        <View style={styles.section}>
              <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>
                Data
              </Text>
              <DarkPanel padding="md" style={styles.importCard} shadow="sm">
                <Text style={[Typography.bodyMedium, { color: colors.text, marginBottom: Spacing.xs }]}>
                  Import sleep from CSV
                </Text>
                <Text style={[Typography.small, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
                  Backfill sleep history from Huckleberry or other apps. CSV should have Type, Start, End, and optional Notes.
                </Text>
                <Button
                  title={importing ? 'Reading file…' : 'Choose CSV file'}
                  onPress={handleImportCsv}
                  variant="secondary"
                  size="sm"
                  disabled={importing}
                />
              </DarkPanel>

              <DarkPanel padding="md" style={[styles.importCard, { marginTop: Spacing.sm }]} shadow="sm">
                <Text style={[Typography.bodyMedium, { color: colors.text, marginBottom: Spacing.xs }]}>
                  Import by email
                </Text>
                <Text style={[Typography.small, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
                  Send an email from your account email with your sleep CSV attached. It will be imported for {domainBaby?.name ?? 'this baby'}.
                </Text>
                {importCodeLoading ? (
                  <Text style={[Typography.small, { color: colors.textSecondary }]}>Loading address…</Text>
                ) : importEmailAddress ? (
                  <>
                    <Text selectable style={[Typography.small, { color: colors.text, marginBottom: Spacing.sm, fontFamily: 'monospace' }]}>
                      {importEmailAddress}
                    </Text>
                    <Button
                      title="Copy address"
                      onPress={() => Share.share({ message: importEmailAddress, title: 'Sleep import address' })}
                      variant="secondary"
                      size="sm"
                    />
                  </>
                ) : inboundDomain ? (
                  <>
                    {importCodeError ? (
                      <Text style={[Typography.small, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
                        {importCodeError}
                      </Text>
                    ) : null}
                    <Button
                      title={importCodeError ? 'Retry' : 'Generate address'}
                      onPress={fetchOrCreateImportCode}
                      variant="secondary"
                      size="sm"
                      disabled={importCodeLoading}
                    />
                  </>
                ) : (
                  <Text style={[Typography.small, { color: colors.textSecondary }]}>
                    Set EXPO_PUBLIC_SLEEP_IMPORT_INBOUND_DOMAIN in your app config to show your import address.
                  </Text>
                )}
              </DarkPanel>
            </View>

        {/* Account actions */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.addBabyButton}
            onPress={() => router.push('/baby-setup')}
            activeOpacity={0.7}
          >
            <Text style={[Typography.bodyMedium, { color: colors.accent }]}>
              + Add Another Baby
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <DarkPanel padding="md" style={styles.importCard} shadow="sm">
            <Text style={[Typography.bodyMedium, { color: colors.text, marginBottom: Spacing.xs }]}>
              Request account deletion
            </Text>
            <Text style={[Typography.small, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
              Opens your mail app with a prefilled request to permanently delete your account.
            </Text>
            <Button
              title="Request Account Deletion"
              onPress={handleRequestAccountDeletion}
              variant="secondary"
              fullWidth
            />
          </DarkPanel>
        </View>

        <AppClockDebugSection />

        <View style={styles.section}>
          <Button
            title="Sign Out"
            onPress={handleLogout}
            variant="danger"
            fullWidth
          />
        </View>

        <View style={styles.section}>
          <Text
            style={[
              Typography.small,
              { color: colors.textTertiary, textAlign: 'center' },
            ]}
          >
            Sova v1.0.0
          </Text>
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0918',
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.lg },
  loadingContainer: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  switcherSection: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  importCard: {
    marginBottom: Spacing.sm,
  },
  addBabyButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.accentSoft,
    borderStyle: 'dashed',
  },
});
