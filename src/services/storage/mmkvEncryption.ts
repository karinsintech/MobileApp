/**
 * Per-install MMKV encryption key — stored in Keychain so disk dumps of the
 * MMKV files are ciphertext (MASVS-STORAGE-1/2).
 *
 * Accessibility is WHEN_UNLOCKED_THIS_DEVICE_ONLY (no iCloud backup, device-bound).
 * The JWT uses AFTER_FIRST_UNLOCK separately so backgroundFleetSync can still
 * authenticate after reboot; MMKV ciphertext is unavailable until unlock.
 *
 * First-launch / first-encrypted-build: if Keychain has no key yet, MMKV is
 * created with a new key and previous plaintext files become unreadable — a
 * one-time cache miss. Session restore still uses the Keychain JWT.
 */

import 'react-native-get-random-values';
import * as Keychain from 'react-native-keychain';

const MMKV_KEYCHAIN_SERVICE = 'com.karins.fleet.mmkv-encryption';
const MMKV_KEY_USERNAME = 'mmkv_encryption_key';
const MMKV_KEY_BYTES = 32;

let cachedEncryptionKey: string | null = null;
let persistPromise: Promise<string> | null = null;

/**
 * Builds a hex-encoded key using the platform CSPRNG only.
 * Math.random is never acceptable for encryption-key material.
 */
function randomBytesHex(length: number): string {
  const bytes = new Uint8Array(length);
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (!cryptoObj?.getRandomValues) {
    throw new Error(
      'CSPRNG unavailable — import react-native-get-random-values before generating MMKV keys.',
    );
  }
  cryptoObj.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Resolves the 32-byte hex encryption key, creating and persisting it on first use.
 * Call before constructing any MMKV instance so the same key is reused across launches.
 */
export function resolveMmkvEncryptionKey(): Promise<string> {
  if (cachedEncryptionKey) return Promise.resolve(cachedEncryptionKey);
  if (persistPromise) return persistPromise;

  persistPromise = (async () => {
    const accessible = Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

    try {
      const existing = await Keychain.getGenericPassword({
        service: MMKV_KEYCHAIN_SERVICE,
      });
      if (existing && existing.username === MMKV_KEY_USERNAME && existing.password) {
        cachedEncryptionKey = existing.password;
        return existing.password;
      }
    } catch {
      // Missing/broken Keychain — fall through to generate.
    }

    const key = randomBytesHex(MMKV_KEY_BYTES);
    try {
      await Keychain.setGenericPassword(MMKV_KEY_USERNAME, key, {
        service: MMKV_KEYCHAIN_SERVICE,
        accessible,
      });
    } catch {
      // Simulator / Appetize — encryption still applies for this process lifetime.
    }

    cachedEncryptionKey = key;
    return key;
  })();

  return persistPromise;
}
