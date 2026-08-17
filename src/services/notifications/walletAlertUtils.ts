/**
 * Wallet low-balance rules — same as web Fleet Dashboard Settings:
 * alert = saved walletAlertThreshold, else operator minimum × 1.5.
 */

import type { WalletInfo } from '../../types/dashboard';
import { resolveWalletTotalBalance } from '../../features/dashboard/utils/dashboardSummaryUtils';
import { snapWalletThreshold } from '../../constants/walletThresholdConstants';
import {
  getSavedWalletAlertThreshold,
  type WalletAlertScope,
} from './walletAlertPreferences';

export type { WalletAlertScope };

/** Web uses 1.5× the stored minimum balance as the low-balance alert line. */
export const WALLET_ALERT_MULTIPLIER = 1.5;
/** Retired web default — treated as “use min × 1.5”, not a real custom limit. */
export const LEGACY_WALLET_ALERT_THRESHOLD = 50_000;

export function computeWalletAlertThreshold(minimumBalance: number | null | undefined): number {
  const base = Number(minimumBalance) || 0;
  if (base <= 0) return 0;
  return Math.round(base * WALLET_ALERT_MULTIPLIER);
}

/** Zero or the old ₹50k default means “follow operator minimum × 1.5”. */
export function isAutoWalletAlertThreshold(threshold: number | null | undefined): boolean {
  const numeric = Number(threshold);
  if (!Number.isFinite(numeric) || numeric <= 0) return true;
  return numeric === LEGACY_WALLET_ALERT_THRESHOLD;
}

export function resolveDefaultWalletAlertThreshold(
  minimumBalance: number | null | undefined,
): number {
  const computed = computeWalletAlertThreshold(minimumBalance);
  if (computed > 0) return snapWalletThreshold(computed);
  return LEGACY_WALLET_ALERT_THRESHOLD;
}

/** Effective alert limit — web user-preferences first, then min × 1.5. */
export function resolveWalletAlertThreshold(
  minimumBalance: number | null | undefined,
  scope?: WalletAlertScope,
): number {
  const saved = getSavedWalletAlertThreshold(scope?.userId, scope?.customerId);
  if (!isAutoWalletAlertThreshold(saved) && saved != null && saved > 0) {
    return saved;
  }
  return resolveDefaultWalletAlertThreshold(minimumBalance);
}

export interface WalletLowBalanceState {
  isLow: boolean;
  isEmpty: boolean;
  totalBalance: number;
  alertThreshold: number;
}

/** True when balance is empty or below the effective (web) alert limit. */
export function evaluateWalletLowBalance(
  wallet?: WalletInfo | null,
  scope?: WalletAlertScope,
): WalletLowBalanceState {
  const totalBalance = resolveWalletTotalBalance(wallet);
  const alertThreshold = resolveWalletAlertThreshold(wallet?.minimumBalance, scope);
  const isEmpty = totalBalance <= 0;

  const belowAlertLimit =
    alertThreshold > 0 && totalBalance < alertThreshold;

  const serverMarkedLow =
    wallet?.walletStatus != null
    && wallet.walletStatus !== 'HEALTHY';

  return {
    isLow: isEmpty || belowAlertLimit || serverMarkedLow,
    isEmpty,
    totalBalance,
    alertThreshold,
  };
}
