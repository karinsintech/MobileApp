/**
 * Recharge tab — wallet top-up flow aligned with web RechargeContainer modal:
 * admin customer picker + balance check, quick amounts, Zaakpay redirect.
 * CUSTOMER / CUSTOMER_GROUP_ADMIN hide the picker (session-scoped wallet).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { GlassCard } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import {
  walletApi,
  ADMIN_PARTNER_YAP_ENTITY_ID,
  unwrapCustomerBalance,
  type CustomerBalanceResponse,
} from '../../../services/api/walletApi';
import { formatINR } from '../../../utils/format';
import type { RoleKey } from '../../../types/auth';
import { hidesRechargeCustomerPicker } from '../../../types/auth';
import ZaakpayCheckoutModal from '../../recharge/components/ZaakpayCheckoutModal';
import type { RechargeStartedPayload } from '../../recharge/types/rechargeTypes';

/** Same preset amounts as web RechargeContainer quickAmounts. */
const QUICK_AMOUNTS = ['100', '200', '500', '1000', '1500', '2000', '2500', '5000'];

interface FastagUserOption {
  yapEntityId: string;
  firstName: string;
}

interface WalletRechargeTabProps {
  roleKey?: RoleKey;
  onRechargeStarted: (payload: RechargeStartedPayload) => void;
}

export default function WalletRechargeTab({
  roleKey,
  onRechargeStarted,
}: WalletRechargeTabProps) {
  // CUSTOMER + CGA: wallet comes from login / header-switched session — no picker.
  const hideCustomerPicker = hidesRechargeCustomerPicker(roleKey);
  const isAdminRole = roleKey === 'ADMIN';

  const [amount, setAmount] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [checkCustomerData, setCheckCustomerData] = useState<CustomerBalanceResponse | null>(null);
  const [customers, setCustomers] = useState<FastagUserOption[]>([]);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [adminBalance, setAdminBalance] = useState<number | null>(null);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [checkingCustomer, setCheckingCustomer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [zaakpayCheckoutUrl, setZaakpayCheckoutUrl] = useState<string | null>(null);

  const isAmountValid = useMemo(
    () => amount.trim() !== '' && /^[0-9]+$/.test(amount) && Number(amount) > 0,
    [amount],
  );

  const customerLabel = useMemo(() => {
    if (!customerId) return 'Select Customer';
    const match = customers.find((c) => c.yapEntityId === customerId);
    return match ? `${match.yapEntityId} - ${match.firstName}` : customerId;
  }, [customerId, customers]);

  const fetchAdminBalance = useCallback(async (silent = false) => {
    try {
      const { data } = await walletApi.getCustomerBalance({
        checkBalance: true,
        yapEntityId: ADMIN_PARTNER_YAP_ENTITY_ID,
      });
      const apiData = unwrapCustomerBalance(data);
      setAdminBalance(Number(apiData.fastagBalance) || 0);
      if (silent) {
        Alert.alert('Success', 'Balance refreshed successfully');
      }
    } catch (err: any) {
      if (!silent) return;
      Alert.alert('Warning', err?.message ?? 'Unable to fetch balance. Please try again later.');
    }
  }, []);

  useEffect(() => {
    if (!isAdminRole) return;
    fetchAdminBalance();
  }, [fetchAdminBalance, isAdminRole]);

  // Admin (and other picker roles) load fastag-users; CGA uses switch-customer session.
  useEffect(() => {
    if (hideCustomerPicker) return;
    (async () => {
      try {
        const { data } = await walletApi.getFastagUsers();
        const mapped = (data?.data ?? []).map((item) => ({
          yapEntityId: String(item.yapEntityId ?? ''),
          firstName: item.firstName ?? '',
        }));
        setCustomers(mapped.filter((row) => row.yapEntityId));
      } catch {
        setCustomers([]);
      }
    })();
  }, [hideCustomerPicker]);

  const handleCustomerIdCheck = async () => {
    if (!customerId) {
      Alert.alert('Customer required', 'Please select a Customer ID.');
      return;
    }

    setCheckingCustomer(true);
    try {
      const { data } = await walletApi.getCustomerBalance({
        checkBalance: true,
        yapEntityId: customerId,
      });
      setCheckCustomerData(unwrapCustomerBalance(data));
      setShowDetails(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Unable to fetch customer details.');
      setShowDetails(false);
      setCheckCustomerData(null);
    } finally {
      setCheckingCustomer(false);
    }
  };

  const submit = async () => {
    if (!isAmountValid) {
      Alert.alert('Invalid amount', 'Enter a valid recharge amount greater than zero.');
      return;
    }

    // Admin must target a yapEntityId — CGA/CUSTOMER omit customerId (server uses session).
    if (!hideCustomerPicker && !customerId) {
      Alert.alert('Customer required', 'Please select a Customer ID.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await walletApi.processRecharge({
        amount,
        // Only send when picker selected a target; CGA relies on active customer session.
        ...(customerId ? { customerId } : {}),
      });

      const {
        checkoutUrl,
        orderId,
        rechargeStatus,
        amount: rechargeAmount,
        message,
        paymentMode,
      } = data;

      // Zaakpay — in-app WebView intercepts web return URL (/transaction/recharge/?...).
      if (checkoutUrl) {
        setZaakpayCheckoutUrl(checkoutUrl);
        return;
      }

      // Admin direct wallet transfer — immediate status, no payment gateway.
      if (orderId && rechargeStatus) {
        setAmount('');
        setSelectedAmount(null);
        setCustomerId(null);
        setShowDetails(false);
        setCheckCustomerData(null);
        onRechargeStarted({
          transactionId: orderId,
          amount: rechargeAmount,
          rechargeStatus,
          message,
          paymentMode,
        });
        return;
      }

      Alert.alert('Recharge failed', 'No payment session returned. Please try again.');
    } catch (err: any) {
      Alert.alert('Payment Error', err?.message ?? 'Unable to start payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {isAdminRole ? (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 0 }]}>PARTNER WALLET</Text>
          <GlassCard style={styles.adminBalanceCard}>
            <View style={styles.adminBalanceRow}>
              <Text style={styles.adminBalanceText}>
                Wallet Balance {formatINR(adminBalance ?? 0)}
              </Text>
              <TouchableOpacity
                onPress={async () => {
                  setRefreshingBalance(true);
                  await fetchAdminBalance(true);
                  setRefreshingBalance(false);
                }}
                disabled={refreshingBalance}
                hitSlop={8}
              >
                {refreshingBalance
                  ? <ActivityIndicator size="small" color={Colors.blue} />
                  : <Text style={styles.refreshIcon}>↻</Text>}
              </TouchableOpacity>
            </View>
          </GlassCard>
        </>
      ) : null}

      {!hideCustomerPicker ? (
        <>
          <Text style={styles.sectionLabel}>CUSTOMER</Text>
          <GlassCard style={styles.customerCard}>
            <View style={styles.customerRow}>
              <TouchableOpacity
                style={styles.customerSelect}
                onPress={() => setCustomerPickerOpen(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.customerSelectLabel}>Customer ID</Text>
                <Text style={styles.customerSelectValue} numberOfLines={1}>{customerLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.checkBtn, checkingCustomer && styles.checkBtnDisabled]}
                onPress={handleCustomerIdCheck}
                disabled={checkingCustomer}
                activeOpacity={0.85}
              >
                {checkingCustomer
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.checkBtnText}>Check</Text>}
              </TouchableOpacity>
            </View>

            {showDetails && checkCustomerData ? (
              <View style={styles.customerDetails}>
                <Text style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Customer ID: </Text>
                  {checkCustomerData.customerId ?? customerId}
                </Text>
                <Text style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Customer Name: </Text>
                  {checkCustomerData.customerName ?? '—'}
                </Text>
                <Text style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Available Balance: </Text>
                  {formatINR(Number(checkCustomerData.totalBalance) || 0)}
                </Text>
              </View>
            ) : null}
          </GlassCard>
        </>
      ) : null}

      <Text style={styles.sectionLabel}>AMOUNT</Text>
      <GlassCard style={styles.amountCard}>
        <View
          style={[
            styles.amountInputRow,
            // Border tone doubles as validation feedback once the user types.
            amount.trim() !== ''
              && (isAmountValid ? styles.amountInputRowValid : styles.amountInputRowInvalid),
          ]}
        >
          <Text style={styles.rupee}>₹</Text>
          <TextInput
            style={styles.amountInput}
            keyboardType="number-pad"
            value={amount}
            onChangeText={(text) => {
              setAmount(text.replace(/[^0-9]/g, ''));
              setSelectedAmount(null);
            }}
            placeholder="Enter amount"
            placeholderTextColor={Colors.text.subtle}
          />
          {amount.trim() !== '' ? (
            <Text style={[styles.amountHint, isAmountValid ? styles.amountValid : styles.amountInvalid]}>
              {isAmountValid ? '✓' : '✕'}
            </Text>
          ) : null}
        </View>
        <View style={styles.quickRow}>
          {QUICK_AMOUNTS.map((quickAmount) => (
            <TouchableOpacity
              key={quickAmount}
              style={[styles.quickChip, selectedAmount === quickAmount && styles.quickChipActive]}
              onPress={() => {
                setAmount(quickAmount);
                setSelectedAmount(quickAmount);
              }}
            >
              <Text style={[styles.quickText, selectedAmount === quickAmount && styles.quickTextActive]}>
                {formatINR(Number(quickAmount), true)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </GlassCard>

      <TouchableOpacity
        style={[styles.cta, (submitting || !isAmountValid) && styles.ctaDisabled]}
        onPress={submit}
        disabled={submitting || !isAmountValid}
        activeOpacity={0.85}
      >
        {submitting
          ? <ActivityIndicator color={Colors.navy} />
          : <Text style={styles.ctaText}>Transfer {amount ? formatINR(Number(amount)) : ''}</Text>}
      </TouchableOpacity>

      <ZaakpayCheckoutModal
        checkoutUrl={zaakpayCheckoutUrl}
        onClose={() => setZaakpayCheckoutUrl(null)}
        onComplete={(payload) => {
          setZaakpayCheckoutUrl(null);
          setAmount('');
          setSelectedAmount(null);
          setCustomerId(null);
          setShowDetails(false);
          setCheckCustomerData(null);
          onRechargeStarted(payload);
        }}
      />

      <Modal
        visible={customerPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomerPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCustomerPickerOpen(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Customer</Text>
            <ScrollView>
              {customers.map((customer) => (
                <TouchableOpacity
                  key={customer.yapEntityId}
                  style={styles.modalItem}
                  onPress={() => {
                    setCustomerId(customer.yapEntityId);
                    setShowDetails(false);
                    setCheckCustomerData(null);
                    setCustomerPickerOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      customerId === customer.yapEntityId && styles.modalItemActive,
                    ]}
                  >
                    {customer.yapEntityId} - {customer.firstName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing[4], paddingTop: Spacing[2], paddingBottom: 32 },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text.label,
    letterSpacing: 1.2,
    marginBottom: Spacing[2],
    marginTop: Spacing[3],
  },
  adminBalanceCard: { paddingVertical: Spacing[3], paddingHorizontal: Spacing[4] },
  adminBalanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  adminBalanceText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.blue },
  refreshIcon: { fontSize: 20, color: Colors.blue, fontWeight: '700' },
  customerCard: { padding: Spacing[4], gap: Spacing[3] },
  customerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  customerSelect: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    backgroundColor: Colors.glass.bg,
  },
  customerSelectLabel: { fontSize: FontSize.xs, color: Colors.text.label, marginBottom: 4 },
  customerSelectValue: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '600' },
  checkBtn: {
    backgroundColor: Colors.blue,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    minWidth: 72,
    alignItems: 'center',
  },
  checkBtnDisabled: { opacity: 0.7 },
  checkBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },
  customerDetails: {
    borderWidth: 1,
    borderColor: Colors.successBorder,
    backgroundColor: Colors.successBg,
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: 6,
  },
  detailRow: { fontSize: FontSize.sm, color: Colors.white },
  detailLabel: { fontWeight: '700', color: Colors.text.secondary },
  amountCard: { paddingVertical: Spacing[4] },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.bg,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  amountInputRowValid: { borderColor: Colors.successBorder },
  amountInputRowInvalid: { borderColor: Colors.dangerBorder },
  rupee: { fontSize: 28, fontWeight: '700', color: Colors.text.subtle },
  amountInput: { flex: 1, fontSize: 30, fontWeight: '800', color: Colors.white, padding: 0 },
  amountHint: { fontSize: FontSize.lg, fontWeight: '800' },
  amountValid: { color: Colors.successLight },
  amountInvalid: { color: Colors.dangerLight },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.full,
  },
  quickChipActive: { backgroundColor: Colors.warningBg, borderColor: Colors.warningBorder },
  quickText: { fontSize: FontSize.sm, color: Colors.text.secondary, fontWeight: '600' },
  quickTextActive: { color: Colors.warningLight },
  cta: {
    backgroundColor: Colors.yellow,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    marginTop: Spacing[6],
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.navy },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '70%',
    backgroundColor: Colors.navy,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing[4],
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: Spacing[3],
  },
  modalItem: { paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.divider },
  modalItemText: { fontSize: FontSize.base, color: Colors.text.secondary },
  modalItemActive: { color: Colors.warningLight, fontWeight: '700' },
});
