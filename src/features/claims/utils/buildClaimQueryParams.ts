/**
 * Maps claim filter form state to /debit/getList query params (web parity).
 */

import type { ClaimsParams } from '../../../services/api/claimsApi';
import type { ClaimFilter } from '../claimStatus';
import type { ClaimFilters } from '../constants/claimFilters';
import { resolveClaimDateRange } from './claimDateRange';

/** Quick status chips map to the same API codes as the web status dropdown. */
export function claimStatusFromChip(chip: ClaimFilter): string | undefined {
  switch (chip) {
    case 'ALL': return undefined;
    case 'WAITING_FOR_DOC': return 'WAITING_FOR_DOC';
    case 'APPROVED': return 'CLAIM_RECEIVED';
    case 'REJECTED': return 'CLAIM_REJECTED';
    case 'EXPIRED': return 'EXPIRED';
    default: return undefined;
  }
}

export function buildClaimQueryParams(
  filters: ClaimFilters,
  pageNo: number,
  size: number,
  contextCustomerId?: number | null,
  chipFilter: ClaimFilter = 'ALL',
): ClaimsParams {
  const chipStatus = claimStatusFromChip(chipFilter);
  const panelStatus = filters.claimStatus.trim() || undefined;
  const claimStatus = chipStatus ?? panelStatus ?? 'undefined';
  const { fromDateTime, toDateTime } = resolveClaimDateRange(
    filters.fromDateTime,
    filters.toDateTime,
  );

  const params: ClaimsParams = {
    pageNo,
    size,
    reqFrom: 'claimSummary',
    // dateFilterType alone does not cap results — backend applies dates only when both bounds are set.
    dateFilterType: filters.dateFilterType || 'transactionDate',
    vehicleNo: filters.vehicleNo.trim(),
    tollName: filters.tollName.trim(),
    customerName: filters.customerName.trim(),
    rrn: filters.rrn.trim(),
    m2pTollId: filters.m2pTollId.trim(),
    exitType: filters.exitType || '',
    fromDateTime,
    toDateTime,
    claimStatus,
    claimType: filters.claimType || 'undefined',
    claimLevel: filters.claimLevel || 'undefined',
    txnReaderDateTimeSort: 'descend',
  };

  // Web sends customerName only; keep dashboard customer scope when no name filter is set.
  if (!filters.customerName.trim() && contextCustomerId) {
    params.customerId = contextCustomerId;
  }

  return params;
}
