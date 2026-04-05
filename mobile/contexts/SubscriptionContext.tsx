import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Session } from '@supabase/supabase-js';

import type { PremiumFeatureKey } from '@/constants/subscription';
import { supabase } from '@/lib/supabase';
import { track } from '@/services/analytics/track';
import {
  configureBillingForUser,
  getEntitlementStatus,
  isBillingConfigured,
  purchasePackage as purchaseRevenueCatPackage,
  refreshPremiumStatus,
  restorePurchases as restoreRevenueCatPurchases,
} from '@/services/subscription';
import type {
  EntitlementStatus,
  PremiumAccessContextValue,
  RefreshSubscriptionOptions,
  RevenueCatPackage,
} from '@/types/subscription';

const DEFAULT_STATUS: EntitlementStatus = {
  familyId: null,
  hasPremiumAccess: false,
  hasSubscriptionAccess: false,
  isTrialActive: false,
  accessSource: 'none',
  trialStartedAt: null,
  trialEndsAt: null,
  subscriptionStatus: 'inactive',
  subscriptionProvider: null,
  subscriptionProductId: null,
  subscriptionExpiresAt: null,
};

const SubscriptionContext = createContext<PremiumAccessContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<EntitlementStatus>(DEFAULT_STATUS);
  const [availablePackages, setAvailablePackages] = useState<RevenueCatPackage[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [offeringsLoading, setOfferingsLoading] = useState(true);

  const loadForSession = useCallback(
    async (session: Session | null, options: RefreshSubscriptionOptions = {}) => {
      const { loadOfferings = false, syncPurchases = true } = options;

      setCurrentUserId(session?.user?.id ?? null);

      if (!session?.user?.id) {
        await configureBillingForUser(null);
        setStatus(DEFAULT_STATUS);
        setAvailablePackages([]);
        setOfferingsLoading(false);
        setIsLoading(false);
        setIsReady(true);
        return DEFAULT_STATUS;
      }

      setIsLoading(true);
      if (loadOfferings) setOfferingsLoading(true);

      try {
        await configureBillingForUser(session.user.id);
        const next = await refreshPremiumStatus({ loadOfferings, syncPurchases });
        setStatus(next.status);
        if (loadOfferings) setAvailablePackages(next.availablePackages);
        return next.status;
      } catch (error) {
        console.error('[subscription] Failed to refresh premium status', error);
        const fallbackStatus = await getEntitlementStatus().catch(() => DEFAULT_STATUS);
        setStatus(fallbackStatus);
        if (loadOfferings) setAvailablePackages([]);
        return fallbackStatus;
      } finally {
        if (loadOfferings) setOfferingsLoading(false);
        setIsLoading(false);
        setIsReady(true);
      }
    },
    []
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!isHydrated) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      void loadForSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadForSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isHydrated, loadForSession]);

  const refresh = useCallback(
    async (options: RefreshSubscriptionOptions = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return loadForSession(session, options);
    },
    [loadForSession]
  );

  const purchasePackage = useCallback(
    async (pkg: RevenueCatPackage) => {
      setIsLoading(true);
      try {
        const nextStatus = await purchaseRevenueCatPackage(pkg);
        setStatus(nextStatus);
        track('subscription_purchase_completed', {
          packageIdentifier: (pkg as any)?.identifier ?? null,
          productIdentifier: (pkg as any)?.product?.identifier ?? null,
        });
        await refresh({ loadOfferings: false, syncPurchases: false });
      } catch (error) {
        const userCancelled = Boolean((error as { userCancelled?: boolean } | null)?.userCancelled);
        if (userCancelled) {
          track('subscription_purchase_cancelled');
        } else {
          track('subscription_purchase_failed', {
            message: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [refresh]
  );

  const restorePurchases = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextStatus = await restoreRevenueCatPurchases();
      setStatus(nextStatus);
      track('subscription_restore_success', {
        accessSource: nextStatus.accessSource,
      });
      await refresh({ loadOfferings: false, syncPurchases: false });
    } catch (error) {
      track('subscription_restore_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  const showPaywall = useCallback(
    (feature?: PremiumFeatureKey) => {
      track('paywall_viewed', {
        feature: feature ?? 'generic',
        userId: currentUserId,
      });
      router.push({
        pathname: '/paywall',
        params: feature ? { feature } : undefined,
      });
    },
    [currentUserId, router]
  );

  const value = useMemo<PremiumAccessContextValue>(
    () => ({
      ...status,
      isReady,
      isLoading,
      offeringsLoading,
      billingConfigured: isBillingConfigured(),
      availablePackages,
      refresh,
      purchasePackage,
      restorePurchases,
      showPaywall,
    }),
    [
      status,
      isReady,
      isLoading,
      offeringsLoading,
      availablePackages,
      refresh,
      purchasePackage,
      restorePurchases,
      showPaywall,
    ]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): PremiumAccessContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
}
