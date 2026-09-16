/**
 * In-app Zaakpay checkout — intercepts the existing /status webhook redirect:
 * `${FRONTEND_URL}/transaction/recharge/?orderId=...&rechargeStatus=...`
 * Backend is unchanged; WebView catches this URL before the web SPA loads.
 *
 * The whole gateway journey (card / netbanking / 3DS / bank pages) must stay in
 * this modal: once a page escapes to the system browser the app never sees the
 * return URL, so the recharge silently ends without a status screen.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
  Alert, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type {
  WebViewNavigation,
  WebViewOpenWindowEvent,
  ShouldStartLoadRequest,
} from 'react-native-webview/lib/WebViewTypes';
import { Colors, FontSize, Spacing } from '../../../theme';
import type { RechargeStartedPayload } from '../types/rechargeTypes';
import { parseRechargeReturnUrl } from '../utils/parseRechargeReturnUrl';

const WEB_URL_PATTERN = /^https?:\/\//i;

/**
 * Schemes no WebView can render — UPI / wallet apps own these. Anything outside
 * this list is dropped rather than forwarded to the OS, which is what used to
 * bounce checkout into Chrome/Safari.
 */
const PAYMENT_APP_SCHEMES = new Set([
  'upi', 'intent', 'tez', 'gpay', 'bhim', 'phonepe', 'paytm', 'paytmmp',
  'credpay', 'amazonpay', 'myairtelupi', 'mobikwik', 'freecharge',
]);

interface ZaakpayCheckoutModalProps {
  checkoutUrl: string | null;
  onComplete: (payload: RechargeStartedPayload) => void;
  onClose: () => void;
}

/** Hands a UPI/wallet deep link to the installed app, warning when none exists. */
function launchPaymentApp(url: string) {
  Linking.openURL(url).catch(() => {
    Alert.alert(
      'Payment app not available',
      'The selected app is not installed. Choose another payment method to continue.',
    );
  });
}

export default function ZaakpayCheckoutModal({
  checkoutUrl,
  onComplete,
  onClose,
}: ZaakpayCheckoutModalProps) {
  const insets = useSafeAreaInsets();
  const completedRef = useRef(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  // Popup (target=_blank / window.open) target re-hosted in this same WebView.
  const [popupUrl, setPopupUrl] = useState<string | null>(null);

  useEffect(() => {
    if (checkoutUrl) {
      completedRef.current = false;
      setPopupUrl(null);
      setIsPageLoading(true);
    }
  }, [checkoutUrl]);

  const handleReturnUrl = useCallback((url: string) => {
    if (completedRef.current || !url) return false;

    const payload = parseRechargeReturnUrl(url);
    if (!payload) return false;

    completedRef.current = true;
    onComplete(payload);
    return true;
  }, [onComplete]);

  const onNavigationStateChange = useCallback((event: WebViewNavigation) => {
    handleReturnUrl(event.url);
  }, [handleReturnUrl]);

  const handleShouldStartLoad = useCallback((request: ShouldStartLoadRequest) => {
    const { url, isTopFrame } = request;

    // Return URL closes checkout before the web SPA renders inside the modal.
    if (handleReturnUrl(url)) return false;

    // Every gateway/bank page loads here, including plain-http redirects that
    // the origin whitelist would otherwise push out to the system browser.
    // about:blank is the target of 3DS form posts, so it must load too.
    if (WEB_URL_PATTERN.test(url) || url.startsWith('about:')) return true;

    const scheme = url.split(':')[0]?.toLowerCase() ?? '';
    if (PAYMENT_APP_SCHEMES.has(scheme)) {
      launchPaymentApp(url);
      return false;
    }

    // Sub-frame requests cannot navigate the modal away, so gateway iframes and
    // trackers stay allowed; only unknown top-level schemes are dropped, since
    // leaving the app mid-payment strands the txn with no status callback.
    return isTopFrame === false;
  }, [handleReturnUrl]);

  const handleOpenWindow = useCallback((event: WebViewOpenWindowEvent) => {
    const { targetUrl } = event.nativeEvent;
    if (!targetUrl || handleReturnUrl(targetUrl)) return;

    // No second WebView exists for popups, so the target is re-hosted here —
    // otherwise the OS opens it in Chrome/Safari and the payment leaves the app.
    if (WEB_URL_PATTERN.test(targetUrl)) {
      setIsPageLoading(true);
      setPopupUrl(targetUrl);
      return;
    }

    if (PAYMENT_APP_SCHEMES.has(targetUrl.split(':')[0]?.toLowerCase() ?? '')) {
      launchPaymentApp(targetUrl);
    }
  }, [handleReturnUrl]);

  const visible = !!checkoutUrl;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Complete Payment</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.85}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        {isPageLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={Colors.blue} />
          </View>
        ) : null}

        {checkoutUrl ? (
          <WebView
            // Remount on popup hand-off so the gateway page reloads in-place.
            key={popupUrl ?? checkoutUrl}
            source={{ uri: popupUrl ?? checkoutUrl }}
            style={styles.webview}
            // '*' disables the library's Linking fallback: off-whitelist URLs are
            // handed to the OS browser, which broke the in-app payment flow.
            // handleShouldStartLoad is the single gate for what may load instead.
            originWhitelist={['*']}
            onLoadStart={(event) => handleReturnUrl(event.nativeEvent.url)}
            onLoadEnd={() => setIsPageLoading(false)}
            // Without these the spinner would cover a failed gateway page forever.
            onError={() => setIsPageLoading(false)}
            onHttpError={() => setIsPageLoading(false)}
            onNavigationStateChange={onNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            // Android must allow the popup window so onOpenWindow can capture the
            // target URL; handleOpenWindow then loads it in this same WebView.
            setSupportMultipleWindows={Platform.OS === 'android'}
            onOpenWindow={handleOpenWindow}
            javaScriptEnabled
            javaScriptCanOpenWindowsAutomatically
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled={Platform.OS === 'android'}
            // Explicit default — HTTPS checkout must not pull cleartext subresources.
            mixedContentMode="never"
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },
  closeText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.blue },
  loader: {
    ...StyleSheet.absoluteFill,
    top: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.navy,
    zIndex: 2,
  },
  webview: { flex: 1, backgroundColor: Colors.white },
});
