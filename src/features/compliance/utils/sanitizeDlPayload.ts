/**
 * Strip Aadhaar / biometric / raw government payload fields from DL shapes
 * before they reach React state, navigation params, or createDriver uploads.
 *
 * DPDP policy: Restricted biometric/Aadhaar data must never leave the server
 * for any role — including ADMIN. Masking is not enough for these fields.
 */

import type { DLDetailPayload } from '../types/dlDetail';

/**
 * Keys that identify Aadhaar, biometrics, or the raw Sarathi dump.
 * Includes bioPerDetAadhaar / aadharAuthenticated variants the government payload uses.
 */
const STRIP_KEY_PATTERN = /^(bioAadhaar|bioPerDetAadhaar|aadhaar|aadhar|biPhoto|biSignature|biLeftThumb|biRightThumb|fullResponse|bioObj|bioImage|biometric)/i;

function shouldStripKey(key: string): boolean {
  return STRIP_KEY_PATTERN.test(key);
}

/**
 * Deep-clone a Sarathi / DL API object while deleting Restricted keys.
 * Non-objects (primitives) are returned as-is; arrays are walked element-wise.
 */
export function sanitizeDlPayload<T>(input: T): T {
  if (input == null || typeof input !== 'object') return input;

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeDlPayload(item)) as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    // Drop Restricted fields entirely so they cannot leak via selectable Text,
    // navigation params, or a later createDriver round-trip.
    if (shouldStripKey(key)) continue;
    if (key === 'bioImageDetails' || key === 'personalDetails') {
      // personalDetails may embed Aadhaar-adjacent keys inside a nested object;
      // bioImageDetails is biometric imagery — never keep either blob client-side.
      if (key === 'bioImageDetails') continue;
      out[key] = sanitizePersonalDetails(value);
      continue;
    }
    out[key] = sanitizeDlPayload(value);
  }
  return out as T;
}

/** Keep display names only — strip any Aadhaar / auth flags nested under personalDetails. */
function sanitizePersonalDetails(value: unknown): DLDetailPayload['personalDetails'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const src = value as Record<string, unknown>;
  return {
    bioFullName: typeof src.bioFullName === 'string' ? src.bioFullName : undefined,
    bioFirstName: typeof src.bioFirstName === 'string' ? src.bioFirstName : undefined,
    bioMiddleName: typeof src.bioMiddleName === 'string' ? src.bioMiddleName : undefined,
    bioLastName: typeof src.bioLastName === 'string' ? src.bioLastName : undefined,
  };
}

/**
 * Payload safe to POST back on createDriver — same strip as UI sanitize so the
 * mobile client never re-uploads biometrics/Aadhaar it should not possess.
 */
export function sanitizeDlPayloadForPersist(input: DLDetailPayload | null | undefined): DLDetailPayload | null {
  if (!input) return null;
  return sanitizeDlPayload(input);
}
