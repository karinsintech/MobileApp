/**
 * Wallet transaction report filters — mirrors web WalletTransactionReportHeader.
 */

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { formatWalletTypeLabel } from '../../../utils/walletTypeUtils';

dayjs.extend(customParseFormat);

/** Web WalletTransactionReportHeader — no data before FY 2025-04-01. */
export const EARLIEST_WALLET_REPORT_FROM_DATE = '2025-04-01';
export const MAX_WALLET_REPORT_RANGE_DAYS = 365;

export type WalletReportDateRange = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth';

export interface WalletReportFilters {
  customerName: string;
  agentId: string;
  dateRange: WalletReportDateRange | '';
  fromDate: string;
  toDate: string;
  txnType: string;
  walletType: string;
}

export const EMPTY_WALLET_REPORT_FILTERS: WalletReportFilters = {
  customerName: '',
  agentId: '',
  dateRange: '',
  fromDate: '',
  toDate: '',
  txnType: '',
  walletType: '',
};

/** Same default period as toll summaries — avoids a blank first paint on iOS. */
export const DEFAULT_WALLET_REPORT_FILTERS: WalletReportFilters = {
  ...EMPTY_WALLET_REPORT_FILTERS,
  dateRange: 'thisMonth',
};

export const WALLET_REPORT_DATE_RANGES = [
  { label: 'Today', value: 'today' as const },
  { label: 'Yesterday', value: 'yesterday' as const },
  { label: 'Last 7 Days', value: 'last7' as const },
  { label: 'This Month', value: 'thisMonth' as const },
  { label: 'Last Month', value: 'lastMonth' as const },
];

export const WALLET_TYPE_OPTIONS = [
  { label: 'FASTag', value: '1' },
  { label: 'Corporate', value: '2' },
] as const;

/** Same txn types as web utils/Constants walletTxnTypes. */
export const WALLET_TXN_TYPE_OPTIONS = [
  { label: 'VIRTUAL_ACCOUNT_CREDIT', value: 'VIRTUAL_ACCOUNT_CREDIT' },
  { label: 'CASHBACK_CREDIT', value: 'CASHBACK_CREDIT' },
  { label: 'M2C', value: 'M2C' },
  { label: 'FUNDPOST_DEBIT', value: 'FUNDPOST_DEBIT' },
  { label: 'DIRECT_DEBIT', value: 'DIRECT_DEBIT' },
  { label: 'LOAD', value: 'LOAD' },
  { label: 'M2C_REVERSAL', value: 'M2C_REVERSAL' },
  { label: 'DIRECT_CREDIT', value: 'DIRECT_CREDIT' },
  { label: 'UPI_CREDIT', value: 'UPI_CREDIT' },
  { label: 'P2C', value: 'P2C' },
  { label: 'C2C', value: 'C2C' },
  { label: 'B2C', value: 'B2C' },
  { label: 'UPI_P2P_CREDIT', value: 'UPI_P2P_CREDIT' },
  { label: 'BBPS_CREDIT', value: 'BBPS_CREDIT' },
  { label: 'C2M', value: 'C2M' },
  { label: 'ACCOUNT CLOSURE', value: 'NETC_CLOSURE_PULLBACK' },
] as const;

export const WALLET_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function hasActiveWalletReportFilters(filters: WalletReportFilters): boolean {
  return Boolean(
    filters.customerName.trim()
    || filters.agentId
    || filters.dateRange
    || filters.fromDate
    || filters.toDate
    || filters.txnType
    || filters.walletType,
  );
}

export function buildWalletReportQueryParams(
  filters: WalletReportFilters,
  pageNo: number,
  pageSize: number,
): Record<string, string | number> {
  const params: Record<string, string | number> = { pageNo, pageSize };
  if (filters.customerName.trim()) params.customerName = filters.customerName.trim();
  if (filters.agentId) params.agentId = filters.agentId;
  if (filters.dateRange) params.dateRange = filters.dateRange;
  if (filters.fromDate) params.fromDate = filters.fromDate;
  if (filters.toDate) params.toDate = filters.toDate;
  if (filters.txnType) params.txnType = filters.txnType;
  if (filters.walletType) params.walletType = filters.walletType;
  return params;
}

export function parseWalletReportDate(value?: string): Date {
  if (!value?.trim()) return new Date();
  const parsed = dayjs(value.trim(), ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true);
  return parsed.isValid() ? parsed.toDate() : new Date();
}

export function formatWalletReportDateLabel(value: string | undefined, placeholder: string): string {
  if (!value?.trim()) return placeholder;
  const parsed = dayjs(value.trim(), ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true);
  return parsed.isValid() ? parsed.format('DD MMM YYYY, hh:mm A') : value;
}

/** Web sends from at 00:00 and to at 23:59 on the selected calendar day. */
export function buildWalletReportDateValue(kind: 'from' | 'to', date: Date): string {
  const base = dayjs(date).format('YYYY-MM-DD');
  return kind === 'from' ? `${base} 00:00` : `${base} 23:59`;
}

export function getWalletReportMaxSelectableDate(): Date {
  const today = dayjs();
  const fyEndYear = (today.month() >= 3 ? today.year() : today.year() - 1) + 1;
  const fyEnd = dayjs(`${fyEndYear}-03-31`).endOf('day');
  return (today.isBefore(fyEnd) ? today : fyEnd).toDate();
}

export function getWalletReportMinToDate(fromDate?: string): Date {
  const earliest = dayjs(EARLIEST_WALLET_REPORT_FROM_DATE).startOf('day');
  if (!fromDate?.trim()) return earliest.toDate();
  const from = dayjs(fromDate.trim(), ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true).startOf('day');
  return from.isValid() && from.isAfter(earliest) ? from.toDate() : earliest.toDate();
}

export function walletTypeLabel(value?: string | number | null): string {
  const match = WALLET_TYPE_OPTIONS.find((option) => String(option.value) === String(value));
  if (match) return match.label;
  return formatWalletTypeLabel(value);
}

export function formatWalletAmount(value?: string | number | null): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function walletTxnAmounts(row: {
  type?: number;
  txnAmount?: string | number;
  txnStatus?: string;
}): { credit?: string; debit?: string; failed?: string } {
  const amount = formatWalletAmount(row.txnAmount);
  const isFailed = row.txnStatus === 'PAYMENT_FAILURE';

  if (isFailed) return { failed: amount };
  if (row.type === 1) return { credit: amount };
  if (row.type === 2) return { debit: amount };
  return {};
}

/** Web header requires both from/to when either custom date is set. */
export function validateWalletReportFilters(filters: WalletReportFilters): string | null {
  const hasFrom = Boolean(filters.fromDate.trim());
  const hasTo = Boolean(filters.toDate.trim());

  if (hasFrom !== hasTo) {
    return 'Both from date and to date should be provided together.';
  }

  if (!hasFrom || !hasTo) return null;

  const from = dayjs(filters.fromDate.trim(), ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true);
  const to = dayjs(filters.toDate.trim(), ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true);

  if (!from.isValid() || !to.isValid()) {
    return 'Invalid date range.';
  }

  if (from.isBefore(dayjs(EARLIEST_WALLET_REPORT_FROM_DATE), 'day')) {
    return 'From date cannot be before 01-04-2025.';
  }

  if (from.isAfter(to)) {
    return 'From date cannot be after To date.';
  }

  if (to.diff(from, 'day') > MAX_WALLET_REPORT_RANGE_DAYS) {
    return 'Selected range should not exceed 1 year.';
  }

  return null;
}
