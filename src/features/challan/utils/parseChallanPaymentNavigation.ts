/**
 * Detects challan gateway result URLs when checkout loads as a direct payment link
 * instead of injected Razorpay HTML (no postMessage hooks available).
 *
 * Status is read from named query params or trusted-origin pathnames only — never
 * a substring of the full URL (MASVS-CODE-4 / NPCI integrity).
 */

export type ChallanPaymentEventType = 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_CANCEL';

/** Razorpay + Karins — pathname hints are allowed only on these origins. */
const TRUSTED_PAYMENT_ORIGINS = new Set([
  'https://checkout.razorpay.com',
  'https://api.razorpay.com',
  'https://fleet.karins.in',
  'https://testfleet.karins.in',
]);

const STATUS_QUERY_KEYS = [
  'status',
  'paymentstatus',
  'payment_status',
  'razorpay_payment_status',
  'paymentStatus',
];

function mapStatusValue(raw: string): ChallanPaymentEventType | null {
  const value = raw.toLowerCase().trim();
  if (!value) return null;

  if (
    value === 'success'
    || value === 'successful'
    || value === 'captured'
    || value === 'completed'
    || value === 'paid'
  ) {
    return 'PAYMENT_SUCCESS';
  }

  if (
    value === 'fail'
    || value === 'failed'
    || value === 'failure'
    || value === 'declined'
    || value === 'rejected'
  ) {
    return 'PAYMENT_FAILED';
  }

  if (
    value === 'cancel'
    || value === 'cancelled'
    || value === 'canceled'
  ) {
    return 'PAYMENT_CANCEL';
  }

  return null;
}

function readStatusFromSearchParams(params: URLSearchParams): ChallanPaymentEventType | null {
  for (const key of STATUS_QUERY_KEYS) {
    const direct = params.get(key);
    if (direct) {
      const mapped = mapStatusValue(direct);
      if (mapped) return mapped;
    }
  }

  // Case-insensitive key match — gateways vary casing on query names.
  for (const [key, val] of params.entries()) {
    if (!STATUS_QUERY_KEYS.some((k) => k.toLowerCase() === key.toLowerCase())) continue;
    const mapped = mapStatusValue(val);
    if (mapped) return mapped;
  }

  return null;
}

/** Path segment match on trusted hosts only — avoids paymentsuccess.evil.tld hostname tricks. */
function readStatusFromPathname(pathname: string): ChallanPaymentEventType | null {
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/';

  if (
    /\/payment(-|_)?success(ful)?$/i.test(path)
    || path.endsWith('/paymentsuccess')
  ) {
    return 'PAYMENT_SUCCESS';
  }

  if (
    /\/payment(-|_)?fail(ed)?$/i.test(path)
    || path.endsWith('/paymentfail')
  ) {
    return 'PAYMENT_FAILED';
  }

  if (
    /\/payment(-|_)?cancel(led)?$/i.test(path)
    || path.endsWith('/paymentcancel')
  ) {
    return 'PAYMENT_CANCEL';
  }

  return null;
}

export function parseChallanPaymentNavigation(
  url: string,
): ChallanPaymentEventType | null {
  if (!url?.trim()) return null;

  let parsed: URL;

  try {                                                  
    parsed = new URL(url);
  } catch {                                                                                       
    return null;
  }

  // Only HTTPS payment URLs are trusted.
  if (parsed.protocol !== 'https:') {
    return null;
  }

  // Never trust payment status from an untrusted origin.
  if (!TRUSTED_PAYMENT_ORIGINS.has(parsed.origin)) {
    return null;
  }

  // Read status only from an actual named query parameter.
  const fromQuery = readStatusFromSearchParams(parsed.searchParams);

  if (fromQuery) {
    return fromQuery;
  }

  // Pathname hints are also allowed only on trusted origins.
  return readStatusFromPathname(parsed.pathname);
}

/** Razorpay 3DS / bank popups — https only; blocks javascript/file/data handoffs. */
export function isAllowedChallanPopupUrl(url: string): boolean {
  if (!url?.trim()) return false;

  const trimmed = url.trim();

  if (trimmed === 'about:blank') {
    return true;
  }

  try {
    const parsed = new URL(trimmed);

    // Popup navigation must use HTTPS.
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Popup must belong to a trusted payment origin.
    return TRUSTED_PAYMENT_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}

/** UPI / wallet / Android intent links must leave the WebView for native payment apps. */
export function shouldOpenPaymentExternally(url: string): boolean {
  if (!url?.trim()) return false;
  return /^(upi:|tez:|phonepe:|paytmmp:|paytm:|gpay:|bhim:|intent:|market:)/i.test(url.trim());
}
