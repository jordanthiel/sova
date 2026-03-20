import { useCallback } from 'react';

import type { PremiumFeatureKey } from '@/constants/subscription';
import { track } from '@/services/analytics/track';
import { toPremiumAccessError } from '@/services/subscription';
import { useSubscription } from '@/contexts/SubscriptionContext';

export function usePremiumGate() {
  const subscription = useSubscription();

  const requireAccess = useCallback(
    (feature: PremiumFeatureKey) => {
      if (subscription.hasPremiumAccess) {
        return true;
      }

      track('premium_feature_blocked', {
        feature,
        accessSource: subscription.accessSource,
        trialEndsAt: subscription.trialEndsAt,
      });
      subscription.showPaywall(feature);
      throw toPremiumAccessError(subscription, feature);
    },
    [subscription]
  );

  return {
    ...subscription,
    requireAccess,
  };
}
