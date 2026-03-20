import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { PremiumFeatureKey } from '@/constants/subscription';
import { PREMIUM_FEATURE_LABELS } from '@/constants/subscription';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useThemeColors } from '@/hooks/use-theme-color';
import { getTrialDaysRemaining } from '@/services/subscription';
import { Button } from '@/components/ui/Button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Radius, Spacing, Typography } from '@/constants/theme';

interface PremiumUpsellCardProps {
  feature: PremiumFeatureKey;
  title?: string;
  message: string;
  compact?: boolean;
}

export function PremiumUpsellCard({
  feature,
  title,
  message,
  compact = false,
}: PremiumUpsellCardProps) {
  const colors = useThemeColors();
  const { trialEndsAt, showPaywall } = useSubscription();
  const trialDaysRemaining = getTrialDaysRemaining(trialEndsAt);

  const featureLabel = PREMIUM_FEATURE_LABELS[feature];
  const heading = title ?? `Unlock ${featureLabel}`;
  const trialLabel =
    trialDaysRemaining == null
      ? null
      : trialDaysRemaining > 0
      ? `${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} left in your free trial`
      : 'Your 7-day free trial has ended';

  return (
    <View style={[styles.wrapper, compact && styles.compactWrapper]}>
      <LinearGradient
        colors={['rgba(102, 168, 255, 0.18)', 'rgba(102, 168, 255, 0.08)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: colors.borderLight }]}
      >
        <View style={styles.iconWrap}>
          <IconSymbol name="sparkles" size={22} color={colors.accent} />
        </View>

        <Text style={[Typography.h3, { color: colors.text, textAlign: 'center' }]}>{heading}</Text>
        <Text
          style={[
            Typography.body,
            { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.xs },
          ]}
        >
          {message}
        </Text>

        {trialLabel ? (
          <Text
            style={[
              Typography.captionMedium,
              { color: colors.accent, textAlign: 'center', marginTop: Spacing.sm },
            ]}
          >
            {trialLabel}
          </Text>
        ) : null}

        <Button
          title="View plans"
          onPress={() => showPaywall(feature)}
          variant="gradient"
          fullWidth
          style={{ marginTop: Spacing.md }}
        />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  compactWrapper: {
    marginVertical: Spacing.sm,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: Spacing.sm,
  },
});
