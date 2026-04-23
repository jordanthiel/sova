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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  PREMIUM_FEATURE_LABELS,
  PRO_SUBSCRIPTION_PRODUCT_IDS,
  SOVA_ANNUAL,
  SOVA_MONTHLY,
  type PremiumFeatureKey,
} from '@/constants/subscription';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { isUserCancelledError } from '@/services/iapService';
import { getTrialDaysRemaining } from '@/services/subscription';
import { track } from '@/services/analytics/track';
import type { IapSubscriptionDisplay } from '@/services/iapService';

function sortSubscriptionProducts(products: IapSubscriptionDisplay[]): IapSubscriptionDisplay[] {
  const rank = (id: string) => {
    if (id === SOVA_ANNUAL) return 0;
    if (id === SOVA_MONTHLY) return 1;
    return 2;
  };
  return [...products].sort((a, b) => rank(a.productId) - rank(b.productId));
}

function planShortLabel(productId: string): string {
  if (productId === SOVA_ANNUAL) return 'Annual';
  if (productId === SOVA_MONTHLY) return 'Monthly';
  return 'Plan';
}

export default function PaywallScreen() {
  const { feature } = useLocalSearchParams<{ feature?: PremiumFeatureKey }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const {
    subscriptionProducts,
    iapReady,
    isLoading,
    subscriptionsLoading,
    refresh,
    restore,
    purchase,
    trialEndsAt,
  } = useSubscription();

  const [restoreLoading, setRestoreLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const trialDaysRemaining = getTrialDaysRemaining(trialEndsAt);
  const sortedProducts = useMemo(() => sortSubscriptionProducts(subscriptionProducts), [subscriptionProducts]);

  useEffect(() => {
    if (sortedProducts.length === 0) return;
    setSelectedProductId((prev) => {
      if (prev && sortedProducts.some((p) => p.productId === prev)) return prev;
      return sortedProducts[0]!.productId;
    });
  }, [sortedProducts]);

  const selectedProduct =
    sortedProducts.find((p) => p.productId === selectedProductId) ?? sortedProducts[0] ?? null;
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
  const noPlansAvailable = iapReady && !subscriptionsLoading && subscriptionProducts.length === 0;

  useEffect(() => {
    if (!iapReady) return;
    if (subscriptionProducts.length > 0) return;
    void refresh({ loadSubscriptions: true });
  }, [iapReady, subscriptionProducts.length, refresh]);

  const handleContinue = async () => {
    if (noPlansAvailable) {
      await refresh({ loadSubscriptions: true });
      Alert.alert(
        'Plans unavailable',
        'No subscription plans are available right now. Please try again in a moment.'
      );
      return;
    }

    await handlePurchase();
  };

  const handlePurchase = async () => {
    if (!selectedProduct) return;
    track('subscription_purchase_started', {
      feature: feature ?? 'generic',
      productIdentifier: selectedProduct.productId,
    });

    try {
      await purchase(selectedProduct.productId);
      Alert.alert('Subscription active', 'Your premium access is now unlocked.');
      router.back();
    } catch (error) {
      if (isUserCancelledError(error)) {
        return;
      }
      Alert.alert('Purchase failed', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const handleRestore = async () => {
    setRestoreLoading(true);
    track('subscription_restore_started', { feature: feature ?? 'generic' });
    try {
      await restore();
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
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Spacing.xxl + insets.bottom + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
          <Text style={[Typography.h1, { color: colors.text, textAlign: 'center' }]}>{heroTitle}</Text>
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

        {!iapReady ? (
          <View style={[styles.errorCard, { borderColor: colors.borderLight }]}>
            <Text style={[Typography.bodySemiBold, { color: colors.text }]}>Store isn&apos;t available</Text>
            <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
              In-App Purchases require a physical iOS device with StoreKit. If you are on a simulator, use a real device
              with a Sandbox Apple ID to test subscriptions.
            </Text>
          </View>
        ) : subscriptionsLoading ? (
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
              We couldn&apos;t load any subscription options right now. Confirm{' '}
              <Text style={{ fontWeight: '600' }}>{PRO_SUBSCRIPTION_PRODUCT_IDS.join(', ')}</Text> exist in App Store
              Connect, then try again or restore purchases if you already subscribed.
            </Text>
          </View>
        ) : sortedProducts.length > 0 ? (
          <View style={styles.planList}>
            {sortedProducts.map((product) => {
              const selected = selectedProduct?.productId === product.productId;
              return (
                <TouchableOpacity
                  key={product.productId}
                  activeOpacity={0.8}
                  style={[
                    styles.planCard,
                    {
                      borderColor: selected ? colors.accent : colors.borderLight,
                      backgroundColor: selected ? colors.accentSoft : 'rgba(255,255,255,0.03)',
                    },
                  ]}
                  onPress={() => setSelectedProductId(product.productId)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
                      {planShortLabel(product.productId)}
                    </Text>
                    {product.description ? (
                      <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>
                        {product.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', marginLeft: Spacing.md }}>
                    <Text style={[Typography.bodySemiBold, { color: colors.text }]}>{product.localizedPrice}</Text>
                    {selected ? (
                      <Text style={[Typography.caption, { color: colors.accent, marginTop: 4 }]}>Selected</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <Button
          title={isLoading ? 'Processing...' : noPlansAvailable ? 'Reload plans' : 'Subscribe'}
          onPress={handleContinue}
          disabled={!iapReady || subscriptionsLoading || isLoading || !selectedProduct}
          loading={isLoading}
          variant="gradient"
          fullWidth
          style={{ marginTop: Spacing.lg }}
        />

        <Button
          title={restoreLoading ? 'Restoring...' : 'Restore purchases'}
          onPress={handleRestore}
          disabled={!iapReady || restoreLoading}
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
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
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
