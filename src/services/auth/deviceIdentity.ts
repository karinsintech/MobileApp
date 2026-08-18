/**
 * Stable handset id for server logout/revoke — persisted at login, not gated
 * on push notification permission (MASVS-AUTH-2).
 */

import DeviceInfo from 'react-native-device-info';
import { SecureStorage } from '../storage/SecureStorage';

/** Persist hardware id after sign-in so logout never depends on FCM registration. */
export async function ensureDeviceIdPersisted(): Promise<string> {
  const existing = await SecureStorage.getDeviceId();
  if (existing) return existing;

  const deviceId = await DeviceInfo.getUniqueId();
  await SecureStorage.setDeviceId(deviceId);
  return deviceId;
}

/** Resolve id for POST /auth/mobile/logout even when push never registered. */
export async function resolveLogoutDeviceId(): Promise<string> {
  const stored = await SecureStorage.getDeviceId();
  if (stored) return stored;
  return DeviceInfo.getUniqueId();
}
