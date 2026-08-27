/**
 * Secure session storage — Keychain for the JWT, encrypted MMKV for metadata.
 *
 * The bearer token is stored exclusively in Keychain.
 * MMKV is never used as an authentication-token fallback.
 *
 * PIN quick-login retains only a bcrypt hash + masked hint across logout
 * (MASVS-STORAGE-1 / MM-07) — never the plaintext mobile or last_login_mobile.
 */

import * as Keychain from 'react-native-keychain';
import bcrypt from 'react-native-bcrypt';
import { clearHttpCookies } from '../auth/httpCookies';
import {
  getAuthMetaStore,
  getCacheStore,
  getWalletAlertStore,
  isEncryptedMmkvReady,
} from './encryptedMmkv';
import { maskMobileNumber } from '../../utils/maskMobileNumber';

export { maskMobileNumber };

const CAN_RESTORE_SESSION_KEY = 'can_restore_session';
/** @deprecated Legacy plaintext — migrated to hash+hint then deleted. */
const PIN_LOGIN_MOBILE_KEY = 'pin_login_mobile_number';
const PIN_LOGIN_MOBILE_HASH_KEY = 'pin_login_mobile_hash';
const PIN_LOGIN_MOBILE_HINT_KEY = 'pin_login_mobile_hint';
const PIN_LOGIN_ENABLED_KEY = 'pin_login_enabled';
const PIN_MOBILE_BCRYPT_ROUNDS = 10;

const KEYCHAIN_SERVICE = 'com.karins.fleet';
const KEYCHAIN_KEYS = {
  accessToken: 'access_token',
  deviceId: 'device_id',
} as const;

// Session metadata (role, customer, display name) kept in encrypted MMKV so the
// app can rehydrate the logged-in user on cold start without a network round-trip.
const SESSION_USER_KEY = 'session_user';
const DASHBOARD_CONTEXT_KEY = 'dashboard_context';

// Session-scoped only — cleared on logout and never restored (MM-07).
const LAST_LOGIN_MOBILE_KEY = 'last_login_mobile';

// After first unlock: backgroundFleetSync still works after reboot; no iCloud copy.
// Never fall back to MMKV for the JWT — a failed Keychain write must surface as error.
const TOKEN_ACCESSIBLE = Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;

function cache() {
  return getCacheStore();
}

function authMeta() {
  return getAuthMetaStore();
}

/**
 * One-time upgrade from plaintext PIN mobile → salted hash + masked hint.
 * Runs before any restore/read so shared-device handsets do not keep the raw number.
 */
function migrateLegacyPinMobileIfNeeded(): void {
  const legacy = cache().getString(PIN_LOGIN_MOBILE_KEY);
  if (!legacy || legacy.length !== 10) {
    if (legacy) cache().delete(PIN_LOGIN_MOBILE_KEY);
    return;
  }
  if (!cache().getString(PIN_LOGIN_MOBILE_HASH_KEY)) {
    cache().set(PIN_LOGIN_MOBILE_HASH_KEY, bcrypt.hashSync(legacy, PIN_MOBILE_BCRYPT_ROUNDS));
  }
  if (!cache().getString(PIN_LOGIN_MOBILE_HINT_KEY)) {
    cache().set(PIN_LOGIN_MOBILE_HINT_KEY, maskMobileNumber(legacy));
  }
  cache().delete(PIN_LOGIN_MOBILE_KEY);
}

export type ClearAllOptions = {
  /** When true, also drops PIN quick-login identity (hash, hint, enabled). */
  forgetDevice?: boolean;
};

export const SecureStorage = {
  // ── Access Token ─────────────────────────────────────────────────────────
  async setAccessToken(token: string): Promise<void> {
    try {
      await Keychain.setGenericPassword(
        KEYCHAIN_KEYS.accessToken,
        token,
        {
          service: KEYCHAIN_SERVICE,
          accessible: TOKEN_ACCESSIBLE,
        },
      );
      return;
    } catch {
      throw new Error('Could not save access token on this device.');
    }
  },

  async getAccessToken(): Promise<string | null> {
    try {
      const creds = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE,
      });

      if (
        creds &&
        creds.username === KEYCHAIN_KEYS.accessToken
      ) {
        return creds.password;
      }

      return null;
    } catch {
      return null;
    }
  },

  async removeAccessToken(): Promise<void> {
    try {
      await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
    } catch {
      // Ignore — missing/broken Keychain must not block sign-in cleanup.
    }
  },

  // ── Quick PIN login preference (device-level) ────────────────────────────
  isPinLoginEnabled(): boolean {
    migrateLegacyPinMobileIfNeeded();
    return cache().getBoolean(PIN_LOGIN_ENABLED_KEY) ?? false;
  },

  setPinLoginEnabled(enabled: boolean): void {
    if (enabled) {
      cache().set(PIN_LOGIN_ENABLED_KEY, true);
    } else {
      cache().delete(PIN_LOGIN_ENABLED_KEY);
    }
  },

  /**
   * Persists a salted hash + masked hint for PIN quick-login — never plaintext.
   * Callers that previously stored the raw mobile must use this instead.
   */
  setPinLoginMobile(mobile: string): void {
    if (mobile.length !== 10) return;
    cache().set(PIN_LOGIN_MOBILE_HASH_KEY, bcrypt.hashSync(mobile, PIN_MOBILE_BCRYPT_ROUNDS));
    cache().set(PIN_LOGIN_MOBILE_HINT_KEY, maskMobileNumber(mobile));
    cache().delete(PIN_LOGIN_MOBILE_KEY);
  },

  /** @deprecated Prefer getPinLoginMobileHint / verifyPinLoginMobile — always null. */
  getPinLoginMobile(): string | null {
    migrateLegacyPinMobileIfNeeded();
    // Plaintext must not be readable after MM-07.
    return null;
  },

  getPinLoginMobileHint(): string | null {
    migrateLegacyPinMobileIfNeeded();
    return cache().getString(PIN_LOGIN_MOBILE_HINT_KEY) ?? null;
  },

  hasPinLoginIdentity(): boolean {
    migrateLegacyPinMobileIfNeeded();
    return Boolean(cache().getString(PIN_LOGIN_MOBILE_HASH_KEY));
  },

  /** Confirms the typed number matches the device-bound PIN account without storing it. */
  verifyPinLoginMobile(mobile: string): boolean {
    migrateLegacyPinMobileIfNeeded();
    const hash = cache().getString(PIN_LOGIN_MOBILE_HASH_KEY);
    if (!hash || mobile.length !== 10) return false;
    try {
      return bcrypt.compareSync(mobile, hash);
    } catch {
      return false;
    }
  },

  clearPinLoginMobile(): void {
    cache().delete(PIN_LOGIN_MOBILE_KEY);
    cache().delete(PIN_LOGIN_MOBILE_HASH_KEY);
    cache().delete(PIN_LOGIN_MOBILE_HINT_KEY);
  },

  clearPinLoginIdentity(): void {
    SecureStorage.setPinLoginEnabled(false);
    SecureStorage.clearPinLoginMobile();
  },

  setLastLoginMobile(mobile: string): void {
    cache().set(LAST_LOGIN_MOBILE_KEY, mobile);
  },

  getLastLoginMobile(): string | null {
    return cache().getString(LAST_LOGIN_MOBILE_KEY) ?? null;
  },

  clearLastLoginMobile(): void {
    cache().delete(LAST_LOGIN_MOBILE_KEY);
  },

  // ── Session User (non-secret display/routing metadata) ───────────────────
  // Persisted alongside the Keychain token so a cold start can restore the
  // session UI immediately; the token in Keychain remains the source of truth.
  setSessionUser(user: unknown): void {
    cache().set(SESSION_USER_KEY, JSON.stringify(user));
  },

  getSessionUser<T>(): T | null {
    const raw = cache().getString(SESSION_USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; }
    catch { return null; }
  },

  clearSessionUser(): void {
    cache().delete(SESSION_USER_KEY);
  },

  // ── Device ID ────────────────────────────────────────────────────────────
  async setDeviceId(id: string): Promise<void> {
    try {
      await Keychain.setInternetCredentials(
        KEYCHAIN_KEYS.deviceId,
        KEYCHAIN_KEYS.deviceId,
        id,
      );
    } catch {
      // Device id is optional for password login.
    }
  },

  async getDeviceId(): Promise<string | null> {
    try {
      const creds = await Keychain.getInternetCredentials(KEYCHAIN_KEYS.deviceId);
      return creds ? creds.password : null;
    } catch {
      return null;
    }
  },

  async clearDeviceId(): Promise<void> {
    try {
      // v10 requires BaseOptions — a bare string is a no-op / type error and left
      // the internet-credential device_id behind after logout (MM-07).
      await Keychain.resetInternetCredentials({ server: KEYCHAIN_KEYS.deviceId });
    } catch {
      // Missing/broken Keychain must not block local sign-out cleanup.
    }
  },

  /** Marks whether cold start may rehydrate a saved session. */
  setSessionRestorable(canRestore: boolean): void {
    authMeta().set(CAN_RESTORE_SESSION_KEY, canRestore);
  },

  isSessionRestorable(): boolean {
    if (!isEncryptedMmkvReady()) return false;
    return authMeta().getBoolean(CAN_RESTORE_SESSION_KEY) ?? false;
  },

  /** True once the user has signed in or out with the restore gate in place. */
  hasSessionRestorePreference(): boolean {
    return authMeta().contains(CAN_RESTORE_SESSION_KEY);
  },

  /** Drop any saved credentials before a fresh password sign-in — never throws. */
  async prepareForSignIn(): Promise<void> {
    try {
      SecureStorage.setSessionRestorable(false);
    } catch {
      // ignore
    }
    try {
      await clearHttpCookies();
    } catch {
      // ignore
    }
    await SecureStorage.removeAccessToken();
    try {
      SecureStorage.clearSessionUser();
    } catch {
      // ignore
    }
  },

  /**
   * Full local sign-out — removes tokens and session user only.
   * PIN hash/hint may be restored by clearAll when forgetDevice is false.
   */
  async clearSession(): Promise<void> {
    await SecureStorage.prepareForSignIn();
    try {
      cache().delete(DASHBOARD_CONTEXT_KEY);
    } catch {
      // ignore
    }
  },

  // ── Clear All (on logout) ────────────────────────────────────────────────
  async clearAll(options?: ClearAllOptions): Promise<void> {
    migrateLegacyPinMobileIfNeeded();

    const forgetDevice = options?.forgetDevice === true;
    const pinLoginEnabled = !forgetDevice && SecureStorage.isPinLoginEnabled();
    const pinHash = pinLoginEnabled
      ? cache().getString(PIN_LOGIN_MOBILE_HASH_KEY)
      : null;
    const pinHint = pinLoginEnabled
      ? cache().getString(PIN_LOGIN_MOBILE_HINT_KEY)
      : null;

    await SecureStorage.clearSession();
    await SecureStorage.clearDeviceId();
    try {
      cache().clearAll();
    } catch {
      // ignore
    }
    try {
      getWalletAlertStore().clearAll();
    } catch {
      // ignore
    }

    // Never restore last_login_mobile or plaintext pin mobile.
    // PIN quick-login may keep only the salted hash + masked hint.
    if (pinLoginEnabled && pinHash && pinHint) {
      SecureStorage.setPinLoginEnabled(true);
      cache().set(PIN_LOGIN_MOBILE_HASH_KEY, pinHash);
      cache().set(PIN_LOGIN_MOBILE_HINT_KEY, pinHint);
    }

    try {
      const { clearSessionUnlockGate } = await import('../session/sessionPrivacy');
      await clearSessionUnlockGate();
    } catch {
      // Unlock gate cleanup must not block logout.
    }
  },

  /** Wipe PIN identity, device id, wallet prefs, and session — for shared/resold handsets. */
  async forgetThisDevice(): Promise<void> {
    await SecureStorage.clearAll({ forgetDevice: true });
  },
};

// ── Encrypted MMKV Cache Helpers ──────────────────────────────────────────
export const Cache = {
  setJSON<T>(key: string, value: T): void {
    cache().set(key, JSON.stringify(value));
  },

  getJSON<T>(key: string): T | null {
    if (!isEncryptedMmkvReady()) return null;
    const v = cache().getString(key);
    if (!v) return null;
    try { return JSON.parse(v) as T; }
    catch { return null; }
  },

  set(key: string, value: string | number | boolean): void {
    if (typeof value === 'string') cache().set(key, value);
    else if (typeof value === 'number') cache().set(key, value);
    else cache().set(key, value);
  },

  getString(key: string): string | null {
    return cache().getString(key) ?? null;
  },

  delete(key: string): void {
    cache().delete(key);
  },
};
