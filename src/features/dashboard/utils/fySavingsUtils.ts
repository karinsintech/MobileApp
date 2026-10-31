/**
 * FY savings breakdown — mirrors web buildFySavingsFromSummary for the
 * Savings & Recovery dashboard card.
 */

import type { ClaimsSummary, SavingsInfo } from '../../../types/dashboard';
import { formatIndianFYLabel, getIndianFYStartYear } from './financialYearUtils';

export interface FySavingsYearData {
  fyLabel: string;
  claimsRecovered: number;
  claimsExpiredAmount: number;
  incentiveAmount: number;
  incentiveEligibleCount: number;
  totalSavings: number;
}

export interface FySavingsSummary {
  thisYear: FySavingsYearData;
  lastYear: FySavingsYearData;
}

function resolveFyClaimsRecoveredFromSummary(
  savings?: SavingsInfo | null,
  claims?: ClaimsSummary | null,
): { thisYear: number; lastYear: number } {
  const recovered = savings?.fyClaimsRecovered;

  // Do NOT use Number(object) — fyClaimsRecovered is often `{ thisYear, lastYear }`.
  if (recovered != null && typeof recovered === 'object') {
    const row = recovered as { thisYear?: number; lastYear?: number; this_year?: number; last_year?: number };
    return {
      thisYear: Number(row.thisYear ?? row.this_year) || Number(claims?.recoveredFY) || 0,
      lastYear: Number(row.lastYear ?? row.last_year) || Number(claims?.recoveredLastFY) || 0,
    };
  }

  return {
    thisYear: Number(recovered) || Number(claims?.recoveredFY) || 0,
    lastYear: Number(claims?.recoveredLastFY) || 0,
  };
}

function resolveFyIncentivePaidFromSummary(
  savings?: SavingsInfo | null,
): { thisYear: number; lastYear: number } {
  const incentive = savings?.fyIncentivePaid;

  if (incentive != null && typeof incentive === 'object') {
    const row = incentive as { thisYear?: number; lastYear?: number; this_year?: number; last_year?: number };
    return {
      thisYear: Number(row.thisYear ?? row.this_year) || 0,
      lastYear: Number(row.lastYear ?? row.last_year) || 0,
    };
  }

  return {
    thisYear: Number(incentive) || 0,
    lastYear: 0,
  };
}

/** True when the customer is on the incentive program or has non-zero FY incentive payouts. */
export function hasIncentiveProgramFromSummary(
  savings?: SavingsInfo | null,
): boolean {
  if (!savings) return false;
  if (savings.hasIncentiveReport === true) return true;

  const incentive = resolveFyIncentivePaidFromSummary(savings);
  return incentive.thisYear > 0 || incentive.lastYear > 0;
}

function buildFySavingsYear(
  fyStartYear: number,
  claimsRecovered: number,
  claimsExpiredAmount: number,
  incentiveAmount: number,
): FySavingsYearData {
  return {
    fyLabel: formatIndianFYLabel(fyStartYear),
    claimsRecovered,
    claimsExpiredAmount,
    incentiveAmount,
    incentiveEligibleCount: 0,
    totalSavings: claimsRecovered + incentiveAmount,
  };
}

/** Build savings card data from fleet-dashboard summary — no extra API calls. */
export function buildFySavingsFromSummary(
  savings: SavingsInfo | null | undefined,
  claims: ClaimsSummary | null | undefined,
  incentiveEnabled: boolean,
): FySavingsSummary {
  const currentFYStartYear = getIndianFYStartYear();
  const previousFYStartYear = currentFYStartYear - 1;
  const recovered = resolveFyClaimsRecoveredFromSummary(savings, claims);
  const incentive = resolveFyIncentivePaidFromSummary(savings);
  const thisIncentive = incentiveEnabled ? incentive.thisYear : 0;
  const lastIncentive = incentiveEnabled ? incentive.lastYear : 0;

  return {
    thisYear: buildFySavingsYear(
      currentFYStartYear,
      recovered.thisYear,
      0,
      thisIncentive,
    ),
    lastYear: buildFySavingsYear(
      previousFYStartYear,
      recovered.lastYear,
      0,
      lastIncentive,
    ),
  };
}
