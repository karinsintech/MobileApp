/**
 * Background fleet alert sync — fetches dashboard summary while the app is
 * closed/backgrounded and posts OS tray alerts (wallet, VAHAN, DL, challan, claims).
 *
 * Used by react-native-background-fetch (periodic) and optional silent FCM triggers.
 * Must stay free of React/Redux so headless Android tasks can run it safely.
 */

import { dashboardApi } from '../api/dashboardApi';
import { markApiSessionActive } from '../api/client';
import { normalizeDashboardSummary } from '../../features/dashboard/utils/dashboardSummaryUtils';
import {
  requiresAdminContextPicker,
  resolveActiveCustomerId,
  type AuthUser,
  type DashboardContext,
} from '../../types/auth';
import type { DashboardSummary } from '../../types/dashboard';
import { Cache, SecureStorage } from '../storage/SecureStorage';
import { initEncryptedMmkv } from '../storage/encryptedMmkv';
import { sanitizeDashboardSnapshot } from '../../features/dashboard/utils/sanitizeDashboardSnapshot';
import { syncDashboardNotifications } from './syncDashboardNotifications';

const CACHE_KEY_PREFIX = 'dashboard_snapshot';

function buildDashboardCacheKey(userId?: number, customerId?: number): string {
  return `${CACHE_KEY_PREFIX}:${userId ?? 'anon'}:${customerId ?? 'self'}`;
}

/**
 * Pull fleet-dashboard/summary and surface derived tray alerts when logged in.
 * No-ops when there is no restorable session or the network call fails.
 */
export async function runBackgroundFleetSync(): Promise<void> {
  try {
    await initEncryptedMmkv();
  } catch (error) {
    // R3-M1: the encrypted MMKV key can be temporarily unreadable (most commonly:
    // the device is locked, and the real key needs WHEN_UNLOCKED_THIS_DEVICE_ONLY
    // access). Skip this sync cycle rather than proceeding without a store — the
    // next scheduled background fetch retries once the device has unlocked again.
    if (__DEV__) {
      console.warn('[BackgroundFleetSync] encrypted MMKV unavailable, skipping cycle', error);
    }
    return;
  }
  const token = await SecureStorage.getAccessToken();
  if (!token || !SecureStorage.isSessionRestorable()) return;

  // Background axios must not treat a valid Keychain token as a stale session.
  markApiSessionActive();

  const user = SecureStorage.getSessionUser<AuthUser>();
  if (!user?.userId) return;

  const dashboardContext = Cache.getJSON<DashboardContext>('dashboard_context');
  const customerId = resolveActiveCustomerId(dashboardContext, user.defaultCustomerId);
  const canScopeByCustomerId = requiresAdminContextPicker(user.roleKey);

  try {
    const { data: res } = await dashboardApi.getSummary({
      ...(canScopeByCustomerId && customerId ? { customerId } : {}),
    });
    const normalized = normalizeDashboardSummary(res);
    const cacheKey = buildDashboardCacheKey(user.userId, customerId);
    Cache.setJSON<DashboardSummary>(cacheKey, sanitizeDashboardSnapshot(normalized));

    // Tray heads-up + inbox merge — same rules as opening the Dashboard screen.
    syncDashboardNotifications(normalized, { userId: user.userId, customerId });
  } catch (error) {
    if (__DEV__) {
      console.warn('[BackgroundFleetSync] dashboard fetch failed', error);
    }
  }
}
