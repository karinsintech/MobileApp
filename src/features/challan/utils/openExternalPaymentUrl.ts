/**
 * Opens UPI / wallet / Android intent links from the challan Razorpay WebView.
 * Gateway checkout often redirects to intent:// or upi:// schemes that must leave
 * the in-app browser and hand off to PhonePe, GPay, Paytm, etc.
 */

import { Linking, Platform } from 'react-native';

function readIntentFallbackUrl(intentUrl: string): string | null {
  const match = intentUrl.match(/[;?&]S\.browser_fallback_url=([^;]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Best-effort handoff — never throws; WebView navigation should stay blocked. */
export function openExternalPaymentUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;

  const tryOpen = (target: string) => {
    Linking.openURL(target).catch(() => {});
  };

  if (Platform.OS === 'android' && /^intent:/i.test(trimmed)) {
    Linking.canOpenURL(trimmed)
      .then((canOpen) => {
        if (canOpen) {
          tryOpen(trimmed);
          return;
        }
        const fallback = readIntentFallbackUrl(trimmed);
        // Chrome extra is a browser URL only — custom schemes would open other apps as Karins.
        if (fallback && /^https?:\/\//i.test(fallback)) tryOpen(fallback);
      })
      .catch(() => {
        const fallback = readIntentFallbackUrl(trimmed);
        if (fallback && /^https?:\/\//i.test(fallback)) tryOpen(fallback);
      });
    return;
  }

  tryOpen(trimmed);
}
