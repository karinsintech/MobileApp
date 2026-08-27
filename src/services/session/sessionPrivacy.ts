/**
 * Session privacy — idle lock + Keychain biometry re-entry (MM-01 / MASVS-AUTH-1).
 *
 * JWT stays on AFTER_FIRST_UNLOCK for background sync. A separate Keychain item
 * with accessControl gates interactive re-entry after the app was away longer
 * than IDLE_TIMEOUT_MS. Opaque overlay on AppState "inactive" covers the iOS
 * app-switcher snapshot (taken before "background").
 */

import * as Keychain from 'react-native-keychain';

export const SESSION_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

const UNLOCK_SERVICE = 'com.karins.fleet.session-unlock';
const UNLOCK_USERNAME = 'session_unlock';

const ACCESS_CONTROL =
  Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE;

const AUTH_PROMPT = {
  title: 'Unlock Karins Fleet',
  subtitle: 'Confirm it is you to continue',
  cancel: 'Cancel',
};

/** Creates / refreshes the biometry-gated unlock secret after a successful sign-in. */
export async function ensureSessionUnlockGate(): Promise<void> {
  try {
    await Keychain.setGenericPassword(UNLOCK_USERNAME, `unlock:${Date.now()}`, {
      service: UNLOCK_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      accessControl: ACCESS_CONTROL,
      authenticationType: Keychain.AUTHENTICATION_TYPE.DEVICE_PASSCODE_OR_BIOMETRICS,
      authenticationPrompt: AUTH_PROMPT,
      // Android Keystore-backed item so accessControl actually enforces biometry.
      securityLevel: Keychain.SECURITY_LEVEL.SECURE_SOFTWARE,
      storage: Keychain.STORAGE_TYPE.AES_GCM,
    });
  } catch {
    // Emulator / no passcode — privacy overlay still applies; unlock falls back to tap.
    try {
      await Keychain.setGenericPassword(UNLOCK_USERNAME, `unlock:${Date.now()}`, {
        service: UNLOCK_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch {
      // Leave ungated — authenticateSessionUnlock treats missing gate as resume-ok.
    }
  }
}

/** Removes the unlock gate on logout / forget-device. */
export async function clearSessionUnlockGate(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: UNLOCK_SERVICE });
  } catch {
    // Missing item is fine.
  }
}

/**
 * Prompts biometrics (or device passcode) by reading the accessControl-protected item.
 * Returns true when the OS authenticates the owner, or when no gate was enrolled.
 */
export async function authenticateSessionUnlock(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  try {
    const biometry = await Keychain.getSupportedBiometryType();
    const hasGate = await Keychain.hasGenericPassword({ service: UNLOCK_SERVICE });

    // No enrolled gate (simulator / set failed) — allow resume after privacy overlay.
    if (!hasGate) {
      return { ok: true, reason: 'no_gate' };
    }

    try {
      const creds = await Keychain.getGenericPassword({
        service: UNLOCK_SERVICE,
        accessControl: ACCESS_CONTROL,
        authenticationPrompt: {
          ...AUTH_PROMPT,
          title: biometry
            ? 'Unlock Karins Fleet'
            : 'Unlock Karins Fleet with device passcode',
        },
      });

      if (creds && creds.username === UNLOCK_USERNAME) {
        return { ok: true };
      }
      return { ok: false, reason: 'denied' };
    } catch (secureError: unknown) {
      // Fallback item may exist without ACL (emulator). Reading it still proves the
      // user dismissed the privacy cover intentionally via Unlock.
      const message =
        secureError instanceof Error ? secureError.message : String(secureError);
      if (/cancel|user.?cancel|code=-128/i.test(message)) {
        return { ok: false, reason: 'cancelled' };
      }

      const fallback = await Keychain.getGenericPassword({ service: UNLOCK_SERVICE });
      if (fallback && fallback.username === UNLOCK_USERNAME) {
        return { ok: true, reason: 'fallback_gate' };
      }
      return { ok: false, reason: message };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    if (/cancel|user.?cancel|code=-128/i.test(message)) {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: message };
  }
}
