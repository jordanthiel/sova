import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Get Expo push token for this device. Requires EAS projectId in app config (extra.eas.projectId) for production. */
export async function getExpoPushToken(): Promise<string | null> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  if (Platform.OS === 'web') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    if (__DEV__) {
      console.warn('[Notifications] expo_push_token requires extra.eas.projectId in app config (EAS builds)');
    }
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData?.data ?? null;
  } catch (err) {
    console.error('[Notifications] Failed to get Expo push token:', err);
    return null;
  }
}

/** Store Expo push token for the current user in profiles. Call after login. */
export async function registerPushToken(userId: string, token: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        expo_push_token: token,
        expo_push_token_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw error;
    if (__DEV__) {
      console.log('[Notifications] Push token registered for user');
    }
  } catch (err) {
    console.error('[Notifications] Failed to register push token:', err);
  }
}

/** Request permission, get token, and store for the given user. Call on app init when user is logged in. */
export async function registerForPushNotifications(userId: string): Promise<void> {
  const token = await getExpoPushToken();
  if (token) await registerPushToken(userId, token);
}

export async function scheduleCapReminder(
  datetime: string,
  babyId: string,
  eventId: string
): Promise<string | null> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.warn('[Notifications] Permission not granted for cap reminder');
    return null;
  }

  const triggerDate = new Date(datetime);
  const secondsUntil = Math.max(
    Math.round((triggerDate.getTime() - Date.now()) / 1000),
    5
  );

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time to wake baby!',
        body: 'Nap cap reached — consider waking baby to protect bedtime.',
        data: { type: 'cap_reminder', babyId, eventId },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
      },
    });

    if (__DEV__) {
      console.log(`[Notifications] Scheduled cap reminder ${id} in ${secondsUntil}s`);
    }
    return id;
  } catch (err) {
    console.error('[Notifications] Failed to schedule cap reminder:', err);
    return null;
  }
}

export async function cancelCapReminder(eventId: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.content.data?.eventId === eventId) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        if (__DEV__) {
          console.log(`[Notifications] Cancelled cap reminder ${notif.identifier}`);
        }
      }
    }
  } catch (err) {
    console.error('[Notifications] Failed to cancel cap reminder:', err);
  }
}

export async function scheduleNapWindowReminder(
  datetime: string,
  babyId: string
): Promise<string | null> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  const triggerDate = new Date(datetime);
  const secondsUntil = Math.max(
    Math.round((triggerDate.getTime() - Date.now()) / 1000),
    5
  );

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Nap window approaching',
        body: 'The recommended nap window is coming up. Consider starting the nap routine.',
        data: { type: 'nap_window', babyId },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
      },
    });
    return id;
  } catch (err) {
    console.error('[Notifications] Failed to schedule nap window reminder:', err);
    return null;
  }
}

export async function scheduleBedtimeReminder(
  datetime: string,
  babyId: string
): Promise<string | null> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  const triggerDate = new Date(datetime);
  const secondsUntil = Math.max(
    Math.round((triggerDate.getTime() - Date.now()) / 1000),
    5
  );

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Bedtime soon',
        body: 'Time to start the bedtime routine!',
        data: { type: 'bedtime', babyId },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
      },
    });
    return id;
  } catch (err) {
    console.error('[Notifications] Failed to schedule bedtime reminder:', err);
    return null;
  }
}

/** Cancel nap_window, bedtime, and wake_window_alert reminders (keeps cap_reminder intact). */
export async function cancelNapWindowBedtimeAndWakeWindowReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const typesToCancel = ['nap_window', 'bedtime', 'wake_window_alert'];
    for (const notif of scheduled) {
      const type = notif.content.data?.type;
      if (type && typesToCancel.includes(type)) {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        if (__DEV__) {
          console.log(`[Notifications] Cancelled ${type} reminder ${notif.identifier}`);
        }
      }
    }
  } catch (err) {
    console.error('[Notifications] Failed to cancel nap/bedtime/wake reminders:', err);
  }
}

export async function scheduleWakeWindowAlert(
  datetime: string,
  babyId: string
): Promise<string | null> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  const triggerDate = new Date(datetime);
  const secondsUntil = Math.max(
    Math.round((triggerDate.getTime() - Date.now()) / 1000),
    5
  );

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Wake window ending',
        body: 'Consider starting the nap routine soon to avoid overtiredness.',
        data: { type: 'wake_window_alert', babyId },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
      },
    });
    return id;
  } catch (err) {
    console.error('[Notifications] Failed to schedule wake window alert:', err);
    return null;
  }
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
