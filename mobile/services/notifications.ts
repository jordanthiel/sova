import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
