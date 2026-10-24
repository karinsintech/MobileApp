import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { challanApi } from '../../../services/api/challanApi';
import { useAppSelector } from '../../../store';
import { LiquidBackground, GlassCard, StatusPill, SkeletonCard, EmptyState, ScreenHeader } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { formatINR, fmtDate } from '../../../utils/format';
import { requiresAdminContextPicker, resolveActiveCustomerId, isCustomerGroupAdmin } from '../../../types/auth';
import type { MoreStackParamList } from '../../../navigation/types';
import { mapChallanListRow, type ChallanListItem } from '../mapChallanRow';
import ChallanPaymentCheckoutModal from '../components/ChallanPaymentCheckoutModal';
import { canPayChallan, hasChallanReceipt } from '../utils/challanPaymentRules';
import { checkChallanStatus, openChallanReceipt } from '../utils/challanPaymentAlerts';
import { useChallanPaymentFlow } from '../hooks/useChallanPaymentFlow';

type ChallanTab = 'pending' | 'disposed' | 'all';

const TABS: { key: ChallanTab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'disposed', label: 'Disposed' },
  { key: 'all', label: 'All' },
];

function challanDisplay(item: ChallanListItem) {
  if (item.isDisposed) {
    return { label: 'Disposed', pill: 'success' as const, card: 'success' as const };
  }
  if (item.isPending) {
    return { label: 'Pending', pill: 'danger' as const, card: 'danger' as const };
  }
  const label = item.status?.trim() || 'Unknown';
  return { label, pill: 'neutral' as const, card: 'default' as const };
}

export default function ChallanScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<RouteProp<MoreStackParamList, 'ChallanList'>>();
  const { user, dashboardContext } = useAppSelector((s) => s.auth);
  const customerId = resolveActiveCustomerId(dashboardContext, user?.defaultCustomerId);
  const canScopeByCustomerId = requiresAdminContextPicker(user?.roleKey);
  const needsCustomerScope =
    canScopeByCustomerId || (user ? isCustomerGroupAdmin(user.roleKey) : false);

  const [tab, setTab] = useState<ChallanTab>(() => {
    const status = route.params?.initialStatus;
    if (status === 'Disposed') return 'disposed';
    if (status === 'All') return 'all';
    return 'pending';
  });
  const [challans, setChallans] = useState<ChallanListItem[]>([]);
  const [summary, setSummary] = useState<{
    pendingCount: number;
    pendingAmount: number;
    paidAmount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingStatusNo, setCheckingStatusNo] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);

  const fetchData = useCallback(async (isRefresh = false) => {
    // Keep the skeleton up until CGA/admin context has a customer — early empty
    // looked like "not fetching" until the operator tapped a tab/filter.
    if (needsCustomerScope && !customerId) {
      setLoading(true);
      return;
    }
    const seq = ++fetchSeqRef.current;
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const statusParam = tab === 'pending' ? 'Pending' : tab === 'disposed' ? 'Disposed' : 'All';
      const scopeParams = canScopeByCustomerId && customerId ? { customerId } : {};
      const vehicleFilter = route.params?.initialVehicleNo
        ? { vehicleNo: route.params.initialVehicleNo.trim() }
        : {};

      // Tab list for the feed; Pending + Disposed summaries stay accurate on every tab.
      // "Paid" in this product means Disposed status (not payment-gateway Success).
      const [listRes, pendingRes, disposedRes] = await Promise.all([
        challanApi.getList({
          ...scopeParams,
          ...vehicleFilter,
          status: statusParam,
          pageNo: 1,
          pageSize: 25,
        }),
        tab === 'pending'
          ? Promise.resolve(null)
          : challanApi.getList({
            ...scopeParams,
            ...vehicleFilter,
            status: 'Pending',
            pageNo: 1,
            pageSize: 500,
          }),
        tab === 'disposed'
          ? Promise.resolve(null)
          : challanApi.getList({
            ...scopeParams,
            ...vehicleFilter,
            status: 'Disposed',
            pageNo: 1,
            pageSize: 500,
          }),
      ]);
      if (seq !== fetchSeqRef.current) return;

      const rows: any[] = listRes.data.data ?? listRes.data.rows ?? [];
      const mapped = rows.map(mapChallanListRow);

      const initialChallanNo = route.params?.initialChallanNo?.trim().toLowerCase();
      const scopedRows = initialChallanNo
        ? mapped.filter((row) => row.challanNo.toLowerCase().includes(initialChallanNo))
        : mapped;

      setChallans(scopedRows);

      const pendingRows = tab === 'pending'
        ? scopedRows.filter((c) => c.isPending)
        : (pendingRes?.data.data ?? pendingRes?.data.rows ?? []).map(mapChallanListRow);

      const disposedRows = tab === 'disposed'
        ? scopedRows.filter((c) => c.isDisposed)
        : (disposedRes?.data.data ?? disposedRes?.data.rows ?? []).map(mapChallanListRow);

      setSummary({
        pendingCount: pendingRows.length,
        pendingAmount: pendingRows.reduce((sum: number, c:ChallanListItem) => sum + c.fineImposed, 0),
        // Disposed challans are the paid set — sum their fines for the paid total.
        paidAmount: disposedRows.reduce((sum: number, c:ChallanListItem) => sum + c.fineImposed, 0),
      });
    } catch { /* handle silently — FlatList shows empty state */ }
    finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [tab, customerId, canScopeByCustomerId, needsCustomerScope, route.params?.initialVehicleNo, route.params?.initialChallanNo]);

  const {
    loadingPayButton,
    checkout,
    startPayment,
    handlePaymentEvent,
    handleClosePayment,
  } = useChallanPaymentFlow({ onRefresh: () => fetchData(true) });

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const handlePay = (challan: ChallanListItem) => {
    if (!canPayChallan(challan.detail)) return;
    startPayment(challan.challanNo, challan.vehicleNo);
  };

  const handleCheckStatus = async (challan: ChallanListItem) => {
    setCheckingStatusNo(challan.challanNo);
    const shouldRefresh = await checkChallanStatus(challan.vehicleNo, challan.challanNo);
    setCheckingStatusNo(null);
    if (shouldRefresh) fetchData(true);
  };

  const handleReceipt = async (challan: ChallanListItem) => {
    const requestId = challan.detail.paymentRequestId;
    if (!requestId) return;
    await openChallanReceipt(requestId, challan.challanNo);
  };

  const renderItem = ({ item }: { item: ChallanListItem }) => {
    const display = challanDisplay(item);
    const showPay = canPayChallan(item.detail);
    const showReceipt = hasChallanReceipt(item.detail.paymentStatus);
    const isPayLoading = loadingPayButton === item.challanNo;
    const isStatusLoading = checkingStatusNo === item.challanNo;

    return (
      <GlassCard variant={display.card} style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => nav.navigate('ChallanDetail', { challan: item.detail })}
        >
          <View style={styles.cardTop}>
            <View style={styles.left}>
              <Text style={styles.vehicleNo}>{item.vehicleNo}</Text>
              <Text style={styles.state}>{item.state} · {item.department}</Text>
              <Text style={styles.challanNo} selectable numberOfLines={1}>{item.challanNo}</Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.amount, item.isPending && { color: Colors.dangerLight }]}>
                {formatINR(item.fineImposed)}
              </Text>
              <StatusPill label={display.label} variant={display.pill} small />
            </View>
          </View>
        </TouchableOpacity>
        <View style={styles.cardBottom}>
          <Text style={styles.date}>{fmtDate(item.challanDateTime)}</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => handleCheckStatus(item)}
              disabled={isStatusLoading}
            >
              {isStatusLoading
                ? <ActivityIndicator size="small" color={Colors.blue} />
                : <Text style={styles.secondaryBtnText}>Status</Text>}
            </TouchableOpacity>

            {showReceipt ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleReceipt(item)}>
                <Text style={styles.secondaryBtnText}>Receipt</Text>
              </TouchableOpacity>
            ) : null}

            {showPay ? (
              <TouchableOpacity
                style={styles.payBtn}
                onPress={() => handlePay(item)}
                disabled={isPayLoading}
              >
                {isPayLoading
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.payBtnText}>Pay</Text>}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </GlassCard>
    );
  };

  return (
    <LiquidBackground>
      <ScreenHeader title="e-Challan" showBack />
      {summary ? (
        <GlassCard variant={summary.pendingCount > 0 ? 'danger' : 'strong'} style={styles.alertBanner}>
          {/* Two lines so narrow phones never clip to "Total Pen…" */}
          <Text style={[styles.alertText, summary.pendingCount === 0 && styles.alertTextClear]}>
            {`Total Pending Challan : ${summary.pendingCount}`}
          </Text>
          <Text style={[styles.alertText, summary.pendingCount === 0 && styles.alertTextClear, styles.alertAmount]}>
            {`Total Pending Amount : ${formatINR(summary.pendingAmount)}`}
          </Text>
          <Text style={[styles.alertPaid, styles.alertAmount]}>
            {`Total Challan Payment Paid : ${formatINR(summary.paidAmount)}`}
          </Text>
        </GlassCard>
      ) : null}
      <View style={styles.tabBar}>
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.tab,
                tab === t.key && (
                  t.key === 'disposed' ? styles.tabActiveDisposed :
                  t.key === 'pending' ? styles.tabActivePending :
                  styles.tabActiveAll
                ),
              ]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[
                styles.tabText,
                tab === t.key && (
                  t.key === 'disposed' ? styles.tabTextActiveDisposed :
                  t.key === 'pending' ? styles.tabTextActivePending :
                  styles.tabTextActiveAll
                ),
              ]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.listWrap}>
        {loading && challans.length === 0 ? (
          <View style={styles.skeletonWrap}>
            {[1,2,3].map((i) => <SkeletonCard key={i} />)}
          </View>
        ) : (
          <FlatList
            style={styles.flex}
            data={challans}
            keyExtractor={(c) => String(c.id ?? c.challanNo)}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, challans.length === 0 && styles.listEmpty]}
            removeClippedSubviews={false}
            initialNumToRender={Platform.OS === 'ios' ? 12 : 10}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor={Colors.blue} />}
            ListEmptyComponent={<EmptyState title="No challans found" icon="📜" />}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <ChallanPaymentCheckoutModal
        checkout={checkout}
        onEvent={handlePaymentEvent}
        onClose={handleClosePayment}
      />
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listWrap: { flex: 1, minHeight: 0 },
  skeletonWrap: { flex: 1, padding: Spacing[4], gap: 8 },
  listEmpty: { flexGrow: 1 },
  alertBanner: { marginHorizontal: Spacing[4], marginBottom: 8, padding: 12, gap: 4 },
  alertText:   { fontSize: FontSize.sm, color: Colors.dangerLight, fontWeight: '700', flexShrink: 1 },
  alertAmount: { marginTop: 2 },
  alertTextClear: { color: Colors.successLight },
  // Paid total stays green even when pending alerts are red — it's settled money.
  alertPaid:   { fontSize: FontSize.sm, color: Colors.successLight, fontWeight: '700', flexShrink: 1 },
  // Same bordered chrome as Profile / Toll / Claims header tabs.
  tabBar: {
    marginHorizontal: Spacing[4],
    marginBottom: 8,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.glass.borderStrong,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.bg,
  },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.glass.bgMedium,
    borderWidth: 1,
    borderColor: Colors.glass.borderStrong,
    borderRadius: Radius.full,
  },
  tabActivePending: { backgroundColor: Colors.dangerBg, borderColor: Colors.dangerBorder },
  tabActiveDisposed: { backgroundColor: Colors.successBg, borderColor: Colors.successBorder },
  tabActiveAll: { backgroundColor: Colors.infoBg, borderColor: Colors.infoBorder },
  tabText:     { fontSize: FontSize.sm, color: Colors.text.subtle, fontWeight: '500' },
  tabTextActivePending: { color: Colors.dangerLight, fontWeight: '700' },
  tabTextActiveDisposed: { color: Colors.successLight, fontWeight: '700' },
  tabTextActiveAll: { color: Colors.infoLight, fontWeight: '700' },
  list:        { paddingHorizontal: Spacing[4], gap: 8, paddingBottom: 32 },
  card:        { padding: 13 },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  left:        { flex: 1, gap: 2 },
  right:       { alignItems: 'flex-end', gap: 4 },
  vehicleNo:   { fontSize: FontSize.base, fontWeight: '700', color: Colors.white, fontFamily: 'monospace' },
  state:       { fontSize: FontSize.sm, color: Colors.text.secondary },
  challanNo:   { fontSize: FontSize.xs, color: Colors.text.subtle, fontFamily: 'monospace' },
  amount:      { fontSize: FontSize.xl, fontWeight: '700', color: Colors.white },
  cardBottom:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  date:        { fontSize: FontSize.xs, color: Colors.text.subtle, flexShrink: 1 },
  actionRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 58,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.blue },
  payBtn:      { backgroundColor: '#3eb901', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, minWidth: 52, alignItems: 'center' },
  payBtnText:  { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white },
});
