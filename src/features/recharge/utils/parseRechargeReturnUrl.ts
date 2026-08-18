/**
 * Parses the web recharge return URL from POST /transaction/recharge/status:
 * `${FRONTEND_URL}/transaction/recharge/?orderId=...&rechargeStatus=...`
 *
 * App WebView intercepts this URL — backend /status handler is unchanged.
 * Origin is allow-listed so a gateway page cannot complete checkout via a
 * lookalike /transaction/recharge path on an attacker host (MASVS-PLATFORM-3).
 */

import { IS_DEV } from '../../../config/env';
import type { RechargeStartedPayload } from '../types/rechargeTypes';

const ALLOWED_RETURN_ORIGINS = new Set([
  'https://fleet.karins.in',
  'https://testfleet.karins.in',
  ...(IS_DEV ? ['http://localhost:3000'] : []),
]);

function parseAllowedReturnUrl(url: string): URL | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (!ALLOWED_RETURN_ORIGINS.has(parsed.origin)) return null;

    // Same path the web /status redirect uses — reject nested lookalike routes.
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    if (pathname.toLowerCase() !== '/transaction/recharge') return null;
    if (!parsed.searchParams.get('orderId')) return null;

    return parsed;
  } catch {
    // Malformed URLs are not a Karins return — do not regex-parse them.
    return null;
  }
}

export function isRechargeReturnUrl(url: string): boolean {
  return parseAllowedReturnUrl(url) !== null;
}

export function parseRechargeReturnUrl(url: string): RechargeStartedPayload | null {
  const parsed = parseAllowedReturnUrl(url);
  if (!parsed) return null;

  const orderId = parsed.searchParams.get('orderId');
  if (!orderId) return null;

  const amount = parsed.searchParams.get('amount');
  const rechargeStatus = parsed.searchParams.get('rechargeStatus');
  const message = parsed.searchParams.get('message');
  const paymentMode = parsed.searchParams.get('paymentMode');

  return {
    transactionId: orderId,
    ...(amount ? { amount } : {}),
    ...(rechargeStatus ? { rechargeStatus } : {}),
    ...(message ? { message } : {}),
    ...(paymentMode ? { paymentMode } : {}),
  };
}
