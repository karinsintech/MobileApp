/**
 * Notifee background events — persists tray alerts when the user taps them
 * while the app is backgrounded, then opens the Notifications menu.
 */

import notifee, { EventType } from '@notifee/react-native';
import { fleetNotificationFromTrayPayload, upsertNotification } from './notificationCenter';
import { navigateToNotificationsScreen } from './notificationNavigation';

try {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type !== EventType.PRESS || !detail.notification) return;

    const data = detail.notification.data ?? {};
    upsertNotification(
      fleetNotificationFromTrayPayload({
        id: String(detail.notification.id ?? data.notificationId ?? Date.now()),
        title: detail.notification.title,
        body: detail.notification.body,
        data,
      }),
    );

    // May queue until NavigationContainer is ready (cold start from tray).
    navigateToNotificationsScreen();
  });
} catch {
  // Native Notifee unavailable — foreground handlers still work after App mounts.
}
