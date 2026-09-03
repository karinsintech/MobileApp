/**
 * Encrypted MMKV instances — constructed only after the per-install Keychain
 * encryption key is resolved so the same ciphertext key is reused across launches.
 *
 * New store ids (`*-enc`) keep the old plaintext files readable long enough to
 * copy session/PIN keys, then the plaintext stores are wiped (MASVS-STORAGE-1).
 */

import { MMKV } from 'react-native-mmkv';
import { resolveMmkvEncryptionKey } from './mmkvEncryption';

const PLAIN_CACHE_ID = 'karins-fleet-cache';
const PLAIN_AUTH_META_ID = 'karins-fleet-auth-meta';
const PLAIN_WALLET_ALERTS_ID = 'karins-fleet-wallet-alerts';

const CACHE_ID = 'karins-fleet-cache-enc';
const AUTH_META_ID = 'karins-fleet-auth-meta-enc';
const WALLET_ALERTS_ID = 'karins-fleet-wallet-alerts-enc';

const MIGRATION_FLAG = 'mmkv_enc_migrated_v1';
// Legacy plaintext JWT fallback key — never promote into encrypted stores.
const SKIP_PLAINTEXT_KEYS = new Set(['access_token_fallback']);

let cacheStore: MMKV | null = null;
let authMetaStore: MMKV | null = null;
let walletAlertStore: MMKV | null = null;
let initPromise: Promise<void> | null = null;

function createStore(id: string, encryptionKey: string): MMKV {
  return new MMKV({ id, encryptionKey });
}

function copyAllKeys(from: MMKV, to: MMKV): void {
  from.getAllKeys().forEach((key) => {
    if (SKIP_PLAINTEXT_KEYS.has(key)) return;
    if (!from.contains(key)) return;
    const str = from.getString(key);
    if (str != null) {
      to.set(key, str);
      return;
    }
    const num = from.getNumber(key);
    if (num != null) {
      to.set(key, num);
      return;
    }
    const bool = from.getBoolean(key);
    if (bool != null) {
      to.set(key, bool);
    }
  });
}

function stripSensitiveDashboardSnapshots(): void {
  if (!cacheStore) return;
  cacheStore.getAllKeys().forEach((key) => {
    if (!key.startsWith('dashboard_snapshot')) return;
    const raw = cacheStore!.getString(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        challans?: { recentPending?: unknown; topVehiclesByFine?: unknown };
      };
      if (!parsed?.challans) return;
      const { recentPending: _rp, topVehiclesByFine: _tv, ...restChallans } = parsed.challans;
      cacheStore!.set(key, JSON.stringify({ ...parsed, challans: restChallans }));
    } catch {
      // Ignore malformed cache rows.
    }
  });
}

/** Copy session/PIN/threshold data from plaintext MMKV, then wipe the old files. */
function migrateFromPlaintext(): void {
  if (cacheStore?.getBoolean(MIGRATION_FLAG)) return;

  try {
    const plainCache = new MMKV({ id: PLAIN_CACHE_ID });
    const plainAuth = new MMKV({ id: PLAIN_AUTH_META_ID });
    const plainWallet = new MMKV({ id: PLAIN_WALLET_ALERTS_ID });

    if (cacheStore) copyAllKeys(plainCache, cacheStore);
    if (authMetaStore) copyAllKeys(plainAuth, authMetaStore);
    if (walletAlertStore) copyAllKeys(plainWallet, walletAlertStore);
    stripSensitiveDashboardSnapshots();

    plainCache.clearAll();
    plainAuth.clearAll();
    plainWallet.clearAll();
  } catch {
    // Missing plaintext stores — first install or already wiped.
  }

  // Drop any leftover JWT that was written under the old iOS MMKV fallback.
  cacheStore?.delete('access_token_fallback');
  authMetaStore?.delete('access_token_fallback');

  cacheStore?.set(MIGRATION_FLAG, true);
}

/** Must run before the first Cache / SecureStorage / wallet-alert read. */
export function initEncryptedMmkv(): Promise<void> {
  if (cacheStore && authMetaStore && walletAlertStore) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = resolveMmkvEncryptionKey()
    .then((encryptionKey) => {
      cacheStore = createStore(CACHE_ID, encryptionKey);
      authMetaStore = createStore(AUTH_META_ID, encryptionKey);
      walletAlertStore = createStore(WALLET_ALERTS_ID, encryptionKey);
      migrateFromPlaintext();
    })
    .catch((error) => {
      // R3-M1: resolveMmkvEncryptionKey() can now reject (e.g. the device is locked
      // and the real key is temporarily unreadable) instead of silently minting a
      // replacement key. Don't cache that failure here either — clear initPromise so
      // the next call (next screen open, next background-fetch cycle) retries fresh
      // rather than replaying the same rejection forever.
      initPromise = null;
      throw error;
    });

  return initPromise;
}

export function getCacheStore(): MMKV {
  if (!cacheStore) {
    throw new Error('Encrypted MMKV is not initialized. Call initEncryptedMmkv() first.');
  }
  return cacheStore;
}

export function getAuthMetaStore(): MMKV {
  if (!authMetaStore) {
    throw new Error('Encrypted MMKV is not initialized. Call initEncryptedMmkv() first.');
  }
  return authMetaStore;
}

export function isEncryptedMmkvReady(): boolean {
  return Boolean(cacheStore && authMetaStore && walletAlertStore);
}

export function getWalletAlertStore(): MMKV {
  if (!walletAlertStore) {
    throw new Error('Encrypted MMKV is not initialized. Call initEncryptedMmkv() first.');
  }
  return walletAlertStore;
}
