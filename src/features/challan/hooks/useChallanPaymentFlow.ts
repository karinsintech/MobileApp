/**
 * Shared e-Challan checkout session — Finii paymentLink opens in-app WebView;
 * on returnUrl we poll /echallan/payment-status (web EchallanContainer parity).
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

/** Same labels as web EchallanContainer paymentStatus column. */
function getPaymentStatusLabel(
  transactionStatus?: string | null,
  ioStatus?: string | null,
): string {
  const normalizedTxn = transactionStatus?.toLowerCase();
  const normalizedIo = ioStatus?.toLowerCase();

  if (normalizedTxn === 'initiated') return 'In Progress';
  if (normalizedTxn === 'cancelled') return 'Cancelled';
  if (normalizedTxn === 'failed') return 'Failed';
  if (normalizedTxn === 'captured') {
    if (normalizedIo === 'done') return 'Success';
    if (normalizedIo === 'pending') return 'Payment Success–Processing';
    if (normalizedIo === 'refund') return 'Refund';
    if (normalizedIo === 'hold') return 'Hold';
    if (normalizedIo === 'other') return 'Other';
    return 'Payment Success–Processing';
  }
  return 'Pending';
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

  /**
   * After Finii redirects back into the WebView, wait briefly for the webhook
   * then read session status — never treat the return URL alone as success.
   */
  const fetchAndNotifyPaymentStatus = useCallback(async (session: PaymentSession) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const { data } = await challanApi.getPaymentStatus({
        requestId: session.requestId,
        challanNumber: session.challanNumber,
      });

      const paymentResult = String(data?.paymentResult ?? '').toLowerCase();
      const statusLabel = getPaymentStatusLabel(
        data?.transactionStatus,
        data?.ioStatus,
      );

      if (paymentResult === 'success') {
        Alert.alert('Payment Status', `Status: ${statusLabel}`);
      } else if (paymentResult === 'failed') {
        Alert.alert('Payment Status', `Status: ${statusLabel}`);
      } else if (paymentResult === 'cancelled') {
        Alert.alert('Payment Status', `Status: ${statusLabel}`);
      } else {
        // initiated / pending — webhook may still be in flight
        Alert.alert('Payment Status', `Status: ${statusLabel}`);
      }

      scheduleRefresh();
    } catch (err: unknown) {
      Alert.alert(
        'Status Unavailable',
        getApiErrorMessage(
          err,
          'Could not fetch payment status. Please refresh the list shortly.',
        ),
      );
      scheduleRefresh();
    }
  }, [scheduleRefresh]);

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

      // Block only when gateway sent no page and already marks the challan paid.
      if (shouldBlockPayNowCheckout(paymentUrl, initialChallanStatus)) {
        Alert.alert('Info', 'Challan is already paid. Cannot proceed with payment.');
        return;
      }

      // Finii requires both paymentLink and requestId (web parity).
      if (!paymentUrl || !requestId) {
        Alert.alert('Payment Error', 'Payment link not received. Please try again.');
        return;
      }

      const session = {
        requestId,
        challanNumber: normalizedChallanNo,
      };
      paymentSessionRef.current = session;

      // uri mode for Finii https link; html mode only for legacy Razorpay markup
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

    // Finii return — close modal first, then resolve webhook status (do not cancel).
    if (type === 'PAYMENT_GATEWAY_RETURN') {
      const returnSession: PaymentSession = {
        requestId: meta?.requestId || session?.requestId || '',
        challanNumber: meta?.challanNumber || session?.challanNumber || '',
      };
      closePaymentModal();

      if (!returnSession.requestId || !returnSession.challanNumber) {
        Alert.alert(
          'Status Unavailable',
          'Payment finished but session details were missing. Please refresh the list.',
        );
        scheduleRefresh();
        return;
      }

      await fetchAndNotifyPaymentStatus(returnSession);
      return;
    }

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
  }, [
    cancelPaymentSession,
    clearPaymentTimeout,
    closePaymentModal,
    fetchAndNotifyPaymentStatus,
    scheduleRefresh,
  ]);

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
