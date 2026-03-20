export type TrackableEvent =
  | 'log_nap_start'
  | 'log_nap_end'
  | 'log_night_start'
  | 'log_night_end'
  | 'log_event_manual'
  | 'log_note'
  | 'ask_ai'
  | 'insight_ask_coach'
  | 'ai_coach_chip_tap'
  | 'ai_explain_recommendation'
  | 'apply_suggestion'
  | 'delay_recommendation'
  | 'skip_recommendation'
  | 'refresh_recommendation'
  | 'start_day'
  | 'open_coach_from_why'
  | 'change_ai_preference'
  | 'coach_memory_save'
  | 'coach_menu_open'
  | 'invite_caregiver'
  | 'switch_baby'
  | 'view_insights'
  | 'view_today'
  | 'view_log'
  | 'view_settings'
  | 'toggle_notification'
  | 'onboarding_complete'
  | 'photo_upload'
  | 'log_view_mode'
  | 'request_account_deletion_tap'
  | 'import_sleep_csv'
  | 'paywall_viewed'
  | 'premium_feature_blocked'
  | 'subscription_purchase_started'
  | 'subscription_purchase_completed'
  | 'subscription_purchase_cancelled'
  | 'subscription_purchase_failed'
  | 'subscription_restore_started'
  | 'subscription_restore_success'
  | 'subscription_restore_failed';

/**
 * Analytics provider interface.
 * Implement this to connect a real analytics service (Amplitude, Mixpanel, PostHog, etc.)
 */
export interface AnalyticsProvider {
  init(): Promise<void>;
  track(event: TrackableEvent, props?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  reset(): void;
}

class ConsoleProvider implements AnalyticsProvider {
  async init() {}
  track(event: TrackableEvent, props?: Record<string, unknown>) {
    if (__DEV__) {
      console.log(`[Analytics] ${event}`, props ?? '');
    }
  }
  identify(userId: string, traits?: Record<string, unknown>) {
    if (__DEV__) {
      console.log(`[Analytics] identify: ${userId}`, traits ?? '');
    }
  }
  reset() {
    if (__DEV__) {
      console.log('[Analytics] reset');
    }
  }
}

let activeProvider: AnalyticsProvider = new ConsoleProvider();

/**
 * Set a custom analytics provider. Call this at app startup.
 *
 * Example with PostHog:
 * ```
 * import PostHog from 'posthog-react-native';
 * setProvider({
 *   async init() { await PostHog.init('phc_xxx'); },
 *   track(event, props) { PostHog.capture(event, props); },
 *   identify(userId, traits) { PostHog.identify(userId, traits); },
 *   reset() { PostHog.reset(); },
 * });
 * ```
 */
export function setProvider(provider: AnalyticsProvider): void {
  activeProvider = provider;
}

export function track(
  eventName: TrackableEvent,
  props?: Record<string, unknown>
): void {
  activeProvider.track(eventName, props);
}

export function identify(
  userId: string,
  traits?: Record<string, unknown>
): void {
  activeProvider.identify(userId, traits);
}

export function resetAnalytics(): void {
  activeProvider.reset();
}

export async function initAnalytics(): Promise<void> {
  await activeProvider.init();
}
