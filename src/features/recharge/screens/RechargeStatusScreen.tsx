/**
 * Recharge payment status — mirrors web transaction status modal after Zaakpay
 * redirect or immediate process-recharge response.
 *
 * Route params (deep link or WebView) are not trusted for Success/Fail/amount.
 * Status is always taken from POST /transaction/recharge/check-txn-status.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { walletApi } from '../../../services/api/walletApi';
import {
  LiquidBackground, GlassCard, ScreenHeader, StatusPill,
} from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { formatINR } from '../../../utils/format';

type PaymentState = 'pending' | 'success' | 'failed' | 'unknown';

interface RechargeStatusParams {
  transactionId?: string;
  orderId?: string;
  amount?: string | number;
  rechargeStatus?: string;
  message?: string;
  paymentMode?: string;
}

function resolvePaymentState(status?: string): PaymentState {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized.includes('SUCCESS') || normalized.includes('COMPLETED')) return 'success';
  if (normalized.includes('FAIL') || normalized.includes('CANCEL') || normalized.includes('REJECT')) {
    return 'failed';
  }
  if (!normalized) return 'pending';
  return 'pending';
}

export default function RechargeStatusScreen({ route, navigation }: any) {
  const params = route.params as RechargeStatusParams;
  // Deep link uses orderId (web parity); in-app navigation may pass transactionId.
  const transactionId = params.transactionId ?? params.orderId ?? '';

  const [state, setState] = useState<PaymentState>('pending');
  const [amount, setAmount] = useState<string | number | undefined>(undefined);
  const [paymentMode, setPaymentMode] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState('Processing your recharge…');

  const applyStatus = useCallback((next: {
    rechargeStatus?: string;
    amount?: string | number;
    message?: string;
    paymentMode?: string;
  }) => {
    const nextState = resolvePaymentState(next.rechargeStatus);
    setState(nextState);
    if (next.amount !== undefined) setAmount(next.amount);
    if (next.paymentMode) setPaymentMode(next.paymentMode);

    if (nextState === 'success') {
      setMessage(next.message ?? 'Recharge completed successfully.');
    } else if (nextState === 'failed') {
      setMessage(next.message ?? 'Recharge failed. Please try again.');
    } else {
      setMessage(next.message ?? 'Payment is still processing…');
    }
  }, []);

  const checkStatus = useCallback(async () => {
    if (!transactionId) {
      setState('unknown');
      setMessage('Missing order reference for this payment.');
      return;
    }

    try {
      const { data } = await walletApi.checkRechargeTxnStatus(transactionId);
      applyStatus({
        rechargeStatus: data?.rechargeStatus,
        amount: data?.amount,
        message: data?.message,
        paymentMode: data?.paymentMode ?? paymentMode,
      });
    } catch {
      setState('unknown');
      setMessage('Could not verify payment status.');
    }
  }, [applyStatus, paymentMode, transactionId]);

  useEffect(() => {
    if (!transactionId) {
      setState('unknown');
      setMessage('Missing order reference for this payment.');
      return;
    }

    checkStatus();
    const timer = setInterval(checkStatus, 5000);
    return () => clearInterval(timer);
  }, [checkStatus, transactionId]);

  const pillVariant = state === 'success' ? 'success' : state === 'failed' ? 'danger' : 'warning';
  const statusLabel = state === 'success'
    ? 'Success'
    : state === 'failed'
      ? 'Failed'
      : state === 'unknown'
        ? 'Unknown'
        : 'Pending';

  return (
    <LiquidBackground>
      <ScreenHeader title="Transaction Status" showBack />
      <View style={styles.body}>
        <GlassCard style={styles.card}>
          {state === 'pending' ? (
            <ActivityIndicator size="large" color={Colors.blue} style={styles.loader} />
          ) : (
            <Text style={styles.icon}>{state === 'success' ? '✅' : state === 'failed' ? '❌' : '⏳'}</Text>
          )}
          <StatusPill label={statusLabel} variant={pillVariant} />

          {amount !== undefined ? (
            <Text style={styles.amount}>{formatINR(Number(amount) || 0)}</Text>
          ) : null}

          {paymentMode ? (
            <Text style={styles.paymentMode}>Payment Method: {paymentMode}</Text>
          ) : null}

          <Text style={styles.message}>{message}</Text>
          {transactionId ? (
            <Text style={styles.txnId} selectable>Order ID: {transactionId}</Text>
          ) : null}

          <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('WalletHome')} activeOpacity={0.85}>
            <Text style={styles.btnText}>Back to Wallet</Text>
          </TouchableOpacity>
        </GlassCard>
      </View>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', padding: Spacing[4] },
  card: { alignItems: 'center', padding: Spacing[6], gap: 12 },
  loader: { marginBottom: 8 },
  icon: { fontSize: 44 },
  amount: { fontSize: 28, fontWeight: '800', color: Colors.white },
  paymentMode: { fontSize: FontSize.sm, color: Colors.blue, fontWeight: '600' },
  message: { fontSize: FontSize.base, color: Colors.text.secondary, textAlign: 'center', lineHeight: 22 },
  txnId: { fontSize: FontSize.xs, color: Colors.text.subtle, fontFamily: 'monospace' },
  btn: {
    marginTop: Spacing[2],
    backgroundColor: Colors.yellow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
  },
  btnText: { fontSize: FontSize.base, fontWeight: '800', color: Colors.navy },
});
