/**
 * Device-local app lock PIN — separate from the server account PIN used for
 * quick login. Stored as a bcrypt hash in encrypted MMKV; never plaintext.
 *
 * Used only for post-idle session unlock (MM-01). Cleared on forget-device;
 * survives normal logout so the same handset keeps its app lock.
 */

import bcrypt from 'react-native-bcrypt';
import { Cache } from '../storage/SecureStorage';
import {
  assertPinAttemptAllowed,
  clearPinAttempts,
  recordPinFailure,
} from './pinAttemptGuard';

const APP_LOCK_PIN_HASH_KEY = 'app_lock_pin_hash';
/** Fixed attempt-guard scope — not a mobile number; isolates from account PIN lockout. */
const APP_LOCK_ATTEMPT_SCOPE = 'device_app_lock';
const BCRYPT_ROUNDS = 10;

export function hasAppLockPin(): boolean {
  const hash = Cache.getString(APP_LOCK_PIN_HASH_KEY);
  return Boolean(hash && hash.length > 0);
}

export function setAppLockPin(pin: string): void {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('App lock PIN must be exactly 4 digits.');
  }
  Cache.set(APP_LOCK_PIN_HASH_KEY, bcrypt.hashSync(pin, BCRYPT_ROUNDS));
  clearPinAttempts(APP_LOCK_ATTEMPT_SCOPE);
}

export function clearAppLockPin(): void {
  Cache.delete(APP_LOCK_PIN_HASH_KEY);
  clearPinAttempts(APP_LOCK_ATTEMPT_SCOPE);
}

export type VerifyAppLockPinResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Verifies the typed PIN against the device app-lock hash.
 * Applies the same attempt throttle used for account PIN (MM-03).
 */
export function verifyAppLockPin(pin: string): VerifyAppLockPinResult {
  if (!hasAppLockPin()) {
    return {
      ok: false,
      message: 'No app lock PIN set. Set one in Profile → Security.',
    };
  }
  const lockError = assertPinAttemptAllowed(APP_LOCK_ATTEMPT_SCOPE);
  if (lockError) {
    return { ok: false, message: lockError };
  }
  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, message: 'Enter your 4-digit app lock PIN.' };
  }

  const hash = Cache.getString(APP_LOCK_PIN_HASH_KEY);
  if (!hash) {
    return {
      ok: false,
      message: 'No app lock PIN set. Set one in Profile → Security.',
    };
  }

  let matched = false;
  try {
    matched = bcrypt.compareSync(pin, hash);
  } catch {
    matched = false;
  }

  if (!matched) {
    return { ok: false, message: recordPinFailure(APP_LOCK_ATTEMPT_SCOPE) };
  }

  clearPinAttempts(APP_LOCK_ATTEMPT_SCOPE);
  return { ok: true };
}

/**
 * Changes an existing app lock PIN after proving the current one.
 * First-time setup should call setAppLockPin directly.
 */
export function changeAppLockPin(
  currentPin: string,
  nextPin: string,
): VerifyAppLockPinResult {
  const verified = verifyAppLockPin(currentPin);
  if (!verified.ok) return verified;
  if (currentPin === nextPin) {
    return { ok: false, message: 'New PIN must be different from the current PIN.' };
  }
  try {
    setAppLockPin(nextPin);
    return { ok: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Could not update app lock PIN.';
    return { ok: false, message };
  }
}
