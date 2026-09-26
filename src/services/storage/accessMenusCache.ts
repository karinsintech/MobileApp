/**
 * Persisted Role Management menus — mirrors web localforage `accessMenus`.
 * Keyed by userId+roleId so a shared device never paints another user's menus.
 * Survives normal logout (like PIN prefs); wiped on Forget this device.
 */

import { getCacheStore, isEncryptedMmkvReady } from './encryptedMmkv';
import type { AccessMenuItem } from '../../types/accessMenus';

export const ACCESS_MENUS_CACHE_PREFIX = 'access_menus_v1:';

type CachedAccessMenus = {
  userId: number;
  roleId: number;
  menus: AccessMenuItem[];
  savedAt: number;
};

function cacheKey(userId: number, roleId: number): string {
  return `${ACCESS_MENUS_CACHE_PREFIX}${userId}:${roleId}`;
}

function readJSON<T>(key: string): T | null {
  if (!isEncryptedMmkvReady()) return null;
  try {
    const raw = getCacheStore().getString(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (!isEncryptedMmkvReady()) return;
  try {
    getCacheStore().set(key, JSON.stringify(value));
  } catch {
    // ignore quota / not ready
  }
}

/** Read last successful getUserAccess payload for this identity. */
export function readAccessMenusCache(
  userId: number,
  roleId: number,
): AccessMenuItem[] | null {
  const raw = readJSON<CachedAccessMenus>(cacheKey(userId, roleId));
  if (!raw || !Array.isArray(raw.menus)) return null;
  if (raw.userId !== userId || raw.roleId !== roleId) return null;
  return raw.menus;
}

/** Persist after a successful server fetch (including empty = all revoked). */
export function writeAccessMenusCache(
  userId: number,
  roleId: number,
  menus: AccessMenuItem[],
): void {
  writeJSON(cacheKey(userId, roleId), {
    userId,
    roleId,
    menus,
    savedAt: Date.now(),
  } satisfies CachedAccessMenus);
}

export function clearAccessMenusCache(userId: number, roleId: number): void {
  if (!isEncryptedMmkvReady()) return;
  try {
    getCacheStore().delete(cacheKey(userId, roleId));
  } catch {
    // ignore
  }
}

/**
 * Snapshot all access-menu entries so SecureStorage.clearAll can restore them
 * after wiping the cache store (web keeps localforage across logout).
 */
export function snapshotAccessMenusCache(): Array<{ key: string; value: string }> {
  if (!isEncryptedMmkvReady()) return [];
  try {
    const store = getCacheStore();
    return store
      .getAllKeys()
      .filter((key) => key.startsWith(ACCESS_MENUS_CACHE_PREFIX))
      .map((key) => {
        const value = store.getString(key);
        return value != null ? { key, value } : null;
      })
      .filter((entry): entry is { key: string; value: string } => entry != null);
  } catch {
    return [];
  }
}

export function restoreAccessMenusCache(
  entries: Array<{ key: string; value: string }>,
): void {
  if (!entries.length || !isEncryptedMmkvReady()) return;
  try {
    const store = getCacheStore();
    for (const { key, value } of entries) {
      if (key.startsWith(ACCESS_MENUS_CACHE_PREFIX)) {
        store.set(key, value);
      }
    }
  } catch {
    // ignore — next successful fetch will rebuild cache
  }
}
