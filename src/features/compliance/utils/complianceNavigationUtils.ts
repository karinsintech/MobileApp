/**
 * Maps dashboard VAHAN compliance keys to RC list expiry filter fields (web parity).
 */

export const COMPLIANCE_EXPIRY_TYPE_MAP: Record<string, string> = {
  fitness: 'rcFitUpto',
  tax: 'rcTaxUpto',
  insurance: 'rcInsuranceUpto',
  pucc: 'rcPuccUpto',
  permit: 'rcPermitValidUpto',
  np: 'rcNpUpto',
  FITNESS: 'rcFitUpto',
  TAX: 'rcTaxUpto',
  INSURANCE: 'rcInsuranceUpto',
  PUCC: 'rcPuccUpto',
  PERMIT: 'rcPermitValidUpto',
  NP: 'rcNpUpto',
};

export type ComplianceExpiryStatus = 'expired' | 'expiring' | 'valid';

export interface RcListNavParams {
  expiryType?: string;
  expiryStatus?: ComplianceExpiryStatus;
  vehicleNo?: string;
  /** RC list status filter — BLACKLIST filters on rcBlacklistStatus (web parity). */
  status?: string;
}

/** Opens VAHAN RC list pre-filtered to blacklisted RCs (status=BLACKLIST). */
export function buildRcListBlacklistNavParams(): RcListNavParams {
  return { status: 'BLACKLIST' };
}

/** Total documents expiring soon across 7 / 15 / 30 day buckets. */
export function getComplianceExpiringCount(
  item?: { exp7?: number; exp15?: number; exp30?: number } | null,
): number {
  if (!item) return 0;
  return (item.exp7 ?? 0) + (item.exp15 ?? 0) + (item.exp30 ?? 0);
}

export function buildRcListNavParams(
  complianceKey: string,
  expiryStatus: ComplianceExpiryStatus,
  vehicleNo?: string,
): RcListNavParams {
  const expiryType = COMPLIANCE_EXPIRY_TYPE_MAP[complianceKey];
  if (!expiryType) return { expiryStatus, vehicleNo };

  return {
    expiryType,
    expiryStatus,
    ...(vehicleNo?.trim() ? { vehicleNo: vehicleNo.trim() } : {}),
  };
}
