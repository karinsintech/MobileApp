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
 *
 * R3-M1 fix: a Keychain read of the WHEN_UNLOCKED_THIS_DEVICE_ONLY key can fail for
 * two very different reasons that are otherwise indistinguishable from the read
 * result alone — "no key has ever been created" (safe to generate one) vs "a key
 * already exists but the device is merely locked right now" (generating a
 * replacement here would silently orphan everything already encrypted with the real
 * key, which is exactly what an ordinary locked-phone background sync used to do).
 * A second, unlock-independent sentinel (AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, same
 * accessibility class already used for the JWT) records only "a key was
 * provisioned" — never the key material itself — so a locked-device read of the
 * real key can be told apart from a genuine first launch without ever needing to
 * read the key while locked.
 */

import 'react-native-get-random-values';
import * as Keychain from 'react-native-keychain';

const MMKV_KEYCHAIN_SERVICE = 'com.karins.fleet.mmkv-encryption';
const MMKV_KEY_USERNAME = 'mmkv_encryption_key';
const MMKV_PROVISIONED_SERVICE = 'com.karins.fleet.mmkv-encryption-provisioned';
const MMKV_PROVISIONED_USERNAME = 'mmkv_key_provisioned';
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

    let existing: Keychain.UserCredentials | false = false;
    try {
      existing = await Keychain.getGenericPassword({
        service: MMKV_KEYCHAIN_SERVICE,
      });
    } catch {
      // Read failed (commonly: device locked). Fall through to the provisioned
      // check below instead of assuming "no key yet" — see file header.
    }

    if (existing && existing.username === MMKV_KEY_USERNAME && existing.password) {
      cachedEncryptionKey = existing.password;
      return existing.password;
    }

    // The real key wasn't readable. Before treating this as a first launch, check
    // the unlock-independent sentinel: if it says a key was already provisioned on
    // this device, the real key exists but is just temporarily inaccessible (locked
    // device) — do NOT mint a replacement, that would silently orphan the real one.
    let alreadyProvisioned = false;
    try {
      const marker = await Keychain.getGenericPassword({
        service: MMKV_PROVISIONED_SERVICE,
      });
      alreadyProvisioned = Boolean(
        marker && marker.username === MMKV_PROVISIONED_USERNAME && marker.password === '1',
      );
    } catch {
      // Sentinel itself unreadable — treat conservatively as unknown and fall
      // through to the same "don't generate, let the caller retry" path below.
    }

    if (alreadyProvisioned) {
      // Don't cache this failed attempt — the next call (next foreground open,
      // next background-fetch cycle) should retry fresh once the device unlocks,
      // not keep replaying this same rejection forever.
      persistPromise = null;
      throw new Error(
        'MMKV encryption key exists but is temporarily inaccessible (device locked).',
      );
    }

    // Genuinely first launch / first encrypted build — safe to generate.
    const key = randomBytesHex(MMKV_KEY_BYTES);
    try {
      await Keychain.setGenericPassword(MMKV_KEY_USERNAME, key, {
        service: MMKV_KEYCHAIN_SERVICE,
        accessible,
      });
      // Sentinel readable even while locked (AFTER_FIRST_UNLOCK, same class the JWT
      // already uses) — records only that a key now exists, never the key itself.
      await Keychain.setGenericPassword(MMKV_PROVISIONED_USERNAME, '1', {
        service: MMKV_PROVISIONED_SERVICE,
        accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    } catch {
      // Simulator / Appetize — encryption still applies for this process lifetime.
    }

    cachedEncryptionKey = key;
    return key;
  })();

  return persistPromise;
}
