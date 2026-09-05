/**
 * DPDP RED-tier display masking for the mobile client.
 *
 * Backend/web own encryption-at-rest and response masking; this layer is
 * defense-in-depth so a non-ADMIN never paints Bank / PAN / GSTIN / DL
 * plaintext even if an API payload still carries it.
 */

import type { RoleKey } from '../types/auth';

/** Only ADMIN may see RED identifiers unmasked (DPDP guardrail policy §2.1). */
export function canViewUnmaskedRedPii(roleKey?: RoleKey | string | null): boolean {
  return roleKey === 'ADMIN';
}

/**
 * Last-4 visibility pattern used for bank / GSTIN / generic IDs.
 * Short values are fully starred so we never echo the whole secret.
 */
export function maskShowLast4(value: string, minKeep = 4): string {
  const v = String(value ?? '').trim();
  if (!v) return v;
  if (v.length <= minKeep) return '*'.repeat(v.length);
  return `${'*'.repeat(v.length - 4)}${v.slice(-4)}`;
}

/** Bank account number — e.g. 123456789012 → ********9012 */
export function maskBankAccount(value: string): string {
  return maskShowLast4(value);
}

/**
 * Indian PAN (AAAAA9999A). Keep last 4 so ops can still confirm the record
 * without exposing the full tax identifier.
 */
export function maskPan(value: string): string {
  const v = String(value ?? '').trim().toUpperCase();
  if (!v) return v;
  if (v.length <= 4) return '*'.repeat(v.length);
  return `${'*'.repeat(v.length - 4)}${v.slice(-4)}`;
}

/** GSTIN — same last-4 convention as other business identifiers. */
export function maskGstin(value: string): string {
  return maskShowLast4(String(value ?? '').trim().toUpperCase());
}

/** Driving-licence number — last 4 only for non-ADMIN viewers. */
export function maskDlNumber(value: string): string {
  const v = String(value ?? '').trim().toUpperCase();
  if (!v) return v;
  if (v.length <= 4) return '*'.repeat(v.length);
  return `${'*'.repeat(v.length - 4)}${v.slice(-4)}`;
}

/**
 * Apply a mask unless the caller is ADMIN.
 * Empty / already-empty values pass through unchanged.
 */
export function redactRedPii(
  value: string | null | undefined,
  roleKey: RoleKey | string | null | undefined,
  maskFn: (raw: string) => string,
): string {
  const raw = value == null ? '' : String(value);
  if (!raw.trim()) return raw;
  if (canViewUnmaskedRedPii(roleKey)) return raw;
  return maskFn(raw);
}
