/**
 * Firebase Cloud Messaging + Notifee — delivers and displays Karins Fleet push alerts.
 *
 * Requires `android/app/google-services.json` from the Firebase console
 * (package name: com.karins). Without it, push calls no-op safely.
 *
 * Tray layout: put the full alert copy in `body` (single line) so the system
 * notification box shows the complete message without expand/collapse.
 * MessagingStyle / InboxStyle / BigText are avoided — OEMs reverse, truncate,
 * or hide content behind a chevron with those styles.
 */

import { AppState, Platform } from 'react-native';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  EventType,
  AuthorizationStatus,
} from '@notifee/react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import {
  mapRemoteMessageToNotification,
  resolveNotificationImageUrl,
  upsertNotification,
} from './notificationCenter';
import { navigateToNotificationsScreen } from './notificationNavigation';
import type { FleetNotification } from './notificationTypes';
import {
  getMessagingInstance,
  isFirebaseMessagingAvailable,
  loadMessagingModuleForAuthStatus,
} from './messagingProvider';

export const NOTIFICATION_CATEGORIES: readonly string[] = [
  'low_wallet',
  'suspicious_toll',
  'double_debit',
  'claim_update',
  'echallan',
  'rc_expiry',
  'dl_expiry',
  'recharge_status',
  'product_update',
];

const ANDROID_CHANNEL_ID = 'karins_fleet_alerts_high';
export const ANDROID_NOTIFICATION_SMALL_ICON = 'ic_stat_notification';
/**
 * Fallback drawable/mipmap names when the preferred status icon is missing after
 * R8 resource shrinking — prevents a hard native abort on OEM phones.
 */
const ANDROID_NOTIFICATION_SMALL_ICON_FALLBACKS = [
  ANDROID_NOTIFICATION_SMALL_ICON,
  'ic_launcher',
] as const;
/**
 * Full-color K launcher shown as the left tray avatar (Twitter-style).
 * smallIcon stays a white silhouette for the status bar; without largeIcon
 * some OEMs promote that silhouette (the bell) to the whole left slot.
 */
const ANDROID_NOTIFICATION_LARGE_ICON = 'ic_launcher';
/** Matches android/app/src/main/res/values/colors.xml notification_accent. */
const ANDROID_NOTIFICATION_COLOR = '#16B7F3';
let openHandlersRegistered = false;
let notifeeHandlersRegistered = false;
/** Serialize tray writes — parallel Notifee displays after dashboard sync can native-crash OEMs. */
let displayQueue: Promise<unknown> = Promise.resolve();
/** Remember which smallIcon name succeeded so we do not keep probing on every alert. */
let resolvedAndroidSmallIcon: string | null = null;

/**
 * Flatten multi-line detail into one tray line so Android shows the full message
 * in the notification box instead of hiding lines behind expand/collapse.
 */
function formatTrayBody(notification: Pick<FleetNotification, 'body' | 'detail'>): string {
  const fullText = (notification.detail ?? notification.body).trim();
  if (!fullText) return 'Karins Fleet';
  // Keep intentional sections readable in one row (comma-separated, no BigText chevron).
  return fullText.replace(/\s*\n+\s*/g, ', ');
}

/** Notifee requires string/number data values — booleans/nulls throw and some OEMs abort. */
function toNotifeeData(
  data?: Record<string, unknown> | null,
): Record<string, string> {
  if (!data) return {};
  const out: Record<string, string> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    out[key] = typeof value === 'string' ? value : String(value);
  });
  return out;
}

/** Only remote http(s) art is safe for BigPicture — resource names / relative paths crash natively. */
function isRemoteImageUrl(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url.trim());
}

/** Shared Android tray chrome so local + FCM alerts look the same across OEMs. */
function buildAndroidDisplayOptions(
  options?: {
    onlyAlertOnce?: boolean;
    imageUrl?: string | null;
    smallIcon?: string;
  },
) {
  // Intentionally ignore imageUrl for the tray row.
  // Notifee BigPicture downloads the bitmap on the native thread and OOM-crashes
  // low-RAM / aggressive OEMs; in-app Preview already shows the artwork safely.
  void options?.imageUrl;

  return {
    channelId: ANDROID_CHANNEL_ID,
    pressAction: { id: 'default' as const },
    smallIcon: options?.smallIcon ?? resolvedAndroidSmallIcon ?? ANDROID_NOTIFICATION_SMALL_ICON,
    // K logo in the shade; bell remains the status-bar / badge overlay.
    largeIcon: ANDROID_NOTIFICATION_LARGE_ICON,
    circularLargeIcon: true,
    color: ANDROID_NOTIFICATION_COLOR,
    importance: AndroidImportance.HIGH,
    sound: 'default',
    onlyAlertOnce: options?.onlyAlertOnce ?? false,
  };
}

/** Run Notifee display work one-at-a-time to avoid native races on multi-alert dashboard sync. */
function enqueueNotifeeDisplay<T>(work: () => Promise<T>): Promise<T> {
  const run = displayQueue.then(work, work);
  // Keep the chain alive even when one display rejects.
  displayQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Post a tray notification, trying safe smallIcon fallbacks.
 * Some OEM builds abort the process when Notifee gets a missing drawable name.
 */
async function displayWithSafeAndroidIcon(
  payload: Parameters<typeof notifee.displayNotification>[0],
  options?: { onlyAlertOnce?: boolean; imageUrl?: string | null },
): Promise<void> {
  const iconCandidates = resolvedAndroidSmallIcon
    ? [resolvedAndroidSmallIcon]
    : [...ANDROID_NOTIFICATION_SMALL_ICON_FALLBACKS];

  let lastError: unknown;
  for (const smallIcon of iconCandidates) {
    try {
      await enqueueNotifeeDisplay(() =>
        notifee.displayNotification({
          ...payload,
          android: buildAndroidDisplayOptions({
            onlyAlertOnce: options?.onlyAlertOnce,
            imageUrl: options?.imageUrl,
            smallIcon,
          }),
        }),
      );
      resolvedAndroidSmallIcon = smallIcon;
      return;
    } catch (error) {
      lastError = error;
      // Try the next drawable — do not rethrow until all candidates fail.
    }
  }

  // Last resort: omit smallIcon and let Notifee / Android use the app default.
  try {
    await enqueueNotifeeDisplay(() =>
      notifee.displayNotification({
        ...payload,
        android: {
          channelId: ANDROID_CHANNEL_ID,
          pressAction: { id: 'default' as const },
          largeIcon: ANDROID_NOTIFICATION_LARGE_ICON,
          circularLargeIcon: true,
          color: ANDROID_NOTIFICATION_COLOR,
          importance: AndroidImportance.HIGH,
          sound: 'default',
          onlyAlertOnce: options?.onlyAlertOnce ?? false,
        },
      }),
    );
  } catch {
    throw lastError ?? new Error('Failed to display notification');
  }
}

/** Pull alerts already shown in the system tray into the in-app inbox. */
export async function syncInboxFromSystemTray(): Promise<void> {
  try {
    const displayed = await notifee.getDisplayedNotifications();
    displayed.forEach(({ notification }) => {
      if (!notification?.id) return;

      const data = notification.data ?? {};
      const image =
        resolveNotificationImageUrl(
          String(data.image ?? data.imageUrl ?? data.picture ?? ''),
        ) ?? undefined;
      upsertNotification({
        id: String(notification.id),
        category: String(data.category ?? data.type ?? 'product_update'),
        title: notification.title ?? 'Karins Fleet',
        body: notification.body ?? '',
        image,
        createdAt: String(data.createdAt ?? new Date().toISOString()),
        read: false,
        data: Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, String(value)]),
        ),
      });
    });
  } catch {
    /* tray sync is best-effort */
  }
}

async function requestAndroidNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return true;

  const permission = PERMISSIONS.ANDROID.POST_NOTIFICATIONS;
  const current = await check(permission);
  if (current === RESULTS.GRANTED) return true;
  if (current === RESULTS.BLOCKED) return false;

  const result = await request(permission);
  return result === RESULTS.GRANTED;
}

/** OS permission for local Notifee banners — does not require Firebase. */
async function ensureLocalNotificationPermission(): Promise<boolean> {
  // Read-only check — safe without a foreground Activity.
  const alreadyGranted = await canShowLocalNotifications();
  if (alreadyGranted) return true;

  // Notifee.requestPermission() needs PermissionAwareActivity; on Vivo/Android 16
  // it logs "Unable to get permissionAwareActivity" when called too early.
  if (AppState.currentState !== 'active') {
    return false;
  }

  if (Platform.OS === 'android') {
    // Android 13+ — system POST_NOTIFICATIONS dialog via react-native-permissions.
    if (Platform.Version >= 33) {
      return requestAndroidNotificationPermission();
    }
    return true;
  }

  try {
    const settings = await notifee.requestPermission();
    return (
      settings.authorizationStatus === AuthorizationStatus.AUTHORIZED
      || settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

async function canShowLocalNotifications(): Promise<boolean> {
  try {
    const settings = await notifee.getNotificationSettings();
    if (Platform.OS === 'android' && Platform.Version < 33) {
      return true;
    }
    return (
      settings.authorizationStatus === AuthorizationStatus.AUTHORIZED
      || settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

export const pushService = {
  isAvailable: isFirebaseMessagingAvailable,

  /** Create the Android notification channel used by FCM + Notifee. */
  async ensureAndroidChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      await notifee.createChannel({
        id: ANDROID_CHANNEL_ID,
        name: 'Karins Fleet Alerts',
        importance: AndroidImportance.HIGH,
        vibration: true,
      });
    } catch {
      /* channel creation is best-effort */
    }
  },

  /** Request OS permission so local wallet alerts can appear in the tray. */
  async ensureNotificationPermission(): Promise<boolean> {
    const granted = await ensureLocalNotificationPermission();
    if (granted) return true;
    return canShowLocalNotifications();
  },

  /** Show a fleet alert in the system tray (dashboard-derived or local). */
  async displayLocalNotification(
    notification: FleetNotification,
    options?: { onlyAlertOnce?: boolean },
  ): Promise<boolean> {
    try {
      await pushService.ensureAndroidChannel();

      let canShow = await canShowLocalNotifications();
      if (!canShow) {
        canShow = await ensureLocalNotificationPermission();
      }
      if (!canShow) return false;

      // Full detail in body (one line) — no short/collapse summary and no BigText chevron.
      const trayBody = formatTrayBody(notification);
      const imageUrl = resolveNotificationImageUrl(
        notification.image ?? notification.data?.image,
      );
      await displayWithSafeAndroidIcon(
        {
          id: String(notification.id),
          title: notification.title,
          body: trayBody,
          data: toNotifeeData({
            category: notification.category,
            createdAt: notification.createdAt,
            ...(notification.data ?? {}),
            ...(imageUrl ? { image: imageUrl } : {}),
          }),
          ios: {
            foregroundPresentationOptions: {
              alert: true,
              badge: true,
              sound: true,
            },
            ...(isRemoteImageUrl(imageUrl)
              ? {
                  attachments: [{ url: imageUrl }],
                }
              : {}),
          },
        },
        {
          onlyAlertOnce: options?.onlyAlertOnce,
          imageUrl,
        },
      );
      return true;
    } catch {
      return false;
    }
  },

  /** Register Notifee tap/delivery handlers — works without Firebase. */
  setupNotifeeHandlers(): void {
    if (notifeeHandlersRegistered) return;
    notifeeHandlersRegistered = true;

    try {
      notifee.onForegroundEvent(({ type, detail }) => {
        if (type === EventType.DELIVERED && detail.notification) {
          const data = detail.notification.data ?? {};
          const image =
            resolveNotificationImageUrl(
              String(data.image ?? data.imageUrl ?? data.picture ?? ''),
            ) ?? undefined;
          upsertNotification({
            id: String(detail.notification.id ?? Date.now()),
            category: String(data.category ?? data.type ?? 'product_update'),
            title: detail.notification.title ?? 'Karins Fleet',
            body: detail.notification.body ?? '',
            image,
            createdAt: String(data.createdAt ?? new Date().toISOString()),
            read: false,
            data: Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)]),
            ),
          });
          return;
        }

        if (type === EventType.PRESS && detail.notification) {
          const data = detail.notification.data ?? {};
          const image =
            resolveNotificationImageUrl(
              String(data.image ?? data.imageUrl ?? data.picture ?? ''),
            ) ?? undefined;
          upsertNotification({
            id: String(detail.notification.id ?? Date.now()),
            category: String(data.category ?? data.type ?? 'product_update'),
            title: detail.notification.title ?? 'Karins Fleet',
            body: detail.notification.body ?? '',
            image,
            createdAt: String(data.createdAt ?? new Date().toISOString()),
            read: false,
            data: Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)]),
            ),
          });
          // Tray tap → Notifications menu (bell inbox).
          navigateToNotificationsScreen();
        }
      });
    } catch {
      /* handlers are best-effort */
    }
  },

  /** Request OS push permission; returns whether alerts can be shown. */
  async requestPermission(): Promise<boolean> {
    const localGranted = await ensureLocalNotificationPermission();
    if (!localGranted && Platform.OS === 'android' && Platform.Version >= 33) {
      return false;
    }

    const messaging = getMessagingInstance();
    if (!messaging) return localGranted;

    try {
      const status = await messaging.requestPermission();
      const moduleRef = loadMessagingModuleForAuthStatus();
      if (!moduleRef) return localGranted;

      const { AUTHORIZED, PROVISIONAL } = moduleRef.AuthorizationStatus;
      return status === AUTHORIZED || status === PROVISIONAL || localGranted;
    } catch {
      return localGranted;
    }
  },

  /** Fetch the FCM registration token for this device, or null on error. */
  async getToken(): Promise<string | null> {
    const messaging = getMessagingInstance();
    if (!messaging) return null;

    try {
      // iOS will not mint an FCM token until the device is registered for remote messages.
      if (Platform.OS === 'ios') {
        const alreadyRegistered =
          typeof messaging.isDeviceRegisteredForRemoteMessages === 'boolean'
            ? messaging.isDeviceRegisteredForRemoteMessages
            : false;
        if (!alreadyRegistered) {
          await messaging.registerDeviceForRemoteMessages();
        }
      }
      return await messaging.getToken();
    } catch {
      return null;
    }
  },

  /** Re-register with backend when Firebase rotates the device token. */
  onTokenRefresh(onRefresh: (token: string) => void): () => void {
    const messaging = getMessagingInstance();
    if (!messaging) return () => {};

    try {
      return messaging.onTokenRefresh(onRefresh);
    } catch {
      return () => {};
    }
  },

  /** Show a system notification via Notifee (foreground + background). */
  async displayNotification(message: FirebaseMessagingTypes.RemoteMessage): Promise<void> {
    const mapped = mapRemoteMessageToNotification(message);

    try {
      // Ensure channel exists even if this path runs before sessionReady / Notifee bootstrap.
      await pushService.ensureAndroidChannel();

      const trayBody = formatTrayBody(mapped);
      const imageUrl = resolveNotificationImageUrl(mapped.image ?? mapped.data?.image);
      await displayWithSafeAndroidIcon(
        {
          id: String(mapped.id),
          title: mapped.title,
          body: trayBody,
          data: toNotifeeData({
            ...(mapped.data ?? {}),
            category: mapped.category,
            createdAt: mapped.createdAt,
            ...(imageUrl ? { image: imageUrl } : {}),
          }),
          ios: {
            ...(isRemoteImageUrl(imageUrl)
              ? {
                  attachments: [{ url: imageUrl }],
                }
              : {}),
          },
        },
        { imageUrl },
      );
    } catch {
      /* display is best-effort */
    }
  },

  /** Persist incoming push and optionally show a banner when the app is open. */
  async handleIncomingMessage(message: FirebaseMessagingTypes.RemoteMessage): Promise<void> {
    const mapped = mapRemoteMessageToNotification(message);
    upsertNotification(mapped);
    const isBroadcast =
      mapped.category === 'broadcast'
      || mapped.data?.action === 'admin_broadcast'
      || mapped.data?.type === '1'
      || mapped.data?.page === '1';

    if (isBroadcast) {
      // Foreground FCM never auto-trays on Android — post Notifee, then web-style toast.
      await pushService.displayNotification(message);
      void import('./broadcastPushDedupe')
        .then(({ markBroadcastPushShown }) => markBroadcastPushShown(mapped.id))
        .catch(() => undefined);
      void import('./localFleetNotificationService')
        .then(({ maybeShowBroadcastPopup }) => maybeShowBroadcastPopup(mapped))
        .catch(() => undefined);
      return;
    }

    await pushService.displayNotification(message);
  },

  /**
   * Register a foreground message handler.
   * @returns an unsubscribe function (no-op if messaging is unavailable).
   */
  registerForegroundHandler(
    onMessage: (msg: FirebaseMessagingTypes.RemoteMessage) => void,
  ): () => void {
    const messaging = getMessagingInstance();
    if (!messaging) return () => {};

    try {
      return messaging.onMessage(async (message) => onMessage(message));
    } catch {
      return () => {};
    }
  },

  /** Opened from background/killed state — store the alert for the inbox. */
  setupNotificationOpenHandlers(): void {
    pushService.setupNotifeeHandlers();

    if (openHandlersRegistered) return;
    openHandlersRegistered = true;

    const messaging = getMessagingInstance();
    if (!messaging) return;

    try {
      messaging.onNotificationOpenedApp((message) => {
        if (message) {
          upsertNotification(mapRemoteMessageToNotification(message));
          navigateToNotificationsScreen();
        }
      });

      messaging
        .getInitialNotification()
        .then((message) => {
          if (message) {
            upsertNotification(mapRemoteMessageToNotification(message));
            navigateToNotificationsScreen();
          }
        })
        .catch(() => {});
    } catch {
      /* handlers are best-effort */
    }
  },
};

/**
 * Data-only FCM while backgrounded/killed — OS will not auto-tray these on Android,
 * so Notifee must display (same chrome as foreground).
 *
 * Silent `sync_fleet_alerts` data messages pull dashboard summary and post
 * derived tray alerts without opening the app (backend-triggered alternative
 * to periodic background fetch).
 */
export async function handleBackgroundPush(
  message: FirebaseMessagingTypes.RemoteMessage,
): Promise<void> {
  const data = message.data ?? {};
  const isAdminBroadcast =
    String(data.category) === 'broadcast'
    || String(data.action) === 'admin_broadcast'
    || (String(data.type) === '1' && String(data.page) === '1');

  // Silent fleet sync uses action only — never treat admin type=1 as sync.
  if (!isAdminBroadcast) {
    const syncAction = String(data.action ?? '').toLowerCase();
    if (syncAction === 'sync_fleet_alerts' || data.syncDashboard === '1') {
      const { runBackgroundFleetSync } = await import('./backgroundFleetSync');
      await runBackgroundFleetSync();
      return;
    }
  }

  await pushService.ensureAndroidChannel();
  const mapped = mapRemoteMessageToNotification(message);
  upsertNotification(mapped);
  // Prevent the foreground poll from re-buzzing this broadcast after the user returns.
  // Import dedupe helper only — avoids circular import with localFleetNotificationService.
  void import('./broadcastPushDedupe')
    .then(({ markBroadcastPushShown }) => markBroadcastPushShown(mapped.id))
    .catch(() => undefined);
  await pushService.displayNotification(message);
}
