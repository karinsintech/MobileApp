/**
 * Cached copy of the web Fleet Dashboard walletAlertThreshold.
 * Source of truth is GET/POST /fleet-dashboard/user-preferences; this store
 * survives logout so the slider can paint before the next API round-trip.
 */

import { dashboardApi } from '../api/dashboardApi';
import { snapWalletThreshold } from '../../constants/walletThresholdConstants';
import { getWalletAlertStore, isEncryptedMmkvReady } from '../storage/encryptedMmkv';

function normalizeScopeId(id?: number | string | null): string {
  if (id == null || id === '') return '';
  const numeric = Number(id);
  if (Number.isFinite(numeric)) return String(numeric);
  return String(id);
}

function storageKey(userId?: number | string | null, customerId?: number | string | null): string {
  const userPart = normalizeScopeId(userId) || 'anon';
  const customerPart = normalizeScopeId(customerId) || 'self';
  return `wallet_alert_threshold:${userPart}:${customerPart}`;
}

function latestKey(userId?: number | string | null): string {
  return `wallet_alert_threshold_latest:${normalizeScopeId(userId) || 'anon'}`;
}

function parseStored(raw: string | undefined): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { threshold?: number };
    if (parsed?.threshold == null) return null;
    return Number(parsed.threshold);
  } catch {
    return null;
  }
}

function readRaw(key: string): number | null {
  if (!isEncryptedMmkvReady()) return null;
  const stored = parseStored(getWalletAlertStore().getString(key));
  if (stored == null || !Number.isFinite(stored)) return null;
  return stored;
}

function writeKeys(
  threshold: number,
  userId?: number,
  customerId?: number,
): void {
  const payload = JSON.stringify({ threshold });
  const keys = [
    storageKey(userId, customerId),
    storageKey(userId, undefined),
    latestKey(userId),
  ];
  [...new Set(keys)].forEach((key) => {
    getWalletAlertStore().set(key, payload);
  });
}

/** Last known web preference (0 = auto / min × 1.5). */
export function getSavedWalletAlertThreshold(
  userId?: number,
  customerId?: number,
): number | null {
  const keys = [
    storageKey(userId, customerId),
    storageKey(userId, undefined),
    latestKey(userId),
  ];
  for (const key of [...new Set(keys)]) {
    const saved = readRaw(key);
    if (saved != null) return saved;
  }
  return null;
}

export function saveWalletAlertThreshold(
  threshold: number,
  userId?: number,
  customerId?: number,
): number {
  const snapped = snapWalletThreshold(threshold);
  writeKeys(snapped, userId, customerId);
  return snapped;
}

/** Pull walletAlertThreshold from the same API the web Settings drawer uses. */
export async function hydrateWalletAlertThresholdFromApi(
  userId?: number,
  customerId?: number,
): Promise<number | null> {
  try {
    const { data } = await dashboardApi.getUserPreferences();
    const raw = data?.preferences?.walletAlertThreshold;
    if (raw == null) {
      return getSavedWalletAlertThreshold(userId, customerId);
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      return getSavedWalletAlertThreshold(userId, customerId);
    }
    writeKeys(numeric, userId, customerId);
    return numeric;
  } catch {
    return getSavedWalletAlertThreshold(userId, customerId);
  }
}

/** Persist a custom limit to the web preference row; cache locally as fallback. */
export async function persistWalletAlertThresholdToApi(
  threshold: number,
  userId?: number,
  customerId?: number,
): Promise<{ saved: number; synced: boolean }> {
  const snapped = saveWalletAlertThreshold(threshold, userId, customerId);
  try {
    await dashboardApi.saveUserPreferences({ walletAlertThreshold: snapped });
    return { saved: snapped, synced: true };
  } catch {
    return { saved: snapped, synced: false };
  }
}

export interface WalletAlertScope {
  userId?: number;
  customerId?: number;
}
