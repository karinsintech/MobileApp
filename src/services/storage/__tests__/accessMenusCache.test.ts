/**
 * Unit tests for web-parity accessMenus cache helpers (keying + snapshot restore).
 * Storage I/O is stubbed — no real MMKV in Jest.
 */

jest.mock('../encryptedMmkv', () => {
  const store = new Map<string, string>();
  return {
    isEncryptedMmkvReady: () => true,
    getCacheStore: () => ({
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => {
        store.set(key, value);
      },
      delete: (key: string) => {
        store.delete(key);
      },
      getAllKeys: () => Array.from(store.keys()),
      // Test-only — reset between cases
      __clear: () => store.clear(),
    }),
  };
});

import {
  ACCESS_MENUS_CACHE_PREFIX,
  clearAccessMenusCache,
  readAccessMenusCache,
  restoreAccessMenusCache,
  snapshotAccessMenusCache,
  writeAccessMenusCache,
} from '../accessMenusCache';
import { getCacheStore } from '../encryptedMmkv';

describe('accessMenusCache', () => {
  beforeEach(() => {
    (getCacheStore() as any).__clear();
  });

  it('round-trips menus for a user/role', () => {
    writeAccessMenusCache(10, 2, [{ id: '186' }, { id: '235' }]);
    expect(readAccessMenusCache(10, 2)).toEqual([{ id: '186' }, { id: '235' }]);
    // Different identity must not see another user's menus
    expect(readAccessMenusCache(10, 3)).toBeNull();
    expect(readAccessMenusCache(11, 2)).toBeNull();
  });

  it('clears a single identity', () => {
    writeAccessMenusCache(1, 1, [{ id: '201' }]);
    clearAccessMenusCache(1, 1);
    expect(readAccessMenusCache(1, 1)).toBeNull();
  });

  it('snapshots and restores across a store wipe (logout parity with web)', () => {
    writeAccessMenusCache(5, 9, [{ id: '130' }]);
    const snap = snapshotAccessMenusCache();
    expect(snap.some((e) => e.key === `${ACCESS_MENUS_CACHE_PREFIX}5:9`)).toBe(true);

    (getCacheStore() as any).__clear();
    expect(readAccessMenusCache(5, 9)).toBeNull();

    restoreAccessMenusCache(snap);
    expect(readAccessMenusCache(5, 9)).toEqual([{ id: '130' }]);
  });
});
