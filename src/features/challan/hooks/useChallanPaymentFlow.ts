/**
 * Shared e-Challan checkout session — mirrors web EchallanContainer pay/cancel/timeout flow.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { challanApi } from '../../../services/api/challanApi';
import { getApiErrorMessage } from '../../../services/api/client';
import { CHALLAN_PAYMENT_TIMEOUT_MS } from '../utils/challanPaymentRules';
import {
  normalizeChallanNo,
  normalizeChallanVehicleNo,
  parsePayNowResponse,
  shouldBlockPayNowCheckout,
} from '../utils/challanApiNormalize';
import {
  resolveChallanCheckoutSource,
  type ChallanCheckoutSource,
} from '../utils/resolveChallanCheckoutSource';
import type {
  ChallanPaymentEventMeta,
  ChallanPaymentEventType,
} from '../components/ChallanPaymentCheckoutModal';

interface PaymentSession {
  requestId: string;
  challanNumber: string;
}

interface UseChallanPaymentFlowOptions {
  onRefresh?: () => void;
}

export function useChallanPaymentFlow({ onRefresh }: UseChallanPaymentFlowOptions = {}) {
  const [loadingPayButton, setLoadingPayButton] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<ChallanCheckoutSource | null>(null);
  const paymentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentSessionRef = useRef<PaymentSession | null>(null);

  const clearPaymentTimeout = useCallback(() => {
    if (paymentTimeoutRef.current) {
      clearTimeout(paymentTimeoutRef.current);
      paymentTimeoutRef.current = null;
    }
  }, []);

  const closePaymentModal = useCallback(() => {
    clearPaymentTimeout();
    setCheckout(null);
    paymentSessionRef.current = null;
  }, [clearPaymentTimeout]);

  const scheduleRefresh = useCallback(() => {
    setTimeout(() => onRefresh?.(), 2000);
  }, [onRefresh]);

  useEffect(() => () => clearPaymentTimeout(), [clearPaymentTimeout]);

  const cancelPaymentSession = useCallback(async (session: PaymentSession) => {
    try {
      await challanApi.cancelPayment({
        requestId: session.requestId,
        challanNumber: session.challanNumber,
      });
    } catch {
      // Best-effort cancel — gateway may already be settled.
    }
  }, []);

  const startPayment = useCallback(async (challanNo: string, vehicleNo: string) => {
    const normalizedChallanNo = normalizeChallanNo(challanNo);
    const normalizedVehicleNo = normalizeChallanVehicleNo(vehicleNo);
    setLoadingPayButton(normalizedChallanNo);

    try {
      const { data } = await challanApi.payNow({
        challanNo: [normalizedChallanNo],
        vehicleNo: normalizedVehicleNo,
      });

      const { paymentUrl, requestId, initialChallanStatus } = parsePayNowResponse(data);

      // Web opens checkout whenever paymentUrl is returned. amountDetail.status can
      // read "paid" while our list still shows Pending — only block when no URL.
      if (shouldBlockPayNowCheckout(paymentUrl, initialChallanStatus)) {
        Alert.alert('Info', 'Challan is already paid. Cannot proceed with payment.');
        return;
      }

      if (!paymentUrl) {
        Alert.alert('Payment Error', 'No payment page returned. Please try again.');
        return;
      }

      const session = {
        requestId: requestId || `mobile-${Date.now()}`,
        challanNumber: normalizedChallanNo,
      };
      paymentSessionRef.current = session;

      const checkoutSource = resolveChallanCheckoutSource(paymentUrl);
      setCheckout(checkoutSource);

      clearPaymentTimeout();
      paymentTimeoutRef.current = setTimeout(async () => {
        const activeSession = paymentSessionRef.current;
        if (!activeSession) return;

        await cancelPaymentSession(activeSession);
        closePaymentModal();
        Alert.alert('Payment Timeout', 'Payment session expired. Please try again.');
        scheduleRefresh();
      }, CHALLAN_PAYMENT_TIMEOUT_MS);
    } catch (err: unknown) {
      Alert.alert('Error!', getApiErrorMessage(err, 'Payment Failed'));
    } finally {
      setLoadingPayButton(null);
    }
  }, [cancelPaymentSession, clearPaymentTimeout, closePaymentModal, scheduleRefresh]);

  const handlePaymentEvent = useCallback(async (
    type: ChallanPaymentEventType,
    meta?: ChallanPaymentEventMeta,
  ) => {
    const session = paymentSessionRef.current;
    clearPaymentTimeout();
    closePaymentModal();

    if (type === 'PAYMENT_SUCCESS') {
      Alert.alert('Success!', 'Payment completed successfully');
      scheduleRefresh();
      return;
    }

    if (type === 'PAYMENT_FAILED') {
      Alert.alert('Payment Failed', 'Transaction could not be completed');
      scheduleRefresh();
      return;
    }

    if (type === 'PAYMENT_CANCEL') {
      // URL-detected cancel must not hit the server — forged status=cancel would
      // abort a legitimate in-flight payment. Gateway postMessage is token-bound.
      if (meta?.fromPostMessage && session) {
        await cancelPaymentSession(session);
      }
      Alert.alert('Payment Cancelled', 'You can retry the payment anytime');
      scheduleRefresh();
    }
  }, [cancelPaymentSession, clearPaymentTimeout, closePaymentModal, scheduleRefresh]);

  const handleClosePayment = useCallback(async () => {
    const session = paymentSessionRef.current;
    closePaymentModal();
    if (session) {
      await cancelPaymentSession(session);
      Alert.alert('Payment Cancelled', 'You can retry the payment anytime');
      scheduleRefresh();
    }
  }, [cancelPaymentSession, closePaymentModal, scheduleRefresh]);

  return {
    loadingPayButton,
    checkout,
    startPayment,
    handlePaymentEvent,
    handleClosePayment,
  };
}
