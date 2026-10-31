/**
 * DA-claim status helpers — normalizes the granular codes returned by
 * /debit/getList into a UI group (for colour) and a human label (for display).
 */

import type { ClaimStatusGroup, ClaimsSummary } from '../../types/dashboard';
import type { ClaimListRow } from '../../services/api/claimsApi';

export type ClaimFilter =
  | 'ALL'
  | 'PENDING'
  | 'WAITING_FOR_DOC'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

export const CLAIM_FILTER_OPTS = [
  'ALL',
  'PENDING',
  'WAITING_FOR_DOC',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const satisfies readonly ClaimFilter[];

// Backend may return status as a string code, a display name, or a numeric id.
const NUMERIC_STATUS_MAP: Record<number, ClaimStatusGroup> = {
  1: 'PENDING',
  2: 'PENDING',
  3: 'WAITING_FOR_DOC',
  4: 'APPROVED',
  5: 'REJECTED',
  6: 'EXPIRED',
};

/** Pick the first populated status field from a list row. */
export function readRawClaimStatus(row: ClaimListRow): string | number | undefined {
  const raw = row.claimStatus ?? row.status ?? row.claimStatusName;
  if (raw == null || raw === '') return undefined;
  return raw;
}

/** Collapse granular backend codes into the five UI groups used for card colour. */
export function toStatusGroup(raw?: string | number | null): ClaimStatusGroup {
  if (raw == null || raw === '') return 'PENDING';

  if (typeof raw === 'number' || /^\d+$/.test(String(raw).trim())) {
    return NUMERIC_STATUS_MAP[Number(raw)] ?? 'PENDING';
  }

  const s = String(raw).toUpperCase().replace(/\s+/g, '_');

  if (/REJECT/.test(s)) return 'REJECTED';
  if (/EXPIR/.test(s)) return 'EXPIRED';
  if (/WAIT|_DOC|DOCUMENT/.test(s)) return 'WAITING_FOR_DOC';
  // CLAIM_RECEIVED is the Approved chip's ledger state — must win before the
  // broader RECEIV match below, or Approved-tab pills stay yellow (PENDING).
  if (/CLAIM_RECEIVED|CLAIM_RECEIV/.test(s) || /APPROV|CREDIT|PAID|SETTLED|SUCCESS/.test(s)) {
    return 'APPROVED';
  }
  // Requested/submitted/created remain in-flight — not approved yet.
  if (/PEND|REQUEST|RECEIV|SUBMIT|CREAT|OPEN|PROGRESS/.test(s)) return 'PENDING';

  return 'PENDING';
}

/** Label shown on each claim card — prefer the API display name over a collapsed group. */
export function formatStatusLabel(
  raw?: string | number | null,
  displayName?: string | null,
): string {
  if (displayName?.trim()) return displayName.trim();
  if (raw == null || raw === '') return 'Pending';

  const text = String(raw).trim();
  // Numeric codes fall back to the mapped group name when no display label exists.
  if (/^\d+$/.test(text)) {
    return toStatusGroup(text).replace(/_/g, ' ');
  }

  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeClaimStatusCode(raw?: string | number | null): string {
  return String(raw ?? '').toUpperCase().replace(/\s+/g, '_');
}

/** Backend "claim received" rows — the Approved chip filters on this code only. */
export function isClaimReceivedStatus(raw?: string | number | null): boolean {
  const code = normalizeClaimStatusCode(raw);
  return code.includes('CLAIM_RECEIVED') || code === 'CLAIM_RECEIV';
}

export function resolveClaimStatus(row: ClaimListRow) {
  const raw = readRawClaimStatus(row);
  const statusGroup = toStatusGroup(raw);
  const statusLabel = formatStatusLabel(raw, row.claimStatusName);
  const rawClaimStatus = normalizeClaimStatusCode(raw);
  return { statusGroup, statusLabel, rawClaimStatus };
}

/** Map UI filter chips to list rows — Approved uses claim_received, not statusGroup. */
export function matchesClaimFilter(
  rawClaimStatus: string,
  statusGroup: ClaimStatusGroup,
  filter: ClaimFilter,
): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'APPROVED') return isClaimReceivedStatus(rawClaimStatus);
  return statusGroup === filter;
}

/** Count loaded rows per chip — Approved tallies claim_received, not statusGroup. */
export function computeClaimFilterCounts(
  claims: Array<{ rawClaimStatus?: string; statusGroup: ClaimStatusGroup }>,
  totalAll: number,
): Record<ClaimFilter, number> {
  const counts: Record<ClaimFilter, number> = {
    ALL: totalAll,
    PENDING: 0,
    WAITING_FOR_DOC: 0,
    APPROVED: 0,
    REJECTED: 0,
    EXPIRED: 0,
  };

  for (const claim of claims) {
    const raw = claim.rawClaimStatus ?? '';
    for (const filterKey of CLAIM_FILTER_OPTS) {
      if (filterKey === 'ALL') continue;
      if (matchesClaimFilter(raw, claim.statusGroup, filterKey)) {
        counts[filterKey] += 1;
      }
    }
  }

  return counts;
}

/** Fleet-dashboard summary buckets — used for chip counts before all pages load. */
export function claimsSummaryToFilterCounts(
  summary: ClaimsSummary | null | undefined,
  fallbackTotal = 0,
): Record<ClaimFilter, number> {
  return {
    ALL: summary?.total ?? fallbackTotal,
    PENDING: summary?.pending ?? 0,
    WAITING_FOR_DOC: summary?.waitingForDoc ?? 0,
    APPROVED: summary?.approved ?? 0,
    REJECTED: summary?.rejected ?? 0,
    EXPIRED: summary?.expired ?? 0,
  };
}

// Mirrors web `getClaimType(type, 'list')` in Constants.ts — short labels
// used on the claims summary table.
const CLAIM_TYPE_LIST_MAP: Record<number, string> = {
  1: 'DA',
  2: 'SINGLE',
  3: 'RETURN',
  4: 'DOUBLE',
  5: 'L&T',
  6: 'OTHERS',
  7: 'SUSPICIOUS_DEBIT',
  8: 'WRONG_GPS',
};

// Mirrors web `getClaimType(type, 'view')` — full codes on the detail modal.
const CLAIM_TYPE_VIEW_MAP: Record<number, string> = {
  1: 'WRONG_DEBIT_ADJUSTMENT',
  2: 'WRONG_SINGLE',
  3: 'WRONG_RETURN',
  4: 'WRONG_DOUBLE_DEBIT',
  5: 'WRONG_L_AND_T',
  6: 'OTHERS',
  7: 'SUSPICIOUS_DEBIT',
  8: 'WRONG_GPS',
};

/** Human label for a claim's type — same mapping as the web portal. */
export function formatClaimType(
  claimType?: number | string | null,
  mode: 'list' | 'view' = 'list',
): string {
  const code = Number(claimType);
  if (!Number.isFinite(code) || code <= 0) return '';

  const map = mode === 'list' ? CLAIM_TYPE_LIST_MAP : CLAIM_TYPE_VIEW_MAP;
  return map[code] ?? '';
}
