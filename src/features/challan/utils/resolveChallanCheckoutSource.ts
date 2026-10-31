/**
 * Turns /echallan/paynow paymentLink (or legacy paymentUrl HTML) into WebView input.
 * Finii returns a pure https link → uri mode (in-app, no system browser).
 * Legacy Razorpay markup still uses html mode with checkout.js baseUrl.
 */

import { decodeEscapedPaymentHtml } from './challanApiNormalize';
import { prepareChallanPaymentHtml } from './prepareChallanPaymentHtml';

export type ChallanCheckoutMode = 'html' | 'uri';

export interface ChallanCheckoutSource {
  mode: ChallanCheckoutMode;
  value: string;
  paymentMessageToken: string | null;
}

const RAZORPAY_CHECKOUT_BASE = 'https://checkout.razorpay.com';

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Gateway HTML from Invincible/Razorpay — same shape the web portal loads in an iframe. */
function isGatewayHtml(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes('<!doctype')
    || lower.includes('<html')
    || lower.includes('<script')
    || lower.includes('setmsg')
    || lower.includes('razorpay')
    || lower.includes('checkout.js')
  );
}

function isPurePaymentUrl(value: string): boolean {
  return isHttpUrl(value) && !isGatewayHtml(value);
}

/** Web parity — decode escaped HTML, inject hooks, load with Razorpay script origin. */
export function resolveChallanCheckoutSource(paymentUrl: string): ChallanCheckoutSource {
  const cleaned = decodeEscapedPaymentHtml(paymentUrl);

  if (!cleaned) {
    throw new Error('Payment page is missing');
  }

  if (isPurePaymentUrl(cleaned)) {
    return {
      mode: 'uri',
      value: cleaned,
      paymentMessageToken: null,
    };
  }

  const prepared = prepareChallanPaymentHtml(cleaned);
  return {
    mode: 'html',
    value: prepared.html,
    paymentMessageToken: prepared.paymentMessageToken,
  };
}

/** HTML + Razorpay baseUrl — avoids data-URI size limits and loads checkout.js correctly. */
export function buildChallanWebViewSource(checkout: ChallanCheckoutSource) {
  if (checkout.mode === 'uri') {
    return { uri: checkout.value };
  }

  return {
    html: checkout.value,
    baseUrl: RAZORPAY_CHECKOUT_BASE,
  };
}
