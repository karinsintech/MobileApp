/**
 * PIN quick-login helpers — account PIN is verified server-side; this module
 * tracks device preference and enforces a client attempt lockout (MM-03)
 * before calling /auth/pin/signIn.
 */

import { authApi } from '../api/authApi';
import { SecureStorage } from '../storage/SecureStorage';
import type { LoginResponse } from '../../types/auth';
import {
  assertPinAttemptAllowed,
  clearPinAttempts,
  recordPinFailure,
} from './pinAttemptGuard';
import { getCachedOrFreshGeoCoords } from '../../utils/getClientGeoCoords';

export type PinSignInResult =
  | { status: 'success'; sessionData: LoginResponse }
  | { status: 'error'; message: string };

export async function fetchPinStatus(mobileNumber: string): Promise<boolean> {
  try {
    const { data } = await authApi.pinStatus(mobileNumber);
    return data.hasPinSet;
  } catch {
    return false;
  }
}

/** True when this handset opted into PIN login and still has a bound mobile hash. */
export async function isPinLoginReady(): Promise<boolean> {
  if (!SecureStorage.isPinLoginEnabled()) return false;
  if (!SecureStorage.hasPinLoginIdentity()) return false;
  return true;
}

/**
 * Ensures the typed number matches the device-bound hash before calling the API.
 * Prevents using a remembered PIN affordance against a guessed account (MM-03/07).
 */
export function assertPinLoginMobile(mobileNumber: string): string | null {
  if (!mobileNumber || mobileNumber.length !== 10) {
    return 'Enter a valid 10-digit mobile number first.';
  }
  if (
    SecureStorage.hasPinLoginIdentity()
    && !SecureStorage.verifyPinLoginMobile(mobileNumber)
  ) {
    const hint = SecureStorage.getPinLoginMobileHint();
    return hint
      ? `Enter the full mobile number for +91 ${hint}.`
      : 'That mobile number does not match PIN login on this device.';
  }
  return null;
}

export async function signInWithPinLogin(
  mobileNumber: string,
  pin: string,
): Promise<PinSignInResult> {
  const mobileError = assertPinLoginMobile(mobileNumber);
  if (mobileError) {
    return { status: 'error', message: mobileError };
  }

  const lockError = assertPinAttemptAllowed(mobileNumber);
  if (lockError) {
    return { status: 'error', message: lockError };
  }

  if (!pin || pin.length !== 4) {
    return { status: 'error', message: 'Enter your 4-digit PIN.' };
  }

  try {
    // Prefer LoginScreen warm-up / MMKV — a cold GPS lock after the 4th digit
    // made PIN submit feel frozen even when location was already available.
    const geo = await getCachedOrFreshGeoCoords(8_000);
    if (!geo) {
      return {
        status: 'error',
        message:
          'Location is required to sign in. Please allow location access and turn on Location services.',
      };
    }
    const { data } = await authApi.pinSignIn({
      mobileNumber,
      pin,
      ...geo,
    });
    clearPinAttempts(mobileNumber);
    return { status: 'success', sessionData: data };
  } catch (error: any) {
    const detail = recordPinFailure(mobileNumber);
    const serverMessage =
      typeof error?.message === 'string' && error.message.trim()
        ? error.message.trim()
        : 'Incorrect PIN.';
    // Prefer lockout / remaining-attempt copy when the client counter advances.
    return {
      status: 'error',
      message: detail.startsWith('Too many') ? detail : `${serverMessage} ${detail}`,
    };
  }
}

/**
 * Process-local mobile for PIN quick-login — avoids asking on the Login form.
 * Seeded on enable / successful login; cleared on disable / forget device.
 * Survives navigation but not process death (disk fallback: last_login_mobile).
 */
let pinLoginMobileMemory: string | null = null;

/** Keeps the number the PIN API needs without putting it on the Login form. */
export function rememberPinLoginMobile(mobileNumber: string): void {
  const trimmed = mobileNumber.trim();
  if (trimmed.length !== 10) return;
  pinLoginMobileMemory = trimmed;
  // Disk copy so PIN-only popup still works after logout / cold start.
  SecureStorage.setLastLoginMobile(trimmed);
}

export function clearPinLoginMobileMemory(): void {
  pinLoginMobileMemory = null;
}

/**
 * Resolves the account mobile for PIN sign-in without a Login-form field.
 * Prefers in-memory value, then last_login_mobile, then verifies against the device hash.
 */
export function resolvePinLoginMobile(): string | null {
  // Already bound this process — return immediately (no bcrypt / disk).
  if (pinLoginMobileMemory && pinLoginMobileMemory.length === 10) {
    return pinLoginMobileMemory;
  }

  const candidates = [SecureStorage.getLastLoginMobile()];
  for (const raw of candidates) {
    const mobile = raw?.trim() ?? '';
    if (mobile.length !== 10) continue;
    if (
      SecureStorage.hasPinLoginIdentity()
      && !SecureStorage.verifyPinLoginMobile(mobile)
    ) {
      continue;
    }
    // Re-seed memory so later taps in this process skip disk + bcrypt.
    pinLoginMobileMemory = mobile;
    return mobile;
  }
  return null;
}

export function enablePinLogin(mobileNumber: string): void {
  SecureStorage.setPinLoginEnabled(true);
  // Skip bcrypt.hashSync when this number is already the bound identity —
  // re-hashing on every successful PIN sign-in froze the UI after the 4th digit.
  if (!SecureStorage.verifyPinLoginMobile(mobileNumber)) {
    SecureStorage.setPinLoginMobile(mobileNumber);
  }
  rememberPinLoginMobile(mobileNumber);
}

export function disablePinLogin(): void {
  SecureStorage.clearPinLoginIdentity();
  clearPinLoginMobileMemory();
}

export async function syncPinLoginPreference(mobileNumber: string): Promise<void> {
  const hasPinSet = await fetchPinStatus(mobileNumber);
  if (hasPinSet) {
    enablePinLogin(mobileNumber);
  } else {
    disablePinLogin();
  }
}
