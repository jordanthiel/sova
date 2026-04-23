/**
 * StoreKit / react-native-iap integration (iOS only for this app).
 * Centralizes connection lifecycle, product fetch, purchase, restore, and pro detection.
 */
import { Platform } from 'react-native';
import {
  fetchProducts,
  finishTransaction,
  getActiveSubscriptions,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  isUserCancelledError,
} from 'react-native-iap';
import type {
  ActiveSubscription,
  Product,
  ProductSubscription,
  ProductSubscriptionIOS,
  Purchase,
  PurchaseIOS,
} from 'react-native-iap';

import { PRO_SUBSCRIPTION_PRODUCT_IDS } from '@/constants/subscription';

export type IapSubscriptionDisplay = {
  productId: string;
  title: string;
  description: string;
  /** Human-readable price from the store (e.g. "$4.99") */
  localizedPrice: string;
};

export function isIosStore(): boolean {
  return Platform.OS === 'ios';
}

/** Opens the billing session with Apple; call once on cold start (signed-in experience). */
export async function initIapConnection(): Promise<void> {
  if (!isIosStore()) return;
  await initConnection();
}

function isProductSubscription(p: Product): p is ProductSubscription {
  return p.type === 'subs';
}

/** Logs StoreKit `fetchProducts` payload (and Apple `jsonRepresentationIOS` on iOS) for debugging. */
function logFetchProductsResponse(
  products: Awaited<ReturnType<typeof fetchProducts>>,
  label: string = 'fetchProducts'
): void {
  if (products == null) {
    console.log(`[iap] ${label} response: null (no products returned)`);
    return;
  }
  if (!Array.isArray(products)) {
    console.log(`[iap] ${label} response (unexpected shape):`, products);
    return;
  }

  const summary = (products as Product[]).map((p) => {
    const row: Record<string, unknown> = {
      id: p.id,
      type: p.type,
      platform: p.platform,
      title: p.title,
      description: p.description,
      displayPrice: p.displayPrice,
      currency: p.currency,
    };
    if (p.platform === 'ios' && isProductSubscription(p)) {
      row.jsonRepresentationIOS = p.jsonRepresentationIOS;
    }
    return row;
  });

  console.log(`[iap] ${label} response: ${products.length} item(s)`, summary);
}

/**
 * Loads auto-renewable subscription metadata for the given product IDs.
 * Wraps react-native-iap `fetchProducts` with `type: 'subs'`.
 */
export async function getSubscriptions(productIds: string[]): Promise<IapSubscriptionDisplay[]> {
  if (!isIosStore() || productIds.length === 0) return [];

  console.log('[iap] fetchProducts request', { skus: productIds, type: 'subs' });

  let products: Awaited<ReturnType<typeof fetchProducts>>;
  try {
    products = await fetchProducts({ skus: productIds, type: 'subs' });
  } catch (error) {
    console.warn('[iap] fetchProducts failed', error);
    throw error;
  }

  logFetchProductsResponse(products, 'fetchProducts[type=subs]');

  // If Apple returns nothing for a subs-only query, retry with `all` once: helps diagnose
  // StoreKit typing / native bridge edge cases and logs whether SKUs appear as non-subs.
  if (!Array.isArray(products) || products.length === 0) {
    console.log('[iap] fetchProducts[type=subs] returned 0 items; retrying with type=all (diagnostic)');
    try {
      const all = await fetchProducts({ skus: productIds, type: 'all' });
      logFetchProductsResponse(all, 'fetchProducts[type=all]');
      if (Array.isArray(all) && all.length > 0) {
        const skuSet = new Set(productIds);
        const fromAll = (all as Product[]).filter((p) => skuSet.has(p.id) && isProductSubscription(p));
        if (fromAll.length > 0) {
          products = fromAll;
          console.log('[iap] Using subscriptions from type=all fallback:', fromAll.map((p) => p.id));
        } else {
          const ours = (all as Product[]).filter((p) => skuSet.has(p.id));
          if (ours.length > 0) {
            console.warn(
              '[iap] StoreKit returned products for your SKUs but none are type "subs". Check App Store Connect product type (must be auto-renewable subscription):',
              ours.map((p) => ({ id: p.id, type: p.type }))
            );
          }
        }
      }
    } catch (fallbackError) {
      console.warn('[iap] fetchProducts[type=all] fallback failed', fallbackError);
    }
  }

  if (!products?.length) {
    console.warn(
      '[iap] No products from Apple for SKUs:',
      productIds.join(', '),
      '\nTypical fixes: (1) Bundle ID in Xcode matches the App Store Connect app that owns these IAPs, ' +
        '(2) Agreements, Tax, and Banking → Paid Applications is Active (banking complete), ' +
        '(3) Each subscription has pricing + metadata and is not Missing Metadata, ' +
        '(4) Test on a physical device with a Sandbox Apple ID (simulator often returns empty for ASC), ' +
        '(5) New IAPs can take time to propagate; retry later.'
    );
    return [];
  }

  return (products as ProductSubscription[]).map((p) => ({
    productId: p.id,
    title: p.title,
    description: p.description,
    localizedPrice: p.displayPrice,
  }));
}

/**
 * Starts the subscription purchase UI. Completion is delivered through StoreKit
 * (`purchaseUpdatedListener` / `purchaseErrorListener`), not this promise alone.
 */
export async function requestSubscription(productId: string): Promise<void> {
  if (!isIosStore()) {
    throw new Error('Subscriptions are only available on iOS.');
  }
  await requestPurchase({
    type: 'subs',
    request: {
      apple: { sku: productId },
    },
  });
}

/**
 * StoreKit 2 / Nitro often exposes active subs via `getActiveSubscriptions` while
 * `getAvailablePurchases` is empty after transactions are finished — merge both.
 */
function activeSubscriptionToPurchaseIOS(sub: ActiveSubscription): PurchaseIOS {
  return {
    id: sub.transactionId,
    productId: sub.productId,
    purchaseState: sub.isActive ? 'purchased' : 'unknown',
    transactionDate: sub.transactionDate,
    transactionId: sub.transactionId,
    quantity: 1,
    platform: 'ios',
    store: 'apple',
    isAutoRenewing: true,
    expirationDateIOS: sub.expirationDateIOS ?? null,
  } as PurchaseIOS;
}

/**
 * Restore flow: active subscriptions (preferred on iOS) plus any available purchase records.
 */
export async function restorePurchases(): Promise<Purchase[]> {
  if (!isIosStore()) return [];

  let fromActive: Purchase[] = [];
  try {
    const subs = await getActiveSubscriptions([...PRO_SUBSCRIPTION_PRODUCT_IDS]);
    fromActive = subs.filter((s) => s.isActive).map((s) => activeSubscriptionToPurchaseIOS(s));
  } catch (e) {
    console.warn('[iap] getActiveSubscriptions failed', e);
  }

  let fromAvailable: Purchase[] = [];
  try {
    fromAvailable = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
  } catch (e) {
    console.warn('[iap] getAvailablePurchases failed', e);
  }

  return [...fromActive, ...fromAvailable];
}

/**
 * Placeholder for receipt / JWS validation (e.g. App Store Server API).
 * Keeps a stable call site for when server-side validation is added.
 */
export async function validateReceipt(): Promise<{ valid: boolean; note: string }> {
  if (!isIosStore()) {
    return { valid: false, note: 'Not iOS' };
  }
  return { valid: true, note: 'Stub: no server validation yet' };
}

function expirationStillValid(purchase: PurchaseIOS): boolean {
  if (purchase.expirationDateIOS == null) return true;
  return purchase.expirationDateIOS > Date.now();
}

/** Whether a single StoreKit purchase currently grants Pro for our known product IDs. */
export function purchaseGrantsPro(
  purchase: Purchase,
  productIds: readonly string[] = PRO_SUBSCRIPTION_PRODUCT_IDS
): boolean {
  if (!productIds.includes(purchase.productId as (typeof PRO_SUBSCRIPTION_PRODUCT_IDS)[number])) return false;
  if (purchase.purchaseState === 'pending') return false;
  // StoreKit 2 / Nitro may omit or vary `purchaseState` while `expirationDateIOS` is still valid.
  const ios = purchase as PurchaseIOS;
  return expirationStillValid(ios);
}

export function computeIsProFromPurchases(
  purchases: Purchase[],
  productIds: readonly string[] = PRO_SUBSCRIPTION_PRODUCT_IDS
): boolean {
  return purchases.some((p) => purchaseGrantsPro(p, productIds));
}

/** Fallback when StoreKit omits `expirationDateIOS` (renewals sometimes report null briefly). */
const STOREKIT_SYNC_FALLBACK_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Picks the longest-lived active Pro purchase for syncing subscription expiry to Supabase.
 */
export function getStoreKitSubscriptionSyncPayload(
  purchases: Purchase[],
  productIds: readonly string[] = PRO_SUBSCRIPTION_PRODUCT_IDS
): { productId: string; subscriptionExpiresAt: string } | null {
  const candidates = purchases.filter((p) => purchaseGrantsPro(p, productIds));
  if (candidates.length === 0) return null;

  let best: Purchase | null = null;
  let bestExpMs = -1;
  for (const p of candidates) {
    const ios = p as PurchaseIOS;
    const raw = ios.expirationDateIOS;
    const expMs = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0;
    if (expMs > bestExpMs) {
      bestExpMs = expMs;
      best = p;
    }
  }
  if (!best) return null;

  const ios = best as PurchaseIOS;
  const subscriptionExpiresAt =
    ios.expirationDateIOS != null && !Number.isNaN(ios.expirationDateIOS)
      ? new Date(ios.expirationDateIOS).toISOString()
      : new Date(Date.now() + STOREKIT_SYNC_FALLBACK_MS).toISOString();

  return { productId: best.productId, subscriptionExpiresAt };
}

export async function finishPurchase(purchase: Purchase): Promise<void> {
  await finishTransaction({ purchase, isConsumable: false });
}

export type IapListenersParams = {
  onPurchaseUpdate: (purchase: Purchase) => Promise<void>;
  onPurchaseError: (error: unknown) => void;
};

/**
 * Registers global purchase listeners once. Call after `initIapConnection`.
 * Returns a cleanup function that removes listeners.
 */
export function registerPurchaseListeners({ onPurchaseUpdate, onPurchaseError }: IapListenersParams): () => void {
  const updated = purchaseUpdatedListener((purchase) => {
    void onPurchaseUpdate(purchase);
  });
  const errors = purchaseErrorListener((error) => {
    onPurchaseError(error);
  });
  return () => {
    updated.remove();
    errors.remove();
  };
}

export { isUserCancelledError };
