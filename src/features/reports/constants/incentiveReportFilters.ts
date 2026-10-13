/**
 * Incentive report filters — mirrors web CommissionReportHeader for
 * customer / CGA / VGA (no admin customer picker or OPEN status).
 */

import {
  getIndianFYStartYear,
  getIndianFYStartYearForQuarter,
} from '../../dashboard/utils/financialYearUtils';
import type { RoleKey } from '../../../types/auth';

export interface IncentiveReportFilters {
  monthRange: string;
  year: string;
  status: string;
  receiptNo: string;
}

export const EMPTY_INCENTIVE_FILTERS: IncentiveReportFilters = {
  monthRange: '',
  year: '',
  status: '',
  receiptNo: '',
};

export const INCENTIVE_MONTH_RANGE_OPTIONS = [
  { label: 'JANUARY - MARCH', value: '01-03' },
  { label: 'APRIL - JUNE', value: '04-06' },
  { label: 'JULY - SEPTEMBER', value: '07-09' },
  { label: 'OCTOBER - DECEMBER', value: '10-12' },
] as const;

/** Full status list — web CommissionReportHeader (5 = TDS PAID, 6 = SETTLED). */
export const INCENTIVE_STATUS_OPTIONS = [
  { label: 'OPEN', value: '1' },
  { label: 'APPROVED', value: '2' },
  { label: 'INVOICE', value: '3' },
  { label: 'PAID', value: '4' },
  { label: 'TDS PAID', value: '5' },
  { label: 'SETTLED', value: '6' },
] as const;

/**
 * Mobile roles never see OPEN rows (backend also hides status 1 for CUSTOMER).
 * CGA / VGA get the same customer-facing filter set.
 */
export const CUSTOMER_INCENTIVE_STATUS_OPTIONS = INCENTIVE_STATUS_OPTIONS.filter(
  (opt) => opt.value !== '1',
);

export function hasActiveIncentiveFilters(filters: IncentiveReportFilters): boolean {
  return Boolean(
    filters.monthRange
    || filters.year.trim()
    || filters.status
    || filters.receiptNo.trim(),
  );
}

export function buildIncentiveQueryParams(
  filters: IncentiveReportFilters,
  pageNo: number,
  pageSize: number,
): Record<string, string | number> {
  const params: Record<string, string | number> = { pageNo, pageSize };
  if (filters.monthRange) params.monthRange = filters.monthRange;
  if (filters.year.trim()) params.year = filters.year.trim();
  if (filters.status) params.status = filters.status;
  if (filters.receiptNo.trim()) params.receiptNo = filters.receiptNo.trim();
  return params;
}

function parseAmount(value?: string | number | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function formatIncentiveAmount(value?: string | number | null): string {
  return parseAmount(value).toFixed(2);
}

export function incentiveStatusVariant(status?: string): 'success' | 'warning' | 'info' | 'neutral' | 'danger' {
  const s = (status ?? '').toUpperCase().replace(/\s+/g, '_');
  if (s.includes('SETTLED') || s === 'PAID') return 'success';
  if (s.includes('TDS')) return 'info';
  if (s.includes('APPROV')) return 'info';
  if (s.includes('INVOICE')) return 'warning';
  if (s.includes('OPEN')) return 'neutral';
  return 'neutral';
}

/**
 * Receipt PDF is limited to SETTLED rows whose settlement quarter falls in
 * the current Indian FY (Apr–Mar) or a later FY — same rule as web.
 */
export function canDownloadIncentiveReceipt(record: {
  year?: string | number;
  monthStart?: string | number;
}): boolean {
  const calendarYear = Number(record.year);
  const startMonth = Number(record.monthStart);
  if (
    !Number.isFinite(calendarYear)
    || !Number.isFinite(startMonth)
    || startMonth < 1
    || startMonth > 12
  ) {
    return false;
  }
  const periodFyStart = getIndianFYStartYearForQuarter(calendarYear, startMonth);
  return periodFyStart >= getIndianFYStartYear();
}

/**
 * Whether Incentive Report should appear for a mobile session.
 * Mirrors web SideNav showCommissionReport, adapted for customer-facing roles:
 * - CUSTOMER needs eligibleForCommissionReport (commission rate + rows)
 * - CGA: privilege alone (auth never sets the eligibility flag for them;
 *   list/export are scoped to the switched default Fastag customer)
 * - VGA: hidden — commission APIs are customer-scoped and throw on vehicleGroup
 *   scope (applyScope requires vehicleWhere). Web also never surfaces this for
 *   VGA because eligibleForCommissionReport stays false.
 */
export function canShowMobileIncentiveReport(options: {
  roleKey?: RoleKey;
  eligibleForCommissionReport?: boolean;
  hasCommissionMenuAccess: boolean;
}): boolean {
  const { roleKey, eligibleForCommissionReport, hasCommissionMenuAccess } = options;
  if (!hasCommissionMenuAccess) return false;

  if (roleKey === 'CUSTOMER') {
    return Boolean(eligibleForCommissionReport);
  }

  if (roleKey === 'CUSTOMER_GROUP_ADMIN') {
    return true;
  }

  return false;
}
