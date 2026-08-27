/**
 * Client-side PIN attempt throttle (MM-03 / MASVS-AUTH-1).
 *
 * Complements the server IP limiter with a per-account device lockout so an
 * unlocked handset cannot burn through the 10k PIN space unchecked. State is
 * kept in encrypted MMKV under a non-reversible scope key (not the raw mobile).
 */

import { Cache } from '../storage/SecureStorage';

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 15 * 60 * 1000;

type AttemptRecord = {
  failures: number;
  lockedUntil: number | null;
};

function scopeKey(mobileNumber: string): string {
  // FNV-1a — enough to isolate counters without persisting the account id.
  let hash = 2166136261;
  for (let i = 0; i < mobileNumber.length; i += 1) {
    hash ^= mobileNumber.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `pin_attempt:${(hash >>> 0).toString(16)}`;
}

function readRecord(mobileNumber: string): AttemptRecord {
  const stored = Cache.getJSON<AttemptRecord>(scopeKey(mobileNumber));
  if (!stored) return { failures: 0, lockedUntil: null };
  return {
    failures: Number(stored.failures) || 0,
    lockedUntil: stored.lockedUntil ?? null,
  };
}

function writeRecord(mobileNumber: string, record: AttemptRecord): void {
  Cache.setJSON(scopeKey(mobileNumber), record);
}

/** Remaining lockout ms, or 0 when the account may attempt a PIN. */
export function getPinLockRemainingMs(mobileNumber: string): number {
  const { lockedUntil } = readRecord(mobileNumber);
  if (!lockedUntil) return 0;
  const remaining = lockedUntil - Date.now();
  if (remaining <= 0) {
    writeRecord(mobileNumber, { failures: 0, lockedUntil: null });
    return 0;
  }
  return remaining;
}

export function formatPinLockMessage(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `Too many PIN attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }
  return `Too many PIN attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`;
}

/**
 * Blocks the request when the device lockout is active.
 * Returns an error message or null when the attempt may proceed.
 */
export function assertPinAttemptAllowed(mobileNumber: string): string | null {
  const remaining = getPinLockRemainingMs(mobileNumber);
  if (remaining > 0) return formatPinLockMessage(remaining);
  return null;
}

/** Clears the counter after a successful PIN verification / sign-in. */
export function clearPinAttempts(mobileNumber: string): void {
  Cache.delete(scopeKey(mobileNumber));
}

/**
 * Records a failed PIN. Locks after PIN_MAX_ATTEMPTS failures.
 * Returns the user-facing error suffix (attempts left or lockout).
 */
export function recordPinFailure(mobileNumber: string): string {
  const current = readRecord(mobileNumber);
  // Lock expired — start a fresh window.
  if (current.lockedUntil && current.lockedUntil <= Date.now()) {
    current.failures = 0;
    current.lockedUntil = null;
  }

  const failures = current.failures + 1;

  if (failures >= PIN_MAX_ATTEMPTS) {
    const lockedUntil = Date.now() + PIN_LOCKOUT_MS;
    writeRecord(mobileNumber, { failures, lockedUntil });
    return formatPinLockMessage(PIN_LOCKOUT_MS);
  }

  writeRecord(mobileNumber, { failures, lockedUntil: null });
  const left = PIN_MAX_ATTEMPTS - failures;
  return `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} remaining.`;
}
