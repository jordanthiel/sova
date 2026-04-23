-- Allow native App Store (StoreKit) subscription rows alongside RevenueCat.
ALTER TABLE public.families
  DROP CONSTRAINT IF EXISTS families_subscription_provider_check;

ALTER TABLE public.families
  ADD CONSTRAINT families_subscription_provider_check
  CHECK (subscription_provider IS NULL OR subscription_provider IN ('revenuecat', 'apple'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_provider_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_provider_check
  CHECK (subscription_provider IS NULL OR subscription_provider IN ('revenuecat', 'apple'));
