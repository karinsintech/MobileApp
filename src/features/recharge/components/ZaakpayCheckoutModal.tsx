/**
 * In-app Zaakpay checkout — intercepts the existing /status webhook redirect:
 * `${FRONTEND_URL}/transaction/recharge/?orderId=...&rechargeStatus=...`
 * Backend is unchanged; WebView catches this URL before the web SPA loads.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Colors, FontSize, Spacing } from '../../../theme';
import type { RechargeStartedPayload } from '../types/rechargeTypes';
import { parseRechargeReturnUrl } from '../utils/parseRechargeReturnUrl';

interface ZaakpayCheckoutModalProps {
  checkoutUrl: string | null;
  onComplete: (payload: RechargeStartedPayload) => void;
  onClose: () => void;
}

export default function ZaakpayCheckoutModal({
  checkoutUrl,
  onComplete,
  onClose,
}: ZaakpayCheckoutModalProps) {
  const insets = useSafeAreaInsets();
  const completedRef = useRef(false);
  const [isPageLoading, setIsPageLoading] = useState(true);

  useEffect(() => {
    if (checkoutUrl) {
      completedRef.current = false;
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
            source={{ uri: checkoutUrl }}
            style={styles.webview}
            originWhitelist={['https://*', 'http://*']}
            onLoadStart={(event) => handleReturnUrl(event.nativeEvent.url)}
            onLoadEnd={() => setIsPageLoading(false)}
            onNavigationStateChange={onNavigationStateChange}
            onShouldStartLoadWithRequest={(request) => !handleReturnUrl(request.url)}
            setSupportMultipleWindows={false}
            javaScriptEnabled
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
