/**
 * Display-only mobile masking — never enough digits to authenticate (MM-07).
 */

/** e.g. 9876543210 → 98XXXXX210 */
export function maskMobileNumber(mobile: string): string {
  if (mobile.length !== 10) return mobile;
  return mobile.replace(/(\d{2})\d{5}(\d{3})/, '$1XXXXX$2');
}
