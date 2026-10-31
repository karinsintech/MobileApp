/**
 * Detects challan gateway result URLs when checkout loads as a direct payment link
 * instead of injected Razorpay HTML (no postMessage hooks available).
 *
 * Status is read from named query params or trusted-origin pathnames only — never
 * a substring of the full URL (MASVS-CODE-4 / NPCI integrity).
 *
 * Finii does not put success/fail in the return URL — it redirects to the Karins
 * e-Challan list with requestId + challanNumber; callers then hit /payment-status.
 */

export type ChallanPaymentEventType =
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCEL'
  /** Finii returnUrl landed — resolve real outcome via /echallan/payment-status. */
  | 'PAYMENT_GATEWAY_RETURN';

export interface FiniiPaymentReturn {
  requestId: string;
  challanNumber: string;
}

/** Razorpay + Karins — pathname / Finii-return hints are allowed only on these origins. */
const TRUSTED_PAYMENT_ORIGINS = new Set([
  'https://checkout.razorpay.com',
  'https://api.razorpay.com',
  'https://fleet.karins.in',
  'https://testfleet.karins.in',
]);

/** Origins where Finii may redirect after checkout (web list returnUrl). */
const TRUSTED_FINII_RETURN_ORIGINS = new Set([
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

/**
 * Finii returnUrl (web parity): lands on Karins /echallan/list with
 * requestId + challanNumber — outcome is NOT in the URL; callers must poll
 * /echallan/payment-status. Restricted to trusted Karins origins only.
 */
export function parseFiniiPaymentReturn(url: string): FiniiPaymentReturn | null {
  if (!url?.trim()) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (!TRUSTED_FINII_RETURN_ORIGINS.has(parsed.origin)) return null;

  // Accept /echallan/list and trailing-slash variants Finii may append.
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (path !== '/echallan/list') return null;

  const requestId = (
    parsed.searchParams.get('requestId')
    ?? parsed.searchParams.get('request_id')
    ?? ''
  ).trim();
  const challanNumber = (
    parsed.searchParams.get('challanNumber')
    ?? parsed.searchParams.get('challan_number')
    ?? parsed.searchParams.get('challanNo')
    ?? ''
  ).trim();

  if (!requestId || !challanNumber) return null;

  return { requestId, challanNumber };
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

  // R5-report follow-up: a named query-param status is safe to read from ANY https
  // host — it requires an exact key+value match (see readStatusFromSearchParams),
  // never a substring, so it can't be spoofed just by choosing a domain or path. The
  // origin allowlist previously gated this too, which silently dropped legitimate
  // gateway/government-portal redirects that carry the status as a query param
  // instead of a pathname — contradicting both this file's own header comment
  // ("Status is read from named query params ... on any host") and the shipped
  // unit test for this exact case. Read query-param status first, unconditionally.
  const fromQuery = readStatusFromSearchParams(parsed.searchParams);

  if (fromQuery) {
    return fromQuery;
  }

  // Finii has no status query — only session keys on the Karins list returnUrl.
  if (parseFiniiPaymentReturn(url)) {
    return 'PAYMENT_GATEWAY_RETURN';
  }

  // Pathname hints use a looser regex/suffix match, so they stay restricted to
  // trusted origins only — an attacker-controlled https://evil.tld/paymentsuccess
  // must never be treated as a completed payment.
  if (!TRUSTED_PAYMENT_ORIGINS.has(parsed.origin)) {
    return null;
  }

  return readStatusFromPathname(parsed.pathname);
}

/**
 * Razorpay 3DS / bank popups — https only; blocks javascript/file/data handoffs.
 *
 * R3-M2 fix: this used to also require the popup target's origin to be one of the
 * handful of hardcoded payment-gateway origins in TRUSTED_PAYMENT_ORIGINS. A real
 * 3-D Secure challenge pops up to whichever domain the customer's *issuing bank*
 * hosts its ACS (Access Control Server) on — hundreds of banks, no fixed list — so
 * that check silently dropped every genuine bank OTP popup while only ever matching
 * Razorpay's own domains (confirmed: `isAllowedChallanPopupUrl` returned false for a
 * real ACS URL, and the vendor's own unit test for this function asserted the
 * opposite of what the shipped code did).
 *
 * The popup can only be opened by JS already executing inside this WebView, which
 * itself only ever loads HTTPS content — the WebView's own `originWhitelist` and
 * this module's main-frame navigation handling (see `parseChallanPaymentNavigation`
 * / `onShouldStartLoadWithRequest` in ChallanPaymentCheckoutModal) already allow
 * navigating to any HTTPS destination for the exact same reason: a payment redirect
 * chain can legitimately land on any bank's domain. Restricting only the *popup*
 * target to a smaller static allowlist added no real security boundary beyond the
 * HTTPS requirement already enforced here — it just broke the 3DS flow. Non-HTTPS
 * schemes (javascript:, file:, data:) remain blocked.
 */
export function isAllowedChallanPopupUrl(url: string): boolean {
  if (!url?.trim()) return false;

  const trimmed = url.trim();

  if (trimmed === 'about:blank') {
    return true;
  }

  try {
    const parsed = new URL(trimmed);

    // Popup navigation must use HTTPS.
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** UPI / wallet / Android intent links must leave the WebView for native payment apps. */
export function shouldOpenPaymentExternally(url: string): boolean {
  if (!url?.trim()) return false;
  return /^(upi:|tez:|phonepe:|paytmmp:|paytm:|gpay:|bhim:|intent:|market:)/i.test(url.trim());
}
