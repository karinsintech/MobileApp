/**
 * Strip Aadhaar / fingerprint / raw government dump fields from DL shapes
 * before they reach React state, navigation params, or createDriver uploads.
 *
 * Face photo (bioImageDetails.biPhoto) is kept for View / Check Status display
 * — same as web DrivingLicenseContainer. Thumbprints, signatures and Aadhaar
 * remain Restricted and are never held client-side.
 */

import type { DLDetailPayload } from '../types/dlDetail';

/**
 * Keys that identify Aadhaar, fingerprints, signatures, or the raw Sarathi dump.
 * Exact-name match only — `bioImage` must NOT match `bioImageDetails` (face photo).
 */
const STRIP_KEY_PATTERN = /^(bioAadhaar|bioPerDetAadhaar|aadhaar|aadhar|biSignature|biLeftThumb|biRightThumb|fullResponse|bioObj|bioImage|biometric)$/i;

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
    // Face photo container first — must run before strip rules (bioImage ≠ bioImageDetails).
    if (key === 'bioImageDetails') {
      out[key] = sanitizeBioImageDetails(value);
      continue;
    }
    if (key === 'personalDetails') {
      // personalDetails may embed Aadhaar-adjacent keys inside a nested object.
      out[key] = sanitizePersonalDetails(value);
      continue;
    }
    // Drop Restricted fields entirely so they cannot leak via selectable Text
    // or a later createDriver round-trip.
    if (shouldStripKey(key)) continue;
    // Drop loose biPhoto if it appears outside bioImageDetails.
    if (key === 'biPhoto') continue;
    out[key] = sanitizeDlPayload(value);
  }
  return out as T;
}

/** Face photo only — fingerprints / signature never reach React state. */
function sanitizeBioImageDetails(value: unknown): DLDetailPayload['bioImageDetails'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const src = value as Record<string, unknown>;
  const biPhoto = typeof src.biPhoto === 'string' ? src.biPhoto.trim() : '';
  if (!biPhoto) return undefined;
  return { biPhoto };
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
 * Payload safe to POST on createDriver — never re-upload face/biometrics/Aadhaar.
 * Display sanitize keeps biPhoto; persist strips the whole bioImageDetails blob.
 */
export function sanitizeDlPayloadForPersist(input: DLDetailPayload | null | undefined): DLDetailPayload | null {
  if (!input) return null;
  const cleaned = sanitizeDlPayload(input);
  if (cleaned.bioImageDetails) {
    const { bioImageDetails: _omit, ...rest } = cleaned;
    return rest;
  }
  return cleaned;
}

/**
 * Build a usable Image URI for Sarathi face photos (web toDlPhotoSrc parity).
 * API may return raw base64 or an already-prefixed data URL.
 */
export function toDlPhotoSrc(biPhoto?: string | null): string | null {
  if (!biPhoto || typeof biPhoto !== 'string') return null;
  const trimmed = biPhoto.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image')) return trimmed;
  return `data:image/jpeg;base64,${trimmed}`;
}
