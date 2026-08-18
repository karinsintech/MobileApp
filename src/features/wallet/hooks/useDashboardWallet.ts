/**
 * Loads wallet balances from /fleet-dashboard/summary — the same source the
 * Fleet Dashboard wallet card uses, so the Wallet menu stays in sync.
 */

import { useCallback, useEffect, useState } from 'react';
import { dashboardApi } from '../../../services/api/dashboardApi';
import { Cache } from '../../../services/storage/SecureStorage';
import { useAppSelector } from '../../../store';
import {
  isCustomerGroupAdmin,
  requiresAdminContextPicker,
  resolveActiveCustomerId,
} from '../../../types/auth';
import type { DashboardSummary, WalletInfo } from '../../../types/dashboard';
import { normalizeDashboardSummary } from '../../dashboard/utils/dashboardSummaryUtils';
import { sanitizeDashboardSnapshot } from '../../dashboard/utils/sanitizeDashboardSnapshot';

const CACHE_KEY = 'dashboard_snapshot';

export function useDashboardWallet() {
  const { user, dashboardContext } = useAppSelector((s) => s.auth);

  const customerId = resolveActiveCustomerId(dashboardContext, user?.defaultCustomerId);
  const canScopeByCustomerId = requiresAdminContextPicker(user?.roleKey);
  const showCustomerPicker = user ? requiresAdminContextPicker(user.roleKey) : false;
  const needsCustomerScope =
    showCustomerPicker || (user ? isCustomerGroupAdmin(user.roleKey) : false);

  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      const cached = Cache.getJSON<{ wallet?: WalletInfo }>(CACHE_KEY);
      if (cached?.wallet) setWallet(cached.wallet);
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const { data } = await dashboardApi.getSummary({
        ...(canScopeByCustomerId && customerId ? { customerId } : {}),
      });
      const normalized = normalizeDashboardSummary(data);
      setWallet(normalized.wallet ?? null);
      const existing = Cache.getJSON<DashboardSummary>(CACHE_KEY) ?? ({} as DashboardSummary);
      Cache.setJSON(CACHE_KEY, sanitizeDashboardSnapshot({
        ...existing,
        wallet: normalized.wallet,
      }));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load wallet');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canScopeByCustomerId, customerId]);

  useEffect(() => {
    if (needsCustomerScope && !customerId) return;
    fetchWallet();
  }, [customerId, needsCustomerScope, fetchWallet]);

  return {
    wallet,
    loading,
    refreshing,
    error,
    customerId,
    needsCustomerScope,
    refetch: fetchWallet,
  };
}
