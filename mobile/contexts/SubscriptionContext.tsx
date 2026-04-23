import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { Session } from '@supabase/supabase-js';

import type { PremiumFeatureKey } from '@/constants/subscription';
import { PRO_SUBSCRIPTION_PRODUCT_ID, PRO_SUBSCRIPTION_PRODUCT_IDS } from '@/constants/subscription';
import { supabase } from '@/lib/supabase';
import { track } from '@/services/analytics/track';
import {
  computeIsProFromPurchases,
  finishPurchase,
  getStoreKitSubscriptionSyncPayload,
  getSubscriptions,
  initIapConnection,
  isUserCancelledError,
  registerPurchaseListeners,
  requestSubscription,
  restorePurchases as fetchStorePurchases,
} from '@/services/iapService';
import { getEntitlementStatus } from '@/services/subscription';
import { syncStoreKitSubscriptionToBackend } from '@/services/storekitSubscriptionSync';
import type { EntitlementStatus, PremiumAccessContextValue, RefreshSubscriptionOptions } from '@/types/subscription';

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
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<EntitlementStatus>(DEFAULT_STATUS);
  const [isPro, setIsPro] = useState(false);
  const [subscriptionProducts, setSubscriptionProducts] = useState<PremiumAccessContextValue['subscriptionProducts']>([]);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(Platform.OS === 'ios');
  const [iapReady, setIapReady] = useState(Platform.OS !== 'ios');

  const purchaseInFlightSkuRef = useRef<string | null>(null);
  const purchaseResolveRef = useRef<(() => void) | null>(null);
  const purchaseRejectRef = useRef<((reason?: unknown) => void) | null>(null);
  const purchaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPurchasePromise = useCallback(() => {
    if (purchaseTimeoutRef.current) {
      clearTimeout(purchaseTimeoutRef.current);
      purchaseTimeoutRef.current = null;
    }
    purchaseInFlightSkuRef.current = null;
    purchaseResolveRef.current = null;
    purchaseRejectRef.current = null;
  }, []);

  const loadSubscriptionCatalog = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      setSubscriptionProducts([]);
      setSubscriptionsLoading(false);
      return;
    }
    setSubscriptionsLoading(true);
    try {
      const products = await getSubscriptions([...PRO_SUBSCRIPTION_PRODUCT_IDS]);
      setSubscriptionProducts(products);
    } catch (error) {
      console.warn('[iap] Failed to load subscription products', error);
      setSubscriptionProducts([]);
    } finally {
      setSubscriptionsLoading(false);
    }
  }, []);

  const loadServerEntitlement = useCallback(async () => {
    try {
      const next = await getEntitlementStatus();
      setStatus(next);
      return next;
    } catch (error) {
      console.error('[subscription] Failed to load entitlement status', error);
      setStatus(DEFAULT_STATUS);
      return DEFAULT_STATUS;
    }
  }, []);

  const applyStorePurchases = useCallback(
    async (authSession?: Session | null) => {
      if (Platform.OS !== 'ios') {
        setIsPro(false);
        return;
      }
      try {
        const purchases = await fetchStorePurchases();
        setIsPro(computeIsProFromPurchases(purchases));
        const payload = getStoreKitSubscriptionSyncPayload(purchases);
        if (payload) {
          await syncStoreKitSubscriptionToBackend(null, payload, authSession?.access_token ?? null);
          await loadServerEntitlement();
        }
      } catch (error) {
        console.warn('[iap] Failed to read purchases', error);
        setIsPro(false);
      }
    },
    [loadServerEntitlement]
  );

  const loadForSession = useCallback(
    async (nextSession: Session | null, options: RefreshSubscriptionOptions = {}) => {
      const { loadSubscriptions = false } = options;
      setSession(nextSession);

      if (!nextSession?.user?.id) {
        setStatus(DEFAULT_STATUS);
        setIsPro(false);
        setIsLoading(false);
        setIsReady(true);
        if (loadSubscriptions && Platform.OS === 'ios') {
          await loadSubscriptionCatalog();
        }
        return DEFAULT_STATUS;
      }

      setIsLoading(true);
      const server = await loadServerEntitlement();

      if (Platform.OS === 'ios') {
        if (loadSubscriptions) {
          await loadSubscriptionCatalog();
        }
        await applyStorePurchases(nextSession);
      } else {
        setIsPro(false);
      }

      setIsLoading(false);
      setIsReady(true);
      return server;
    },
    [applyStorePurchases, loadServerEntitlement, loadSubscriptionCatalog]
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  /** iOS: StoreKit connection, product metadata, listeners, and initial purchase read. */
  useEffect(() => {
    if (!isHydrated || Platform.OS !== 'ios') {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await initIapConnection();
        if (cancelled) return;
        setIapReady(true);
        await loadSubscriptionCatalog();
        const {
          data: { session: s },
        } = await supabase.auth.getSession();
        await applyStorePurchases(s);
      } catch (error) {
        console.warn('[iap] Bootstrap failed', error);
        if (!cancelled) {
          setIapReady(false);
          setSubscriptionsLoading(false);
        }
      }
    })();

    const removeListeners = registerPurchaseListeners({
      onPurchaseError: (error) => {
        if (purchaseInFlightSkuRef.current) {
          purchaseRejectRef.current?.(error);
          clearPurchasePromise();
        }
        if (!isUserCancelledError(error)) {
          console.warn('[iap] purchase error', error);
        }
      },
      onPurchaseUpdate: async (purchase) => {
        const isTrackedProduct = PRO_SUBSCRIPTION_PRODUCT_IDS.includes(
          purchase.productId as (typeof PRO_SUBSCRIPTION_PRODUCT_IDS)[number]
        );
        if (!isTrackedProduct) {
          return;
        }

        try {
          await finishPurchase(purchase);
        } catch (e) {
          console.warn('[iap] finishTransaction failed', e);
        }

        try {
          const {
            data: { session: s },
          } = await supabase.auth.getSession();
          await applyStorePurchases(s);
        } catch (e) {
          console.warn('[iap] post-purchase entitlement refresh failed', e);
          setIsPro(computeIsProFromPurchases([purchase]));
        }
        void loadServerEntitlement();

        if (purchaseInFlightSkuRef.current === purchase.productId) {
          purchaseResolveRef.current?.();
          clearPurchasePromise();
        }
      },
    });

    return () => {
      cancelled = true;
      removeListeners();
      clearPurchasePromise();
    };
  }, [applyStorePurchases, clearPurchasePromise, isHydrated, loadServerEntitlement, loadSubscriptionCatalog]);

  useEffect(() => {
    let mounted = true;
    if (!isHydrated) return;

    supabase.auth.getSession().then(({ data: { session: initial } }) => {
      if (!mounted) return;
      void loadForSession(initial);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      void loadForSession(next);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isHydrated, loadForSession]);

  const refresh = useCallback(
    async (options: RefreshSubscriptionOptions = {}) => {
      const {
        data: { session: current },
      } = await supabase.auth.getSession();
      return loadForSession(current, options);
    },
    [loadForSession]
  );

  const purchase = useCallback(
    async (productId: string = PRO_SUBSCRIPTION_PRODUCT_ID) => {
      if (Platform.OS !== 'ios') {
        throw new Error('Purchases are only supported on iOS.');
      }

      setIsLoading(true);
      try {
        await new Promise<void>((resolve, reject) => {
          clearPurchasePromise();
          purchaseInFlightSkuRef.current = productId;
          purchaseResolveRef.current = resolve;
          purchaseRejectRef.current = reject;
          purchaseTimeoutRef.current = setTimeout(() => {
            clearPurchasePromise();
            reject(new Error('Purchase timed out'));
          }, 180_000);

          void requestSubscription(productId).catch((error) => {
            clearPurchasePromise();
            reject(error);
          });
        });

        track('subscription_purchase_completed', { productIdentifier: productId });
        await loadServerEntitlement();
        const {
          data: { session: postPurchaseSession },
        } = await supabase.auth.getSession();
        await applyStorePurchases(postPurchaseSession);
      } catch (error) {
        if (isUserCancelledError(error)) {
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
    [applyStorePurchases, clearPurchasePromise, loadServerEntitlement]
  );

  const restore = useCallback(async () => {
    setIsLoading(true);
    try {
      const {
        data: { session: restoreSession },
      } = await supabase.auth.getSession();
      await applyStorePurchases(restoreSession);
      const next = await loadServerEntitlement();
      track('subscription_restore_success', {
        accessSource: next.accessSource,
      });
    } catch (error) {
      track('subscription_restore_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [applyStorePurchases, loadServerEntitlement]);

  const showPaywall = useCallback(
    (feature?: PremiumFeatureKey) => {
      track('paywall_viewed', {
        feature: feature ?? 'generic',
        userId: session?.user?.id ?? null,
      });
      router.push({
        pathname: '/paywall',
        params: feature ? { feature } : undefined,
      });
    },
    [router, session?.user?.id]
  );

  const mergedHasPremiumAccess = status.hasPremiumAccess || (Boolean(session?.user?.id) && isPro);

  const value = useMemo<PremiumAccessContextValue>(
    () => ({
      ...status,
      hasPremiumAccess: mergedHasPremiumAccess,
      isPro: Boolean(session?.user?.id) && isPro,
      isReady,
      isLoading,
      subscriptionsLoading,
      iapReady,
      subscriptionProducts,
      refresh,
      purchase,
      restore,
      showPaywall,
    }),
    [
      status,
      mergedHasPremiumAccess,
      session?.user?.id,
      isPro,
      isReady,
      isLoading,
      subscriptionsLoading,
      iapReady,
      subscriptionProducts,
      refresh,
      purchase,
      restore,
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
