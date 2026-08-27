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
    const { data } = await authApi.pinSignIn({ mobileNumber, pin });
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

export function enablePinLogin(mobileNumber: string): void {
  SecureStorage.setPinLoginEnabled(true);
  SecureStorage.setPinLoginMobile(mobileNumber);
}

export function disablePinLogin(): void {
  SecureStorage.clearPinLoginIdentity();
}

export async function syncPinLoginPreference(mobileNumber: string): Promise<void> {
  const hasPinSet = await fetchPinStatus(mobileNumber);
  if (hasPinSet) {
    enablePinLogin(mobileNumber);
  } else {
    disablePinLogin();
  }
}
