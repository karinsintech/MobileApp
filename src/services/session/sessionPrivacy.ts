/**
 * Session privacy — idle timer + biometric challenge helpers (MM-01 / MASVS-AUTH-1).
 *
 * After SESSION_IDLE_TIMEOUT_MS away, SessionPrivacyGate soft-logs the user out
 * to the Login screen (password / account PIN / Fingerprint). This module only
 * tracks left-at timestamps and runs the OS biometric challenge used by Login.
 *
 * Opaque overlay on AppState "inactive" still covers the iOS app-switcher
 * snapshot; that cover dismisses on resume unless idle logout already ran.
 *
 * Biometry ACL is biometry-only (no device passcode fallback).
 */

import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { Cache } from '../storage/SecureStorage';

/** Away this long before the session soft-logs out to the Login screen. */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Persisted so cold start still respects idle (in-memory refs alone are not enough). */
const SESSION_LEFT_AT_KEY = 'session_privacy_left_at';

/**
 * Challenge service used only for an explicit post-idle biometric prompt.
 * Never created/reset during login — ACL writes on Android can prompt biometrics.
 */
const UNLOCK_CHALLENGE_SERVICE = 'com.karins.fleet.session-unlock-challenge';

/** Biometry only — never fall back to the phone lock / device passcode. */
const ACCESS_CONTROL = Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET;

const AUTH_PROMPT = {
  title: 'Unlock Karins Fleet',
  subtitle: 'Confirm it is you to continue',
  cancel: 'Cancel',
};

/** Marks when the app left the foreground — survives process death. */
export function markSessionLeftAt(atMs: number = Date.now()): void {
  // Store as string so Cache.getString round-trips reliably (MMKV number vs string).
  Cache.set(SESSION_LEFT_AT_KEY, String(atMs));
}

export function getSessionLeftAt(): number | null {
  const raw = Cache.getString(SESSION_LEFT_AT_KEY);
  if (raw == null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clearSessionLeftAt(): void {
  Cache.delete(SESSION_LEFT_AT_KEY);
}

/** True when away-time since last background meets the idle lock threshold. */
export function hasSessionIdleTimedOut(nowMs: number = Date.now()): boolean {
  const leftAt = getSessionLeftAt();
  if (leftAt == null) return false;
  return nowMs - leftAt >= SESSION_IDLE_TIMEOUT_MS;
}

/**
 * @deprecated No Keychain enrollment on login/open — kept so older call sites compile.
 * Idle lock uses MMKV left-at only; biometrics run solely in authenticateSessionUnlock.
 */
export async function ensureSessionUnlockGate(): Promise<void> {
  // Intentionally empty — previous enrollment/reset prompted fingerprint on sign-in.
}

/** True when the OS reports an enrolled biometric (fingerprint / Face ID / etc.). */
export async function isDeviceBiometryAvailable(): Promise<boolean> {
  try {
    const biometry = await Keychain.getSupportedBiometryType();
    return biometry != null;
  } catch {
    return false;
  }
}

/** Clears idle clock on logout. Avoids Keychain ACL resets that can prompt biometrics. */
export async function clearSessionUnlockGate(): Promise<void> {
  clearSessionLeftAt();
}

/**
 * Prompts OS biometrics for Login Fingerprint / Face Lock.
 * Never auto-called on cold open — only from an explicit Login tap (or helpers).
 */
export async function authenticateSessionUnlock(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  try {
    const biometry = await Keychain.getSupportedBiometryType();

    // No enrolled biometrics — caller should fall through to app-lock PIN.
    if (!biometry) {
      return { ok: false, reason: 'no_biometry' };
    }

    try {
      // ACL challenge is created only here (post-idle unlock path).
      // Android-only securityLevel/storage must not ride along on iOS — undefined
      // native constants + Keystore enums confuse the TurboModule options map.
      await Keychain.setGenericPassword('challenge', `c:${Date.now()}`, {
        service: UNLOCK_CHALLENGE_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        accessControl: ACCESS_CONTROL,
        authenticationPrompt: { ...AUTH_PROMPT },
        ...(Platform.OS === 'android'
          ? {
              securityLevel: Keychain.SECURITY_LEVEL.SECURE_SOFTWARE,
              storage: Keychain.STORAGE_TYPE.AES_GCM,
            }
          : {}),
      });

      const creds = await Keychain.getGenericPassword({
        service: UNLOCK_CHALLENGE_SERVICE,
        accessControl: ACCESS_CONTROL,
        authenticationPrompt: {
          ...AUTH_PROMPT,
          title: 'Unlock Karins Fleet',
        },
      });

      try {
        await Keychain.resetGenericPassword({ service: UNLOCK_CHALLENGE_SERVICE });
      } catch {
        // ignore cleanup errors
      }

      if (creds) {
        clearSessionLeftAt();
        return { ok: true };
      }
      return { ok: false, reason: 'denied' };
    } catch (secureError: unknown) {
      const message =
        secureError instanceof Error ? secureError.message : String(secureError);
      if (/cancel|user.?cancel|code=-128/i.test(message)) {
        return { ok: false, reason: 'cancelled' };
      }

      // Emulator / ACL unsupported — treat as cancelled so PIN remains available.
      return { ok: false, reason: 'fallback_unavailable' };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    if (/cancel|user.?cancel|code=-128/i.test(message)) {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: message };
  }
}
