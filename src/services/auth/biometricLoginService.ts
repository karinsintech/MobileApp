/**
 * Biometric quick-login — device fingerprint / Face ID signs the user back in
 * without a mobile number or server PIN check.
 *
 * Profile → Security toggle gates whether Login may use Fingerprint. The
 * fingerprint itself is never read or stored by the app — only the OS confirms
 * the scan, then this module unlocks the soft-locked Keychain session.
 */

import { Platform } from 'react-native';
import { Cache, SecureStorage } from '../storage/SecureStorage';
import { isEncryptedMmkvReady } from '../storage/encryptedMmkv';
import {
  authenticateSessionUnlock,
  isDeviceBiometryAvailable,
} from '../session/sessionPrivacy';

const BIOMETRIC_LOGIN_ENABLED_KEY = 'biometric_login_enabled';

export type BiometricLoginResult =
  | { status: 'success' }
  | { status: 'error'; message: string };

/** Android → Fingerprint; iOS → Face Lock (product copy). */
export function getBiometricLoginLabel(): string {
  return Platform.OS === 'ios' ? 'Face Lock' : 'Fingerprint';
}

export function isBiometricLoginEnabled(): boolean {
  if (!isEncryptedMmkvReady()) return false;
  const raw = Cache.getString(BIOMETRIC_LOGIN_ENABLED_KEY);
  return raw === '1';
}

export function setBiometricLoginEnabled(enabled: boolean): void {
  Cache.set(BIOMETRIC_LOGIN_ENABLED_KEY, enabled ? '1' : '0');
}

export function disableBiometricLogin(): void {
  setBiometricLoginEnabled(false);
}

/**
 * First successful sign-in on a biometry-capable phone defaults the toggle ON
 * once. Never overrides an explicit OFF the user set in Profile → Security.
 */
export async function enableBiometricLoginAfterSignIn(): Promise<boolean> {
  const available = await isDeviceBiometryAvailable();
  if (!available) {
    return false;
  }
  const raw = isEncryptedMmkvReady()
    ? Cache.getString(BIOMETRIC_LOGIN_ENABLED_KEY)
    : null;
  // Missing key only — respect '0' if the user turned Fingerprint off.
  if (raw == null || raw === '') {
    setBiometricLoginEnabled(true);
  }
  SecureStorage.setBiometricSessionLocked(false);
  return isBiometricLoginEnabled();
}

/** True when Login should show the Fingerprint / Face Lock button (hardware). */
export async function canShowBiometricLoginButton(): Promise<boolean> {
  return isDeviceBiometryAvailable();
}

/** True when Fingerprint can actually unlock the soft-locked session. */
export async function isBiometricLoginReady(): Promise<boolean> {
  if (!isBiometricLoginEnabled()) return false;
  if (!(await isDeviceBiometryAvailable())) return false;
  if (!SecureStorage.isSessionRestorable()) return false;
  if (!SecureStorage.getSessionUser()) return false;
  if (SecureStorage.isBiometricSessionLocked()) return true;
  const token = await SecureStorage.peekAccessTokenIgnoringBiometricLock();
  return Boolean(token);
}

/**
 * Soft-locks the device session for re-entry from Login (password / PIN / Fingerprint).
 * Keeps Keychain JWT + session user; clears in-memory token so public APIs stay public.
 */
export function lockSessionForBiometricLogin(): void {
  SecureStorage.clearMemoryAccessToken();
  SecureStorage.setBiometricSessionLocked(true);
  SecureStorage.setSessionRestorable(true);
}

/**
 * Prompts OS biometrics, then unlocks the persisted session for Redux restore.
 * Respects Profile toggle — disabled → tell the user to enable in settings.
 */
export async function authenticateBiometricLogin(): Promise<BiometricLoginResult> {
  const label = getBiometricLoginLabel();

  if (!isBiometricLoginEnabled()) {
    return {
      status: 'error',
      message: `${label} is not enabled in settings. Enable it first in Profile → Security.`,
    };
  }

  if (!(await isDeviceBiometryAvailable())) {
    return {
      status: 'error',
      message: `${label} is not set up on this device. Enroll it in system settings first.`,
    };
  }

  if (!(await isBiometricLoginReady())) {
    return {
      status: 'error',
      message: `${label} login is not available. Sign in with password or PIN first.`,
    };
  }

  const result = await authenticateSessionUnlock();
  if (!result.ok) {
    if (result.reason === 'cancelled') {
      return { status: 'error', message: `${label} cancelled.` };
    }
    if (result.reason === 'no_biometry') {
      return {
        status: 'error',
        message: `${label} is not set up on this device. Use password or PIN.`,
      };
    }
    return {
      status: 'error',
      message: `${label} failed. Try again or use password / PIN.`,
    };
  }

  SecureStorage.setBiometricSessionLocked(false);
  return { status: 'success' };
}
