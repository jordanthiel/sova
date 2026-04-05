import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PREMIUM_FEATURE_LABELS, type PremiumFeatureKey } from '@/constants/subscription';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { getTrialDaysRemaining } from '@/services/subscription';
import { track } from '@/services/analytics/track';
import type { RevenueCatPackage } from '@/types/subscription';

function getPackageLabel(pkg: RevenueCatPackage): string {
  const rawType = String((pkg as any)?.packageType ?? '').toLowerCase();
  const identifier = String((pkg as any)?.identifier ?? '').toLowerCase();

  if (rawType.includes('annual') || identifier.includes('annual') || identifier.includes('year')) {
    return 'Annual';
  }
  if (rawType.includes('monthly') || identifier.includes('month')) {
    return 'Monthly';
  }
  return (pkg as any)?.product?.title ?? 'Plan';
}

function getPackageSubtitle(pkg: RevenueCatPackage): string | null {
  const product = (pkg as any)?.product;
  if (!product) return null;
  return product.description || null;
}

function getPackagePrice(pkg: RevenueCatPackage): string {
  return (pkg as any)?.product?.priceString ?? '';
}

function sortPackages(packages: RevenueCatPackage[]): RevenueCatPackage[] {
  const score = (pkg: RevenueCatPackage) => {
    const label = getPackageLabel(pkg).toLowerCase();
    if (label.includes('annual')) return 0;
    if (label.includes('monthly')) return 1;
    return 2;
  };
  return [...packages].sort((a, b) => score(a) - score(b));
}

export default function PaywallScreen() {
  const { feature } = useLocalSearchParams<{ feature?: PremiumFeatureKey }>();
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const {
    availablePackages,
    billingConfigured,
    isLoading,
    offeringsLoading,
    refresh,
    restorePurchases,
    purchasePackage,
    trialEndsAt,
  } = useSubscription();

  const [selectedIdentifier, setSelectedIdentifier] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const trialDaysRemaining = getTrialDaysRemaining(trialEndsAt);
  const packages = useMemo(() => sortPackages(availablePackages), [availablePackages]);
  const selectedPackage =
    packages.find((pkg) => (pkg as any)?.identifier === selectedIdentifier) ?? packages[0] ?? null;
  const featureLabel = feature ? PREMIUM_FEATURE_LABELS[feature] : 'premium AI tools';
  const isTrialEndingSoon = trialDaysRemaining != null && trialDaysRemaining > 0 && trialDaysRemaining <= 3;
  const heroTitle = isTrialEndingSoon
    ? trialDaysRemaining === 1
      ? 'Your free trial ends tomorrow'
      : `Your free trial ends in ${trialDaysRemaining} days`
    : 'Unlock Sova Premium';
  const heroSubtitle = isTrialEndingSoon
    ? `Keep ${featureLabel}, AI recommendations, coach support, and daily insights without interruption. Choose a plan below before your trial runs out.`
    : `Subscribe to keep ${featureLabel} and the rest of Sova's AI features available after your free trial.`;
  const trialStatusLabel =
    trialDaysRemaining == null
      ? null
      : trialDaysRemaining > 0
      ? `${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} left in your 7-day free trial`
      : 'Your 7-day free trial has ended';
  const noPlansAvailable = billingConfigured && !offeringsLoading && packages.length === 0;

  useEffect(() => {
    if (!billingConfigured) return;
    if (availablePackages.length > 0) return;
    void refresh({ loadOfferings: true, syncPurchases: false });
  }, [billingConfigured, availablePackages.length, refresh]);

  const handleContinue = async () => {
    if (noPlansAvailable) {
      await refresh({ loadOfferings: true, syncPurchases: false });
      Alert.alert(
        'Plans unavailable',
        'No subscription plans are available right now. Please try again in a moment.'
      );
      return;
    }

    await handlePurchase();
  };

  const handlePurchase = async () => {
    if (!selectedPackage) return;
    track('subscription_purchase_started', {
      feature: feature ?? 'generic',
      packageIdentifier: (selectedPackage as any)?.identifier ?? null,
    });

    try {
      await purchasePackage(selectedPackage);
      Alert.alert('Subscription active', 'Your premium access is now unlocked.');
      router.back();
    } catch (error) {
      if ((error as { userCancelled?: boolean } | null)?.userCancelled) {
        return;
      }
      Alert.alert('Purchase failed', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const handleRestore = async () => {
    setRestoreLoading(true);
    track('subscription_restore_started', { feature: feature ?? 'generic' });
    try {
      await restorePurchases();
      Alert.alert('Purchases restored', 'Your subscription status has been refreshed.');
      router.back();
    } catch (error) {
      Alert.alert('Restore failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close paywall"
        >
          <IconSymbol name="xmark" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.hero}>
          <View style={[styles.heroBadge, { backgroundColor: colors.accentSoft }]}>
            <IconSymbol name="sparkles" size={28} color={colors.accent} />
          </View>
          <Text style={[Typography.h1, { color: colors.text, textAlign: 'center' }]}>
            {heroTitle}
          </Text>
          <Text
            style={[
              Typography.body,
              { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
            ]}
          >
            {heroSubtitle}
          </Text>

          {trialStatusLabel ? (
            <Text
              style={[
                Typography.captionMedium,
                { color: colors.accent, textAlign: 'center', marginTop: Spacing.md },
              ]}
            >
              {trialStatusLabel}
            </Text>
          ) : null}
        </View>

        <View style={[styles.featuresCard, { borderColor: colors.borderLight }]}>
          <Text style={[Typography.bodySemiBold, { color: colors.text, marginBottom: Spacing.sm }]}>
            {isTrialEndingSoon ? 'Why upgrade now' : 'Included with premium'}
          </Text>
          {[
            'AI sleep coach conversations',
            'Personalized nap, bedtime, and cap recommendations',
            'Daily schedule, forecast, and AI insights',
          ].map((item) => (
            <View key={item} style={styles.featureRow}>
              <IconSymbol name="checkmark.circle.fill" size={18} color={colors.accent} />
              <Text style={[Typography.body, { color: colors.textSecondary, flex: 1 }]}>{item}</Text>
            </View>
          ))}
        </View>

        {!billingConfigured ? (
          <View style={[styles.errorCard, { borderColor: colors.borderLight }]}>
            <Text style={[Typography.bodySemiBold, { color: colors.text }]}>Billing isn&apos;t configured yet</Text>
            <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
              Add your RevenueCat public API keys to the app environment before testing purchases.
            </Text>
          </View>
        ) : offeringsLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
              Loading plans...
            </Text>
          </View>
        ) : noPlansAvailable ? (
          <View style={[styles.errorCard, { borderColor: colors.borderLight }]}>
            <Text style={[Typography.bodySemiBold, { color: colors.text }]}>Plans unavailable</Text>
            <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
              We couldn&apos;t load any subscription options right now. Try again shortly, or restore purchases if you already subscribed.
            </Text>
          </View>
        ) : (
          <View style={styles.planList}>
            {packages.map((pkg) => {
              const identifier = String((pkg as any)?.identifier ?? '');
              const selected = selectedPackage === pkg;
              const subtitle = getPackageSubtitle(pkg);
              const price = getPackagePrice(pkg);
              const label = getPackageLabel(pkg);

              return (
                <TouchableOpacity
                  key={identifier || label}
                  activeOpacity={0.8}
                  style={[
                    styles.planCard,
                    {
                      borderColor: selected ? colors.accent : colors.borderLight,
                      backgroundColor: selected ? colors.accentSoft : 'rgba(255,255,255,0.03)',
                    },
                  ]}
                  onPress={() => setSelectedIdentifier(identifier)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{label}</Text>
                    {subtitle ? (
                      <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>
                        {subtitle}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', marginLeft: Spacing.md }}>
                    <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{price}</Text>
                    {selected ? (
                      <Text style={[Typography.caption, { color: colors.accent, marginTop: 4 }]}>Selected</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Button
          title={
            isLoading ? 'Processing...' : noPlansAvailable ? 'Reload plans' : 'Continue'
          }
          onPress={handleContinue}
          disabled={!billingConfigured || offeringsLoading || isLoading}
          loading={isLoading}
          variant="gradient"
          fullWidth
          style={{ marginTop: Spacing.lg }}
        />

        <Button
          title={restoreLoading ? 'Restoring...' : 'Restore purchases'}
          onPress={handleRestore}
          disabled={!billingConfigured || restoreLoading}
          loading={restoreLoading}
          variant="ghost"
          fullWidth
          style={{ marginTop: Spacing.sm }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0918',
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: Spacing.xs,
  },
  hero: {
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  featuresCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  featureRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  errorCard: {
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  loadingCard: {
    marginTop: Spacing.lg,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  planList: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  planCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
