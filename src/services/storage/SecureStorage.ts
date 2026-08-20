/**
 * Secure session storage — Keychain for the JWT, encrypted MMKV for metadata.
 *
 * The bearer token is stored exclusively in Keychain.
 * MMKV is never used as an authentication-token fallback.
 */

import * as Keychain from 'react-native-keychain';
import { clearHttpCookies } from '../auth/httpCookies';
import {
  getAuthMetaStore,
  getCacheStore,
  getWalletAlertStore,
  isEncryptedMmkvReady,
} from './encryptedMmkv';

const CAN_RESTORE_SESSION_KEY = 'can_restore_session';
/** Device-level — remembers the mobile used for quick PIN login. */
const PIN_LOGIN_MOBILE_KEY = 'pin_login_mobile_number';
const PIN_LOGIN_ENABLED_KEY = 'pin_login_enabled';

const KEYCHAIN_SERVICE = 'com.karins.fleet';
const KEYCHAIN_KEYS = {
  accessToken: 'access_token',
  deviceId: 'device_id',
} as const;

// Dev-only when iOS Keychain is unavailable (Appetize / broken simulator).
const MMKV_ACCESS_TOKEN_KEY = 'access_token_fallback';

// Session metadata (role, customer, display name) kept in encrypted MMKV so the
// app can rehydrate the logged-in user on cold start without a network round-trip.
const SESSION_USER_KEY = 'session_user';
const DASHBOARD_CONTEXT_KEY = 'dashboard_context';

// Last successful password login mobile — used for PIN setup and quick login.
const LAST_LOGIN_MOBILE_KEY = 'last_login_mobile';

// After first unlock: backgroundFleetSync still works after reboot; no iCloud copy.
const TOKEN_ACCESSIBLE = Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;

function cache() {
  return getCacheStore();
}

function authMeta() {
  return getAuthMetaStore();
}

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
    return cache().getBoolean(PIN_LOGIN_ENABLED_KEY) ?? false;
  },

  setPinLoginEnabled(enabled: boolean): void {
    if (enabled) {
      cache().set(PIN_LOGIN_ENABLED_KEY, true);
    } else {
      cache().delete(PIN_LOGIN_ENABLED_KEY);
    }
  },

  setPinLoginMobile(mobile: string): void {
    cache().set(PIN_LOGIN_MOBILE_KEY, mobile);
  },

  getPinLoginMobile(): string | null {
    return cache().getString(PIN_LOGIN_MOBILE_KEY) ?? null;
  },

  clearPinLoginMobile(): void {
    cache().delete(PIN_LOGIN_MOBILE_KEY);
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
      await Keychain.resetInternetCredentials(KEYCHAIN_KEYS.deviceId);
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
   * PIN login preference is kept so the login screen can still offer PIN sign-in.
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
  async clearAll(): Promise<void> {
    const pinLoginEnabled = SecureStorage.isPinLoginEnabled();
    const pinLoginMobile = SecureStorage.getPinLoginMobile();

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

    if (pinLoginEnabled && pinLoginMobile) {
      SecureStorage.setPinLoginEnabled(true);
      SecureStorage.setPinLoginMobile(pinLoginMobile);
    }
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
