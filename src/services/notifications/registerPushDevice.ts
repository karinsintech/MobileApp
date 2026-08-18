/**
 * Registers this handset with the Karins backend so FCM can target it.
 *
 * Must re-run after login, app resume, and FCM token rotation — otherwise the
 * server keeps a dead token (NotRegistered) and the user stops receiving
 * fleet alerts after the first successful day.
 */

import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { authApi } from '../api/authApi';
import { ensureDeviceIdPersisted } from '../auth/deviceIdentity';
import { Cache } from '../storage/SecureStorage';
import { isFirebaseMessagingAvailable, getMessagingInstance } from './messagingProvider';
import { pushService } from './pushService';

const LAST_REGISTERED_TOKEN_KEY = 'fcm_last_registered_token';
const LAST_REGISTERED_AT_KEY = 'fcm_last_registered_at';
/** Re-POST even if the token string is unchanged (server may have cleared it). */
const REREGISTER_EVERY_MS = 6 * 60 * 60 * 1000;

let inFlight: Promise<boolean> | null = null;

/** Request permission, fetch FCM token, and POST /auth/mobile/register-device. */
export async function registerPushDevice(options?: {
  force?: boolean;
}): Promise<boolean> {
  // Collapse parallel resume/login calls into one network round-trip.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      return await registerPushDeviceInner(Boolean(options?.force));
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

async function registerPushDeviceInner(force: boolean): Promise<boolean> {
  // Channel must exist before any FCM notification payload lands in the tray.
  await pushService.ensureAndroidChannel();

  const hasPermission = await pushService.ensureNotificationPermission();
  if (!hasPermission && Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    console.warn('[FCM] POST_NOTIFICATIONS denied — token not registered');
    return false;
  }

  if (!isFirebaseMessagingAvailable()) {
    console.warn('[FCM] Firebase Messaging unavailable — check google-services.json');
    return false;
  }

  try {
    const fcmPermission = await pushService.requestPermission();
    if (!fcmPermission && Platform.OS === 'ios') {
      return false;
    }

    // Android 13+ / some OEMs need an explicit remote-message registration
    // before getToken() returns a stable value after reinstall.
    const messaging = getMessagingInstance();
    if (messaging && typeof messaging.registerDeviceForRemoteMessages === 'function') {
      try {
        const already =
          typeof messaging.isDeviceRegisteredForRemoteMessages === 'boolean'
            ? messaging.isDeviceRegisteredForRemoteMessages
            : false;
        if (!already) {
          await messaging.registerDeviceForRemoteMessages();
        }
      } catch {
        /* best-effort — getToken may still succeed */
      }
    }

    const fcmToken = await pushService.getToken();
    if (!fcmToken) {
      console.warn('[FCM] getToken() returned empty — device not registered');
      return false;
    }

    const lastToken = Cache.getString(LAST_REGISTERED_TOKEN_KEY);
    const lastAtRaw = Cache.getString(LAST_REGISTERED_AT_KEY);
    const lastAt = lastAtRaw ? Number(lastAtRaw) : 0;
    const recentlyRegistered =
      lastToken === fcmToken
      && lastAt > 0
      && Date.now() - lastAt < REREGISTER_EVERY_MS;

    // Still re-register periodically: server may have cleared push_device_id
    // after NotRegistered even though the client token string is unchanged.
    if (!force && recentlyRegistered) {
      return true;
    }

    const deviceId = await ensureDeviceIdPersisted();

    await authApi.registerDevice({
      deviceId,
      deviceModel: DeviceInfo.getModel(),
      osVersion: DeviceInfo.getSystemVersion(),
      appVersion: DeviceInfo.getVersion(),
      fcmToken,
      ...(Platform.OS === 'ios' ? { apnsToken: fcmToken } : {}),
    });

    Cache.set(LAST_REGISTERED_TOKEN_KEY, fcmToken);
    Cache.set(LAST_REGISTERED_AT_KEY, String(Date.now()));

    console.log(
      `[FCM] Device registered with backend len=${fcmToken.length} prefix=${fcmToken.slice(0, 12)}…`,
    );
    return true;
  } catch (error) {
    const status = (error as { response?: { status?: number; data?: unknown } })
      ?.response?.status;
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    console.warn(
      '[FCM] registerPushDevice failed',
      status ? `HTTP ${status}` : '',
      data || error,
    );
    return false;
  }
}
