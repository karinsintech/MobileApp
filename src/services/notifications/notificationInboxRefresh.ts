/**
 * Refreshes the mobile notification inbox from the same sources as the web bell:
 * dashboard-derived alerts (wallet, challan, compliance, …) + GET /notification broadcasts.
 */

import type { RoleKey } from '../../types/auth';
import { requiresAdminContextPicker, resolveActiveCustomerId } from '../../types/auth';
import type { DashboardContext } from '../../types/auth';
import type { DashboardSummary } from '../../types/dashboard';
import { normalizeDashboardSummary } from '../../features/dashboard/utils/dashboardSummaryUtils';
import { sanitizeDashboardSnapshot } from '../../features/dashboard/utils/sanitizeDashboardSnapshot';
import { dashboardApi } from '../api/dashboardApi';
import { Cache } from '../storage/SecureStorage';
import type { FleetNotification } from './notificationTypes';
import {
  loadNotifications,
  syncBroadcastNotificationsFromApi,
} from './notificationCenter';
import { syncDashboardNotifications } from './syncDashboardNotifications';

const CACHE_KEY_PREFIX = 'dashboard_snapshot';

function buildDashboardCacheKey(userId?: number, customerId?: number): string {
  return `${CACHE_KEY_PREFIX}:${userId ?? 'anon'}:${customerId ?? 'self'}`;
}

export interface RefreshNotificationInboxParams {
  userId?: number;
  customerId?: number;
  roleKey?: RoleKey;
  /** When true, calls /fleet-dashboard/summary before merging alerts (default true). */
  fetchFreshDashboard?: boolean;
}

/**
 * Merges dashboard alerts and API broadcasts into the local inbox.
 * Call on notifications screen focus, pull-to-refresh, and bell badge updates.
 */
export async function refreshNotificationInbox(
  params: RefreshNotificationInboxParams,
): Promise<FleetNotification[]> {
  const {
    userId,
    customerId,
    roleKey,
    fetchFreshDashboard = true,
  } = params;

  const canScopeByCustomerId = requiresAdminContextPicker(roleKey);
  const cacheKey = buildDashboardCacheKey(userId, customerId);

  const syncFromSummary = (summary: DashboardSummary) => {
    // Badge / inbox refresh must not re-fire OS tray heads-ups — Dashboard owns that.
    syncDashboardNotifications(summary, { userId, customerId }, { alertTray: false });
  };

  // Paint from cache immediately so wallet/compliance alerts appear without waiting on network.
  const cached = Cache.getJSON<DashboardSummary>(cacheKey);
  if (cached) {
    syncFromSummary(cached);
  }

  if (fetchFreshDashboard) {
    try {
      const { data: res } = await dashboardApi.getSummary({
        ...(canScopeByCustomerId && customerId ? { customerId } : {}),
      });
      const normalized = normalizeDashboardSummary(res);
      Cache.setJSON(cacheKey, sanitizeDashboardSnapshot(normalized));
      syncFromSummary(normalized);
    } catch (error) {
      if (__DEV__) {
        console.warn('[Notifications] dashboard summary sync failed', error);
      }
    }
  }

  await syncBroadcastNotificationsFromApi();
  return loadNotifications();
}

/**
 * Convenience wrapper using auth slice fields.
 * Access tokens live in Keychain (not Redux) — gate on isAuthenticated / userId.
 * The API client attaches the Keychain token on each request.
 */
export async function refreshNotificationInboxForSession(auth: {
  user?: { userId?: number; roleKey?: RoleKey; defaultCustomerId?: number | null } | null;
  dashboardContext?: DashboardContext | { customerId?: number | null } | null;
  isAuthenticated?: boolean;
  fetchFreshDashboard?: boolean;
}): Promise<FleetNotification[]> {
  // Skip network refresh when logged out — local cache is enough for the empty bell.
  if (auth.isAuthenticated === false || !auth.user?.userId) {
    return loadNotifications();
  }

  const customerId = resolveActiveCustomerId(
    (auth.dashboardContext as DashboardContext | null | undefined) ?? null,
    auth.user?.defaultCustomerId,
  );

  return refreshNotificationInbox({
    userId: auth.user?.userId,
    customerId,
    roleKey: auth.user?.roleKey,
    fetchFreshDashboard: auth.fetchFreshDashboard,
  });
}
