/**
 * Registers this handset with the Karins backend so FCM can target it.
 */

import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { authApi } from '../api/authApi';
import { SecureStorage } from '../storage/SecureStorage';
import { isFirebaseMessagingAvailable } from './messagingProvider';
import { pushService } from './pushService';

/** Request permission, fetch FCM token, and POST /auth/mobile/register-device. */
export async function registerPushDevice(): Promise<boolean> {
  // Channel must exist before any FCM notification payload lands in the tray.
  await pushService.ensureAndroidChannel();

  const hasPermission = await pushService.ensureNotificationPermission();
  if (!hasPermission && Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    if (__DEV__) {
      console.warn('[FCM] POST_NOTIFICATIONS denied — token not registered');
    }
    return false;
  }

  if (!isFirebaseMessagingAvailable()) {
    if (__DEV__) {
      console.warn('[FCM] Firebase Messaging unavailable — check google-services.json');
    }
    return false;
  }

  try {
    const fcmPermission = await pushService.requestPermission();
    if (!fcmPermission && Platform.OS === 'ios') {
      return false;
    }

    const fcmToken = await pushService.getToken();
    if (!fcmToken) {
      if (__DEV__) {
        console.warn('[FCM] getToken() returned empty — device not registered');
      }
      return false;
    }

    if (__DEV__) {
      console.log(
        `[FCM] Got token len=${fcmToken.length} prefix=${fcmToken.slice(0, 12)}…`,
      );
    }

    const deviceId = await DeviceInfo.getUniqueId();
    await SecureStorage.setDeviceId(deviceId);

    await authApi.registerDevice({
      deviceId,
      deviceModel: DeviceInfo.getModel(),
      osVersion: DeviceInfo.getSystemVersion(),
      appVersion: DeviceInfo.getVersion(),
      fcmToken,
      ...(Platform.OS === 'ios' ? { apnsToken: fcmToken } : {}),
    });

    if (__DEV__) {
      console.log('[FCM] Device registered with backend for admin pushes');
    }
    return true;
  } catch (error) {
    if (__DEV__) {
      const status = (error as { response?: { status?: number; data?: unknown } })
        ?.response?.status;
      const data = (error as { response?: { data?: unknown } })?.response?.data;
      console.warn(
        '[FCM] registerPushDevice failed',
        status ? `HTTP ${status}` : '',
        data || error,
      );
      if (status === 404) {
        console.warn(
          '[FCM] /auth/mobile/register-device not found on this API. ' +
            'Point the app at local Node (10.0.2.2:8080) or deploy the route to testapi.',
        );
      }
    }
    return false;
  }
}
