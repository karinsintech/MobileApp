/**
 * Secure session storage — Keychain for the JWT, encrypted MMKV for metadata.
 *
 * The bearer token is stored exclusively in Keychain.
 * MMKV is never used as an authentication-token fallback.
 *
 * PIN quick-login retains a bcrypt hash + masked hint across logout
 * (MASVS-STORAGE-1 / MM-07). When PIN login stays enabled, last_login_mobile is
 * also restored so the Login PIN popup can call /auth/pin/signIn without a
 * mobile field. Forget This Device wipes all of it.
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
/**
 * Soft-lock for biometric quick-login — JWT stays in Keychain but must not be
 * attached to API calls until Fingerprint / Face ID unlocks (Login screen).
 */
const BIOMETRIC_SESSION_LOCKED_KEY = 'biometric_session_locked';
const BIOMETRIC_LOGIN_ENABLED_KEY = 'biometric_login_enabled';
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

// Restored across normal logout only when PIN login stays enabled (PIN popup).
// Always wiped on Forget This Device (MM-07).
const LAST_LOGIN_MOBILE_KEY = 'last_login_mobile';

// After first unlock: backgroundFleetSync still works after reboot; no iCloud copy.
// Never fall back to MMKV for the JWT — a failed Keychain write must surface as error.
const TOKEN_ACCESSIBLE = Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;

/**
 * Process-local JWT cache — Keychain is authoritative for persistence, but every
 * axios interceptor used to call SecItemCopyMatching. On iOS that is both slow
 * (menu jank) and occasionally returns empty right after a write, which made
 * refresh fail and bounced users from dashboard back to login.
 */
let memoryAccessToken: string | null = null;
/**
 * bcrypt.compareSync(~10 rounds) freezes the JS thread for 100–300ms+.
 * Cache the last successful verify for this process so PIN open / submit
 * do not re-run compareSync on every tap and 4th digit.
 */
let verifiedPinLoginMobileMemory: string | null = null;

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
      // Publish to memory first so in-flight API calls never race an empty Keychain read.
      memoryAccessToken = token;
      await Keychain.setGenericPassword(
        KEYCHAIN_KEYS.accessToken,
        token,
        {
          service: KEYCHAIN_SERVICE,
          accessible: TOKEN_ACCESSIBLE,
          authenticationPrompt: { title: 'Karins Fleet', cancel: 'Cancel' },
        },
      );
      return;
    } catch {
      memoryAccessToken = null;
      throw new Error('Could not save access token on this device.');
    }
  },

  async getAccessToken(): Promise<string | null> {
    // Soft-locked for biometric Login — hide JWT from axios until Fingerprint unlocks.
    if (SecureStorage.isBiometricSessionLocked()) {
      return null;
    }

    // Hot path for every authenticated request — skip Keychain when we already have it.
    if (memoryAccessToken) return memoryAccessToken;

    try {
      const creds = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE,
        authenticationPrompt: { title: 'Karins Fleet', cancel: 'Cancel' },
      });

      if (
        creds &&
        creds.username === KEYCHAIN_KEYS.accessToken
      ) {
        memoryAccessToken = creds.password;
        return creds.password;
      }

      return null;
    } catch {
      // Prefer the in-memory JWT over a transient SecItem failure so a blip
      // does not strip Authorization and force a false logout.
      return memoryAccessToken;
    }
  },

  /**
   * Reads the Keychain JWT even while biometric soft-lock is on.
   * Only for readiness checks / unlock restore — never for API Authorization.
   */
  async peekAccessTokenIgnoringBiometricLock(): Promise<string | null> {
    if (memoryAccessToken) return memoryAccessToken;
    try {
      const creds = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE,
        authenticationPrompt: { title: 'Karins Fleet', cancel: 'Cancel' },
      });
      if (creds && creds.username === KEYCHAIN_KEYS.accessToken) {
        return creds.password;
      }
      return null;
    } catch {
      return null;
    }
  },

  /** Drops the process JWT cache without wiping Keychain (biometric soft lock). */
  clearMemoryAccessToken(): void {
    memoryAccessToken = null;
  },

  setBiometricSessionLocked(locked: boolean): void {
    try {
      authMeta().set(BIOMETRIC_SESSION_LOCKED_KEY, locked);
    } catch {
      // ignore — lock flag is best-effort alongside Keychain
    }
  },

  isBiometricSessionLocked(): boolean {
    if (!isEncryptedMmkvReady()) return false;
    return authMeta().getBoolean(BIOMETRIC_SESSION_LOCKED_KEY) ?? false;
  },

  async removeAccessToken(): Promise<void> {
    memoryAccessToken = null;
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
    // hashSync is intentionally rare (enable / bind) — not on the Login open path.
    cache().set(PIN_LOGIN_MOBILE_HASH_KEY, bcrypt.hashSync(mobile, PIN_MOBILE_BCRYPT_ROUNDS));
    cache().set(PIN_LOGIN_MOBILE_HINT_KEY, maskMobileNumber(mobile));
    cache().delete(PIN_LOGIN_MOBILE_KEY);
    verifiedPinLoginMobileMemory = mobile;
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
    if (!mobile || mobile.length !== 10) return false;
    // Same number already verified this process — skip another sync bcrypt.
    if (verifiedPinLoginMobileMemory === mobile) return true;

    const hash = cache().getString(PIN_LOGIN_MOBILE_HASH_KEY);
    if (!hash) return false;
    try {
      const matched = bcrypt.compareSync(mobile, hash);
      if (matched) {
        verifiedPinLoginMobileMemory = mobile;
      }
      return matched;
    } catch {
      return false;
    }
  },

  clearPinLoginMobile(): void {
    verifiedPinLoginMobileMemory = null;
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
      // Always pass an options object — omit/undefined options has crashed iOS
      // keychain reads when nested auth-prompt maps are dropped by TurboModule.
      await Keychain.setInternetCredentials(
        KEYCHAIN_KEYS.deviceId,
        KEYCHAIN_KEYS.deviceId,
        id,
        {},
      );
    } catch {
      // Device id is optional for password login.
    }
  },

  async getDeviceId(): Promise<string | null> {
    try {
      const creds = await Keychain.getInternetCredentials(KEYCHAIN_KEYS.deviceId, {});
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
      SecureStorage.setBiometricSessionLocked(false);
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
    // PIN-only Login popup needs the full number for /auth/pin/signIn — keep it
    // when the user opted into PIN login; Forget This Device still wipes it.
    const pinLoginMobile = pinLoginEnabled
      ? cache().getString(LAST_LOGIN_MOBILE_KEY)
      : null;
    // Biometric quick-login preference — keep across normal logout; wipe on Forget.
    const biometricLoginEnabled =
      !forgetDevice && cache().getString(BIOMETRIC_LOGIN_ENABLED_KEY) === '1';
    // Keep last GPS across normal logout so forgot-password / next export can
    // still stamp Login Session Location (wiped only on Forget this device).
    // Key must match LAST_GEO_MMKV_KEY in getClientGeoCoords (avoid circular import).
    const LAST_GEO_KEY = 'last_login_audit_geo';
    const lastAuditGeoJson = !forgetDevice
      ? cache().getString(LAST_GEO_KEY)
      : null;
    // Same as web localforage — keep Role Management menus across logout so a
    // later getUserAccess 401 does not blank every gated screen.
    const {
      snapshotAccessMenusCache,
      restoreAccessMenusCache,
    } = await import('./accessMenusCache');
    const accessMenusSnapshot = !forgetDevice ? snapshotAccessMenusCache() : [];
    // Keep dismissed DL/Vahan/Claim/Challan ids so re-login does not
    // resurrect the same daily ops alerts as unread.
    let derivedAlertReadSnapshot: Record<string, string> = {};
    let broadcastPushSnapshot: { ids: string[]; seeded: boolean } = {
      ids: [],
      seeded: false,
    };
    if (!forgetDevice) {
      try {
        const {
          snapshotDerivedAlertReadState,
        } = await import('../notifications/notificationCenter');
        derivedAlertReadSnapshot = snapshotDerivedAlertReadState();
      } catch {
        derivedAlertReadSnapshot = {};
      }
      try {
        const {
          snapshotBroadcastPushDedupe,
        } = await import('../notifications/broadcastPushDedupe');
        broadcastPushSnapshot = snapshotBroadcastPushDedupe();
      } catch {
        broadcastPushSnapshot = { ids: [], seeded: false };
      }
    }

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

    // Restore PIN quick-login identity (+ mobile for the PIN-only popup).
    if (pinLoginEnabled && pinHash && pinHint) {
      SecureStorage.setPinLoginEnabled(true);
      cache().set(PIN_LOGIN_MOBILE_HASH_KEY, pinHash);
      cache().set(PIN_LOGIN_MOBILE_HINT_KEY, pinHint);
      if (pinLoginMobile && pinLoginMobile.length === 10) {
        cache().set(LAST_LOGIN_MOBILE_KEY, pinLoginMobile);
      }
    }
    if (biometricLoginEnabled) {
      cache().set(BIOMETRIC_LOGIN_ENABLED_KEY, '1');
    }
    if (lastAuditGeoJson) {
      cache().set(LAST_GEO_KEY, lastAuditGeoJson);
    }
    if (accessMenusSnapshot.length) {
      restoreAccessMenusCache(accessMenusSnapshot);
    }
    if (Object.keys(derivedAlertReadSnapshot).length > 0) {
      try {
        const {
          restoreDerivedAlertReadState,
        } = await import('../notifications/notificationCenter');
        restoreDerivedAlertReadState(derivedAlertReadSnapshot);
      } catch {
        // Dismiss-state restore must not block logout.
      }
    }
    if (broadcastPushSnapshot.ids.length > 0 || broadcastPushSnapshot.seeded) {
      try {
        const {
          restoreBroadcastPushDedupe,
        } = await import('../notifications/broadcastPushDedupe');
        restoreBroadcastPushDedupe(broadcastPushSnapshot);
      } catch {
        // Cron dedupe restore must not block logout.
      }
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
    if (!isEncryptedMmkvReady()) return;
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
    if (!isEncryptedMmkvReady()) return;
    if (typeof value === 'string') cache().set(key, value);
    else if (typeof value === 'number') cache().set(key, value);
    else cache().set(key, value);
  },

  getString(key: string): string | null {
    if (!isEncryptedMmkvReady()) return null;
    return cache().getString(key) ?? null;
  },

  delete(key: string): void {
    if (!isEncryptedMmkvReady()) return;
    cache().delete(key);
  },
};
