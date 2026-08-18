/**
 * In-app e-Challan checkout — loads gateway HTML (Razorpay baseUrl) or a payment URL.
 * Mirrors web EchallanContainer iframe checkout with UPI intent and postMessage hooks.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type {
  WebViewMessageEvent,
  WebViewNavigation,
  WebViewOpenWindowEvent,
  ShouldStartLoadRequest,
} from 'react-native-webview/lib/WebViewTypes';
import { Colors, FontSize, Spacing } from '../../../theme';
import {
  buildChallanWebViewSource,
  type ChallanCheckoutSource,
} from '../utils/resolveChallanCheckoutSource';
import {
  isAllowedChallanPopupUrl,
  parseChallanPaymentNavigation,
  shouldOpenPaymentExternally,
  type ChallanPaymentEventType,
} from '../utils/parseChallanPaymentNavigation';
import { openExternalPaymentUrl } from '../utils/openExternalPaymentUrl';

export type { ChallanPaymentEventType };

export interface ChallanPaymentEventMeta {
  /** Token-validated gateway postMessage — safe to sync server cancel. */
  fromPostMessage?: boolean;
}

interface ChallanPaymentCheckoutModalProps {
  checkout: ChallanCheckoutSource | null;
  onEvent: (type: ChallanPaymentEventType, meta?: ChallanPaymentEventMeta) => void;
  onClose: () => void;
}

export default function ChallanPaymentCheckoutModal({
  checkout,
  onEvent,
  onClose,
}: ChallanPaymentCheckoutModalProps) {
  const insets = useSafeAreaInsets();
  const handledRef = useRef(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [forcedUrl, setForcedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (checkout) {
      handledRef.current = false;
      setForcedUrl(null);
      setIsPageLoading(true);
    }
  }, [checkout]);

  const emitEvent = useCallback((type: ChallanPaymentEventType, meta?: ChallanPaymentEventMeta) => {
    if (handledRef.current) return;
    handledRef.current = true;
    onEvent(type, meta);
  }, [onEvent]);

  const handleNavigationUrl = useCallback((url: string): boolean => {
    if (!url || url.startsWith('data:') || url === 'about:blank') return false;

    const eventType = parseChallanPaymentNavigation(url);
    if (eventType) {
      emitEvent(eventType);
      return true;
    }
    return false;
  }, [emitEvent]);

  const handleExternalUrl = useCallback((url: string): boolean => {
    if (!shouldOpenPaymentExternally(url)) return false;
    openExternalPaymentUrl(url);
    return true;
  }, []);

  const handleMessage = useCallback((raw: string) => {
    if (handledRef.current || !checkout?.paymentMessageToken) return;

    try {
      const data = JSON.parse(raw) as {
        type?: ChallanPaymentEventType;
        paymentMessageToken?: string;
      };

      if (data.paymentMessageToken !== checkout.paymentMessageToken) return;
      if (
        data.type !== 'PAYMENT_SUCCESS'
        && data.type !== 'PAYMENT_FAILED'
        && data.type !== 'PAYMENT_CANCEL'
      ) {
        return;
      }

      emitEvent(data.type, { fromPostMessage: true });
    } catch {
      // Ignore non-JSON messages from the gateway page.
    }
  }, [checkout?.paymentMessageToken, emitEvent]);

  const onNavigationStateChange = useCallback((event: WebViewNavigation) => {
    handleNavigationUrl(event.url);
  }, [handleNavigationUrl]);

  const onShouldStartLoadWithRequest = useCallback((request: ShouldStartLoadRequest): boolean => {
    if (handleNavigationUrl(request.url)) return false;
    if (handleExternalUrl(request.url)) return false;
    return true;
  }, [handleExternalUrl, handleNavigationUrl]);

  const visible = !!checkout;

  const webSource = useMemo(() => {
    if (forcedUrl) return { uri: forcedUrl };
    if (!checkout) return undefined;
    return buildChallanWebViewSource(checkout);
  }, [checkout, forcedUrl]);

  const webViewKey = forcedUrl
    ? `forced-${forcedUrl}`
    : checkout
      ? `${checkout.mode}-${checkout.paymentMessageToken ?? checkout.value.length}`
      : 'idle';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Pay Challan</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.85}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        {isPageLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={Colors.blue} />
            <Text style={styles.loaderText}>Opening payment portal...</Text>
          </View>
        ) : null}

        {checkout && webSource ? (
          <WebView
            key={webViewKey}
            source={webSource}
            style={styles.webview}
            originWhitelist={['*']}
            onLoadStart={(event) => {
              handleNavigationUrl(event.nativeEvent.url);
            }}
            onLoadEnd={() => setIsPageLoading(false)}
            onError={() => setIsPageLoading(false)}
            onHttpError={() => setIsPageLoading(false)}
            onNavigationStateChange={onNavigationStateChange}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onMessage={(event: WebViewMessageEvent) => handleMessage(event.nativeEvent.data)}
            onOpenWindow={(event: WebViewOpenWindowEvent): void => {
              const targetUrl = event.nativeEvent.targetUrl;
              if (targetUrl && isAllowedChallanPopupUrl(targetUrl)) {
                setForcedUrl(targetUrl);
              }
            }}
            javaScriptEnabled
            javaScriptCanOpenWindowsAutomatically
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled={Platform.OS === 'android'}
            // Block http:// scripts/images inside this https:// Razorpay document (MASVS-NETWORK-1).
            mixedContentMode="never"
            setSupportMultipleWindows={Platform.OS === 'android'}
            allowsInlineMediaPlayback
            startInLoadingState
            cacheEnabled
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
    gap: Spacing[3],
  },
  loaderText: { fontSize: FontSize.sm, color: Colors.text.secondary },
  webview: { flex: 1, backgroundColor: Colors.white },
});
