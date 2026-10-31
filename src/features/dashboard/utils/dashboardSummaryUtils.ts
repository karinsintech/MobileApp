/**
 * Dashboard summary helpers — aligned with karins_fastag_react Fleet Dashboard
 * for health score, open alerts, wallet totals, and FY savings display.
 */

import type {
  ClaimsSummary,
  DashboardSummary,
  SavingsInfo,
  WalletInfo,
} from '../../../types/dashboard';
import type { DashboardPeriod } from '../dashboardMetrics';
import {
  normalizeTollSpendFromSummary,
  readTollSpendAmount,
  readTollSpendTxnCount,
} from './tollSpendUtils';
import { hasIncentiveProgramFromSummary } from './fySavingsUtils';

export type RiskLevel = 'healthy' | 'watch' | 'at-risk';

export interface HealthScore {
  score: number;
  label: string;
  level: RiskLevel;
}

/** Session-scoped summary — same shape the web portal uses after BFF normalization. */
export function normalizeDashboardSummary(raw: DashboardSummary): DashboardSummary {
  const tollSpend = normalizeTollSpendFromSummary(raw);
  const wallet = normalizeWalletInfo(raw.wallet);
  const savings = normalizeSavingsInfo(raw.savings);
  const claims = normalizeClaimsSummary(raw.claims, savings);

  return {
    ...raw,
    tollSpend,
    wallet,
    savings,
    claims,
  };
}

/** Read a FY period amount from scalar or `{ thisYear, lastYear }` / snake_case. */
export function readFyPeriodAmount(
  value: unknown,
  period: 'thisYear' | 'lastYear',
): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') {
    return period === 'thisYear' && Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return period === 'thisYear' && Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const raw = period === 'thisYear'
      ? (row.thisYear ?? row.this_year ?? row.currentYear ?? row.current_year)
      : (row.lastYear ?? row.last_year ?? row.previousYear ?? row.previous_year);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
  return 0;
}

function normalizeSavingsInfo(savings?: SavingsInfo | null): SavingsInfo {
  const legacy = (savings ?? {}) as SavingsInfo & Record<string, unknown>;
  const recoveredRaw = legacy.fyClaimsRecovered ?? legacy.fy_claims_recovered;
  const incentiveRaw = legacy.fyIncentivePaid ?? legacy.fy_incentive_paid;
  const totalRaw = legacy.fyTotalSavings ?? legacy.fy_total_savings;

  const thisRecovered = readFyPeriodAmount(recoveredRaw, 'thisYear');
  const lastRecovered = readFyPeriodAmount(recoveredRaw, 'lastYear');
  const thisIncentive = readFyPeriodAmount(incentiveRaw, 'thisYear');
  const lastIncentive = readFyPeriodAmount(incentiveRaw, 'lastYear');
  const explicitTotal = typeof totalRaw === 'number' || typeof totalRaw === 'string'
    ? parseWalletAmount(totalRaw)
    : 0;

  return {
    fyClaimsRecovered: {
      thisYear: thisRecovered,
      lastYear: lastRecovered,
    },
    fyIncentivePaid: {
      thisYear: thisIncentive,
      lastYear: lastIncentive,
    },
    // Prefer explicit total; otherwise reconstruct so splash/dashboard never see a blank FY.
    fyTotalSavings: explicitTotal > 0 ? explicitTotal : thisRecovered + thisIncentive,
    hasIncentiveReport: legacy.hasIncentiveReport === true || thisIncentive > 0 || lastIncentive > 0,
  };
}

function normalizeClaimsSummary(
  claims: DashboardSummary['claims'] | undefined,
  savings: SavingsInfo,
): DashboardSummary['claims'] {
  const recoveredFromSavings = readFyPeriodAmount(savings.fyClaimsRecovered, 'thisYear');
  const recoveredLastFromSavings = readFyPeriodAmount(savings.fyClaimsRecovered, 'lastYear');
  if (!claims) {
    return {
      approved: 0,
      pending: 0,
      waitingForDoc: 0,
      rejected: 0,
      expired: 0,
      recoveredFY: recoveredFromSavings,
      recoveredLastFY: recoveredLastFromSavings,
      total: 0,
    };
  }
  const legacy = claims as DashboardSummary['claims'] & Record<string, unknown>;
  return {
    ...claims,
    recoveredFY: parseWalletAmount(
      claims.recoveredFY ?? legacy.recovered_fy ?? recoveredFromSavings,
    ) || recoveredFromSavings,
    recoveredLastFY: parseWalletAmount(
      claims.recoveredLastFY ?? legacy.recovered_last_fy ?? recoveredLastFromSavings,
    ) || recoveredLastFromSavings,
  };
}

/** Coerce API wallet amounts — BFF may return strings or snake_case keys. */
function parseWalletAmount(value: unknown): number {
  if (value == null || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export function resolveWalletTotalBalance(wallet?: WalletInfo | null): number {
  if (!wallet) return 0;

  const fastagBalance = parseWalletAmount(wallet.fastagBalance);
  const corporateBalance = parseWalletAmount(wallet.corporateBalance);
  const summed = fastagBalance + corporateBalance;

  if (wallet.totalBalance != null && Number.isFinite(Number(wallet.totalBalance))) {
    const total = parseWalletAmount(wallet.totalBalance);
    // Prefer the explicit total when breakdown is missing; otherwise use the sum.
    return total > 0 || summed === 0 ? total : summed;
  }

  return summed;
}

function normalizeWalletInfo(wallet?: WalletInfo | null): WalletInfo {
  if (!wallet) {
    return {
      fastagBalance: 0,
      corporateBalance: 0,
      totalBalance: 0,
      minimumBalance: 0,
      walletStatus: 'HEALTHY',
      isCorporate: false,
    };
  }

  // BFF may still expose legacy or snake_case wallet keys from older summary payloads.
  const legacy = wallet as WalletInfo & {
    businessCWBalance?: number | string;
    businessCwBalance?: number | string;
    fastag_balance?: number | string;
    corporate_balance?: number | string;
    total_balance?: number | string;
    minimum_balance?: number | string;
  };

  const fastagBalance = parseWalletAmount(
    wallet.fastagBalance ?? legacy.fastag_balance,
  );

  const corporateBalance = parseWalletAmount(
    wallet.corporateBalance
    ?? legacy.corporate_balance
    ?? legacy.businessCWBalance
    ?? legacy.businessCwBalance,
  );

  const minimumBalance = parseWalletAmount(
    wallet.minimumBalance ?? legacy.minimum_balance,
  );

  const merged: WalletInfo = {
    ...wallet,
    fastagBalance,
    corporateBalance,
    minimumBalance,
    totalBalance: parseWalletAmount(
      wallet.totalBalance ?? legacy.total_balance,
    ),
  };

  const resolvedTotal = resolveWalletTotalBalance(merged);
  let resolvedFastag = fastagBalance;
  let resolvedCorporate = corporateBalance;

  // YAP live fetch can fail while DB still has a combined balance — mirror web fallback.
  if (resolvedFastag + resolvedCorporate <= 0 && resolvedTotal > 0) {
    resolvedFastag = resolvedTotal;
  }

  return {
    ...merged,
    fastagBalance: resolvedFastag,
    corporateBalance: resolvedCorporate,
    totalBalance: resolvedTotal,
  };
}

export function getDriverOpenAlertCount(
  drivers?: DashboardSummary['drivers'] | null,
): number {
  if (!drivers) return 0;

  return (
    (drivers.suspended ?? 0)
    + (drivers.expiringSoon ?? 0)
    + (drivers.expired ?? 0)
  );
}

/** Hero KPI — compliance + challans + driver licence alerts (web parity). */
export function computeOpenAlerts(summary: DashboardSummary | null | undefined): number {
  if (!summary) return 0;

  return (
    (summary.compliance?.totalAlerts ?? 0)
    + (summary.challans?.pendingCount ?? 0)
    + getDriverOpenAlertCount(summary.drivers)
  );
}

/** Fleet health score — mirrors web computeHealthScore. */
export function computeHealthScore(summary: DashboardSummary | null | undefined): HealthScore {
  if (!summary) return { score: 0, label: '—', level: 'watch' };

  let score = 100;
  const compliance = summary.compliance;
  const expiredDocs = (compliance?.fitness?.expired ?? 0)
    + (compliance?.tax?.expired ?? 0)
    + (compliance?.insurance?.expired ?? 0)
    + (compliance?.pucc?.expired ?? 0)
    + (compliance?.permit?.expired ?? 0)
    + (compliance?.np?.expired ?? 0);
  const fleet = Math.max(summary.fleet?.total ?? 0, 1);

  score -= Math.min(30, (expiredDocs / fleet) * 60);
  score -= Math.min(15, ((summary.challans?.pendingCount ?? 0) / fleet) * 40);
  score -= Math.min(15, ((summary.drivers?.expired ?? 0) / Math.max(summary.drivers?.total ?? 0, 1)) * 40);

  const walletStatus = summary.wallet?.walletStatus;
  if (walletStatus === 'RECHARGE_REQUIRED') score -= 20;
  else if (walletStatus === 'CRITICAL') score -= 12;
  else if (walletStatus === 'LOW') score -= 6;

  score -= Math.min(10, ((summary.fleet?.inactive ?? 0) / fleet) * 25);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level: RiskLevel = score >= 75 ? 'healthy' : score >= 50 ? 'watch' : 'at-risk';
  const label = score >= 85
    ? 'Excellent'
    : score >= 75
      ? 'Good Standing'
      : score >= 50
        ? 'Needs Attention'
        : 'At Risk';

  return { score, label, level };
}

/** Hero status badge text — matches web HealthRing thresholds. */
export function healthStatusText(score: number): string {
  if (score >= 80) return 'Operational';
  if (score >= 60) return 'Needs Attention';
  return 'Action Required';
}

export function mapDashboardPeriodToTollPeriod(
  period: DashboardPeriod,
): 'TODAY' | 'YESTERDAY' | 'THIS_MONTH' | 'THIS_FY' {
  switch (period) {
    case 'today':
      return 'TODAY';
    case 'yesterday':
      return 'YESTERDAY';
    case 'month':
      return 'THIS_MONTH';
    case 'fy':
    default:
      return 'THIS_FY';
  }
}

function resolveFyClaimsRecovered(
  savings?: SavingsInfo | null,
  claims?: ClaimsSummary | null,
): number {
  const fromSavings = readFyPeriodAmount(savings?.fyClaimsRecovered, 'thisYear');
  if (fromSavings > 0) return fromSavings;
  return parseWalletAmount(claims?.recoveredFY);
}

function resolveFyIncentivePaid(savings?: SavingsInfo | null): number {
  return readFyPeriodAmount(savings?.fyIncentivePaid, 'thisYear');
}

/**
 * Savings card headline total — web shows recovered only unless incentive is
 * enabled and non-zero, then claims recovered + incentive paid.
 */
export function resolveFySavingsDisplayTotal(summary: DashboardSummary): number {
  const hasIncentive = hasIncentiveProgramFromSummary(summary.savings);
  const recovered = resolveFyClaimsRecovered(summary.savings, summary.claims);
  const incentive = resolveFyIncentivePaid(summary.savings);

  if (hasIncentive && incentive > 0) {
    return recovered + incentive;
  }

  return recovered > 0
    ? recovered
    : Number(summary.savings?.fyTotalSavings) || 0;
}

export function readTollMetricsForPeriod(
  summary: DashboardSummary,
  period: DashboardPeriod,
): { amount: number; txnCount: number } {
  const tollPeriod = mapDashboardPeriodToTollPeriod(period);
  return {
    amount: readTollSpendAmount(summary.tollSpend, tollPeriod),
    txnCount: readTollSpendTxnCount(summary.tollSpend, tollPeriod),
  };
}
