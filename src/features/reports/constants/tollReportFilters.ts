/**
 * Toll report filters — field names mirror web Vehicle/Customer Txn report headers.
 */

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

export type TollReportDateRange = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth';

/** Web VehicleTransactionReportHeader — no data before FY 2025-04-01. */
export const EARLIEST_TOLL_REPORT_FROM_DATE = '2025-04-01';

export interface TollReportFilters {
  customerName: string;
  vehicleNo: string;
  agentId: string;
  dateRange: TollReportDateRange | '';
  fromDate: string;
  toDate: string;
}

export const EMPTY_TOLL_REPORT_FILTERS: TollReportFilters = {
  customerName: '',
  vehicleNo: '',
  agentId: '',
  dateRange: '',
  fromDate: '',
  toDate: '',
};

/**
 * Initial Fastag report scope — unfiltered monthly APIs often return an empty
 * page until the operator picks a period (web headers default to a preset too).
 */
export const DEFAULT_TOLL_REPORT_FILTERS: TollReportFilters = {
  ...EMPTY_TOLL_REPORT_FILTERS,
  dateRange: 'thisMonth',
};

export const TOLL_REPORT_DATE_RANGES = [
  { label: 'Today', value: 'today' as const },
  { label: 'Yesterday', value: 'yesterday' as const },
  { label: 'Last 7 Days', value: 'last7' as const },
  { label: 'This Month', value: 'thisMonth' as const },
  { label: 'Last Month', value: 'lastMonth' as const },
];

export function hasActiveTollReportFilters(filters: TollReportFilters): boolean {
  return Boolean(
    filters.customerName.trim()
    || filters.vehicleNo.trim()
    || filters.agentId
    || filters.dateRange
    || filters.fromDate
    || filters.toDate,
  );
}

export function buildTollReportQueryParams(
  filters: TollReportFilters,
  pageNo: number,
  pageSize: number,
): Record<string, string | number> {
  const params: Record<string, string | number> = { pageNo, pageSize };
  if (filters.customerName.trim()) params.customerName = filters.customerName.trim();
  if (filters.vehicleNo.trim()) params.vehicleNo = filters.vehicleNo.trim();
  if (filters.agentId) params.agentId = filters.agentId;
  if (filters.dateRange) params.dateRange = filters.dateRange;
  if (filters.fromDate) params.fromDate = filters.fromDate;
  if (filters.toDate) params.toDate = filters.toDate;
  return params;
}

export function parseTollReportDate(value?: string): Date {
  if (!value?.trim()) return new Date();
  const parsed = dayjs(value.trim(), ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true);
  return parsed.isValid() ? parsed.toDate() : new Date();
}

export function formatTollReportDateLabel(value: string | undefined, placeholder: string): string {
  if (!value?.trim()) return placeholder;
  const parsed = dayjs(value.trim(), ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true);
  return parsed.isValid() ? parsed.format('DD MMM YYYY, hh:mm A') : value;
}

/** Web sends from at 00:00 and to at 23:59 on the selected calendar day. */
export function buildTollReportDateValue(kind: 'from' | 'to', date: Date): string {
  const base = dayjs(date).format('YYYY-MM-DD');
  return kind === 'from' ? `${base} 00:00` : `${base} 23:59`;
}

export function getTollReportMaxSelectableDate(): Date {
  const today = dayjs();
  const fyEndYear = (today.month() >= 3 ? today.year() : today.year() - 1) + 1;
  const fyEnd = dayjs(`${fyEndYear}-03-31`).endOf('day');
  return (today.isBefore(fyEnd) ? today : fyEnd).toDate();
}

export function getTollReportMinToDate(fromDate?: string): Date {
  const earliest = dayjs(EARLIEST_TOLL_REPORT_FROM_DATE).startOf('day');
  if (!fromDate?.trim()) return earliest.toDate();
  const from = dayjs(fromDate.trim(), ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true).startOf('day');
  return from.isValid() && from.isAfter(earliest) ? from.toDate() : earliest.toDate();
}

export function validateTollReportFilters(filters: TollReportFilters): string | null {
  const hasFrom = Boolean(filters.fromDate.trim());
  const hasTo = Boolean(filters.toDate.trim());

  if ((hasFrom && !hasTo) || (!hasFrom && hasTo)) {
    return 'Please select both From and To dates.';
  }

  if (!hasFrom || !hasTo) return null;

  const from = dayjs(filters.fromDate.trim(), ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true);
  const to = dayjs(filters.toDate.trim(), ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true);

  if (!from.isValid() || !to.isValid()) {
    return 'Invalid date range.';
  }

  if (from.isBefore(dayjs(EARLIEST_TOLL_REPORT_FROM_DATE), 'day')) {
    return `From date cannot be before ${dayjs(EARLIEST_TOLL_REPORT_FROM_DATE).format('DD MMM YYYY')}.`;
  }

  if (from.isAfter(to)) {
    return 'From date cannot be after To date.';
  }

  return null;
}

/** Web renders month as "Apr, 2025" from "Apr,25" style values. */
export function formatReportMonth(monthValue?: string | null): string {
  if (!monthValue) return '—';
  const parts = monthValue.split(',');
  if (parts.length < 2) return monthValue;
  const year = parts[1].trim().length === 2 ? `20${parts[1].trim()}` : parts[1].trim();
  return `${parts[0].trim()}, ${year}`;
}
