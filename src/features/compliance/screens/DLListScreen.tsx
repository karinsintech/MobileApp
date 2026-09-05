/**
 * SARATHI DL List — summary cards filter the ledger (web parity); tapping a row
 * opens the full licence detail view (web eye-icon modal). Check Status / Add
 * mirrors web privilege 213.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, ScrollView,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { complianceApi } from '../../../services/api/complianceApi';
import { vehicleApi } from '../../../services/api/vehicleApi';
import { useAppSelector } from '../../../store';
import { useHasAccess } from '../../../hooks/useHasAccess';
import {
  LiquidBackground, GlassCard, StatusPill,
  SkeletonCard, EmptyState, ScreenHeader,
} from '../../../components';
import { Colors, FontSize, Spacing } from '../../../theme';
import { fmtDate } from '../../../utils/format';
import { requiresAdminContextPicker } from '../../../types/auth';
import { PrivilegeIds } from '../../../types/accessMenus';
import { maskDlNumber, redactRedPii } from '../../../utils/piiProtection';
import type { MoreStackParamList } from '../../../navigation/types';
import DLFilterPanel from '../components/DLFilterPanel';
import DLCheckStatusModal from '../components/DLCheckStatusModal';
import { sanitizeDlPayload } from '../utils/sanitizeDlPayload';
import {
  EMPTY_DL_FILTERS,
  type DLFilters,
  type DlCustomerOption,
} from '../constants/dlFilters';
import {
  DL_CARD_ACCENT,
  DL_SUMMARY_CARDS,
  type DLSummaryCard,
  type DLExpiryCounts,
  type DLExpiryFilter,
  type DLStatusCounts,
} from '../constants/dlStatusCards';
import type { DLDetailPayload } from '../types/dlDetail';
import { resolveDriverFullName } from '../utils/driverNameUtils';

const PAGE_SIZE = 25;

interface DLItem {
  id: string;
  recordId: number;
  dlNo: string;
  driverName: string;
  transportUpto: string | null;
  nonTransportUpto: string | null;
  hazardousUpto: string | null;
  hillsUpto: string | null;
  status: string;
  detail: DLDetailPayload | null;
}

const DL_LIST_EXPIRY_FIELDS: {
  label: string;
  getValue: (item: DLItem) => string | null;
}[] = [
  { label: 'Transport', getValue: (item) => item.transportUpto },
  { label: 'Non-Transport', getValue: (item) => item.nonTransportUpto },
  { label: 'Hazardous', getValue: (item) => item.hazardousUpto },
  { label: 'Hills', getValue: (item) => item.hillsUpto },
];

const expiryVariant = (dateStr: string | null) => {
  if (!dateStr) return 'neutral';
  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return 'neutral';
  const days = (d - Date.now()) / 86_400_000;
  if (days < 0) return 'danger';
  if (days <= 30) return 'warning';
  return 'success';
};

function matchesExpiryFilter(
  current: DLExpiryFilter | null,
  next: DLExpiryFilter,
): boolean {
  return current?.expiryStatus === next.expiryStatus
    && current?.expiryType === next.expiryType;
}

function isCardFilterActive(
  expiryFilter: DLExpiryFilter | null,
  card: DLSummaryCard,
): boolean {
  if (!expiryFilter) return false;
  return expiryFilter.expiryType === card.expiryType;
}

function buildInitialFilters(routeParams: MoreStackParamList['DLList']): DLFilters {
  if (!routeParams) return EMPTY_DL_FILTERS;
  return {
    ...EMPTY_DL_FILTERS,
    ...(routeParams.licenseNo ? { licenseNo: routeParams.licenseNo.trim() } : {}),
    ...(routeParams.driverName ? { driverName: routeParams.driverName.trim() } : {}),
  };
}

function buildInitialExpiryFilter(routeParams: MoreStackParamList['DLList']): DLExpiryFilter | null {
  if (!routeParams?.expiryStatus || !routeParams?.expiryType) return null;
  return {
    expiryStatus: routeParams.expiryStatus,
    expiryType: routeParams.expiryType,
  };
}

function buildDlQueryParams(
  filters: DLFilters,
  expiryFilter: DLExpiryFilter | null,
  dashboardCustomerId: number | null | undefined,
  canScopeByCustomerId: boolean,
  pageNo: number,
) {
  const params: Record<string, string | number> = { pageNo, pageSize: PAGE_SIZE };

  if (filters.licenseNo.trim()) params.licenseNo = filters.licenseNo.trim();
  if (filters.driverName.trim()) params.driverName = filters.driverName.trim();
  if (filters.mobileNo.trim()) params.mobileNo = filters.mobileNo.trim();
  if (filters.fromDate) params.fromDate = filters.fromDate;
  if (filters.toDate) params.toDate = filters.toDate;
  if (filters.status) params.status = filters.status;

  // Summary-card drill-down takes precedence over header expiry type (web expiryState parity).
  if (expiryFilter?.expiryStatus) params.expiryStatus = expiryFilter.expiryStatus;
  if (expiryFilter?.expiryType) {
    params.expiryType = expiryFilter.expiryType;
  } else if (filters.expiryType) {
    params.expiryType = filters.expiryType;
  }

  // Web admin picker sends yapEntityId as customerId; otherwise scope by dashboard context.
  if (filters.customerId.trim()) {
    params.customerId = filters.customerId.trim();
  } else if (canScopeByCustomerId && dashboardCustomerId) {
    params.customerId = dashboardCustomerId;
  }

  return params;
}

function hasActiveDlFilters(filters: DLFilters, expiryFilter: DLExpiryFilter | null): boolean {
  return Boolean(
    filters.customerId.trim()
    || filters.licenseNo.trim()
    || filters.driverName.trim()
    || filters.mobileNo.trim()
    || filters.expiryType
    || filters.fromDate
    || filters.toDate
    || filters.status
    || expiryFilter?.expiryStatus
    || expiryFilter?.expiryType,
  );
}

function uniqueCustomers(rows: DlCustomerOption[]): DlCustomerOption[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.yapEntityId || seen.has(row.yapEntityId)) return false;
    seen.add(row.yapEntityId);
    return true;
  });
}

export default function DLListScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<RouteProp<MoreStackParamList, 'DLList'>>();
  const { user, dashboardContext } = useAppSelector((s) => s.auth);
  const customerId = dashboardContext?.customerId ?? user?.defaultCustomerId;
  const canScopeByCustomerId = requiresAdminContextPicker(user?.roleKey);
  // Same gate as web IdCard "Check DL Status" (DRIVER_LICENSE.CHECK_STATUS).
  const canCheckDlStatus = useHasAccess(PrivilegeIds.DRIVER_LICENSE_CHECK_STATUS);

  const [draftFilters, setDraftFilters] = useState<DLFilters>(() => buildInitialFilters(route.params));
  const [appliedFilters, setAppliedFilters] = useState<DLFilters>(() => buildInitialFilters(route.params));
  const [expiryFilter, setExpiryFilter] = useState<DLExpiryFilter | null>(
    () => buildInitialExpiryFilter(route.params),
  );
  const [customers, setCustomers] = useState<DlCustomerOption[]>([]);
  const [showFilters, setShowFilters] = useState(() => Boolean(
    buildInitialExpiryFilter(route.params)
    || route.params?.licenseNo
    || route.params?.driverName,
  ));
  const [showCheckStatus, setShowCheckStatus] = useState(false);
  const [items, setItems] = useState<DLItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<DLStatusCounts | null>(null);
  const [expiryCounts, setExpiryCounts] = useState<DLExpiryCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const filtersActive = useMemo(
    () => hasActiveDlFilters(appliedFilters, expiryFilter),
    [appliedFilters, expiryFilter],
  );

  useEffect(() => {
    const nextFilters = buildInitialFilters(route.params);
    const nextExpiry = buildInitialExpiryFilter(route.params);
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setExpiryFilter(nextExpiry);
    if (nextExpiry || route.params?.licenseNo || route.params?.driverName) {
      setShowFilters(true);
    }
  }, [route.params]);

  useEffect(() => {
    if (!requiresAdminContextPicker(user?.roleKey)) return;
    (async () => {
      try {
        const { data } = await vehicleApi.getCustomerVehicleGroups();
        const mapped: DlCustomerOption[] = (data ?? []).map((row: any) => ({
          yapEntityId: String(row.yapEntityId ?? ''),
          firstName: row.firstName ?? '',
        }));
        setCustomers(uniqueCustomers(mapped));
      } catch { /* optional filter source */ }
    })();
  }, [user?.roleKey]);

  const fetchData = useCallback(async (
    filters: DLFilters,
    activeExpiryFilter: DLExpiryFilter | null,
    isRefresh = false,
  ) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const { data } = await complianceApi.getDLList(
        buildDlQueryParams(filters, activeExpiryFilter, customerId, canScopeByCustomerId, 1),
      );

      const mapped: DLItem[] = (data.records ?? []).map((row: any, index: number) => {
        // Strip Aadhaar/biometrics before they enter list state or navigation params.
        const rawDetail: DLDetailPayload | null = row.fullResponse?.result ?? row.fullResponse ?? null;
        const detail = rawDetail ? sanitizeDlPayload(rawDetail) : null;
        const rawDlNo = (row.dlLicno ?? '—').trim();
        return {
          id: String(row.id ?? row.dlLicno ?? index),
          recordId: Number(row.id) || index,
          // RED-tier: only ADMIN keeps the full licence number on the list card.
          dlNo: rawDlNo === '—'
            ? rawDlNo
            : redactRedPii(rawDlNo, user?.roleKey, maskDlNumber),
          driverName: resolveDriverFullName(detail, row.driverName, row.bioFirstName),
          transportUpto: row.dlTrValdtoDt || null,
          nonTransportUpto: row.dlNtValdtoDt || null,
          hazardousUpto: row.dlHzValdtoDt || null,
          hillsUpto: row.dlHlValdtoDt || null,
          status: row.dlStatus ?? '',
          detail,
        };
      });
      setItems(mapped);
      setTotal(data.totalCount ?? mapped.length);
      setStatusCounts(data.statusCounts ?? null);
      setExpiryCounts(data.expiryCounts ?? null);
    } catch { /* empty state */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [canScopeByCustomerId, customerId, user?.roleKey]);

  useEffect(() => {
    fetchData(appliedFilters, expiryFilter);
  }, [fetchData, appliedFilters, expiryFilter]);

  const handleSearch = () => {
    setAppliedFilters({ ...draftFilters });
    setExpiryFilter(null);
    setShowFilters(false);
  };

  const handleReset = () => {
    setDraftFilters(EMPTY_DL_FILTERS);
    setAppliedFilters(EMPTY_DL_FILTERS);
    setExpiryFilter(null);
  };

  const handleCardCountPress = (filter: DLExpiryFilter) => {
    setExpiryFilter((prev) => (matchesExpiryFilter(prev, filter) ? null : filter));
  };

  const handleCardPress = (card: DLSummaryCard) => {
    const active = isCardFilterActive(expiryFilter, card);
    setExpiryFilter(active ? null : card.leftFilter);
  };

  const openDetail = (item: DLItem) => {
    nav.navigate('DLDetail', {
      dlId: item.recordId,
      detail: item.detail ?? undefined,
      driverName: item.driverName,
    });
  };

  const listHeader = (
    <View style={styles.header}>
      {/* Single horizontal line of summary cards (Fleet Vehicles parity); the row
          scrolls sideways so the licence list keeps the vertical space below. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsRow}
      >
        {DL_SUMMARY_CARDS.map((card) => {
          const counts = card.readCounts(statusCounts, expiryCounts);
          const isActive = isCardFilterActive(expiryFilter, card);

          return (
            <TouchableOpacity
              key={card.key}
              style={styles.statTile}
              activeOpacity={0.85}
              onPress={() => handleCardPress(card)}
            >
              <GlassCard style={[styles.statCard, isActive && styles.statCardActive]}>
                <View style={styles.statHead}>
                  <Text style={styles.statTitle} numberOfLines={2}>{card.title}</Text>
                  <Text style={styles.statIcon}>{card.icon}</Text>
                </View>
                <View style={styles.statCounts}>
                  <View style={styles.statCountCol}>
                    <Text style={styles.statCountLabel}>{card.leftLabel}</Text>
                    <TouchableOpacity
                      onPress={() => handleCardCountPress(card.leftFilter)}
                      disabled={counts.left <= 0}
                      activeOpacity={0.85}
                    >
                      <Text style={[
                        styles.statCountValue,
                        { color: DL_CARD_ACCENT },
                        matchesExpiryFilter(expiryFilter, card.leftFilter) && styles.statCountActive,
                      ]}>
                        {counts.left}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.statCountCol}>
                    <Text style={styles.statCountLabel}>{card.rightLabel}</Text>
                    <TouchableOpacity
                      onPress={() => handleCardCountPress(card.rightFilter)}
                      disabled={counts.right <= 0}
                      activeOpacity={0.85}
                    >
                      <Text style={[
                        styles.statCountValue,
                        { color: '#F5A623' },
                        matchesExpiryFilter(expiryFilter, card.rightFilter) && styles.statCountActive,
                      ]}>
                        {counts.right}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassCard>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderItem = ({ item }: { item: DLItem }) => (
    <TouchableOpacity activeOpacity={0.85} onPress={() => openDetail(item)}>
      <GlassCard style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.left}>
            <Text style={styles.driverName}>{item.driverName || 'Unknown driver'}</Text>
            <Text style={styles.dlNo} numberOfLines={1} selectable>DL: {item.dlNo}</Text>
          </View>
          <View style={styles.right}>
            {item.status ? (
              <StatusPill label={item.status} variant="neutral" small />
            ) : null}
            <Text style={styles.viewIcon}>👁</Text>
          </View>
        </View>
        <View style={styles.validityGrid}>
          {DL_LIST_EXPIRY_FIELDS.map((field) => {
            const dateValue = field.getValue(item);
            return (
              <View key={field.label} style={styles.validItem}>
                <Text style={styles.validLabel}>{field.label}</Text>
                <StatusPill
                  label={dateValue ? fmtDate(dateValue) : 'N/A'}
                  variant={expiryVariant(dateValue)}
                  small
                />
              </View>
            );
          })}
        </View>
      </GlassCard>
    </TouchableOpacity>
  );

  return (
    <LiquidBackground>
      <ScreenHeader
        title="SARATHI DL List"
        subtitle={total ? `${total} licences` : undefined}
        showBack
        rightElement={(
          <View style={styles.headerActions}>
            {canCheckDlStatus ? (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => setShowCheckStatus(true)}
                activeOpacity={0.85}
                accessibilityLabel="Check DL Status"
              >
                <Text style={styles.addBtnText}>Add DL</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.filterBtn, (showFilters || filtersActive) && styles.filterBtnActive]}
              onPress={() => setShowFilters((open) => !open)}
              activeOpacity={0.85}
              accessibilityLabel="Toggle filters"
            >
              <Text style={[styles.filterBtnText, (showFilters || filtersActive) && styles.filterBtnTextActive]}>
                Filters
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />
      {showFilters ? (
        <DLFilterPanel
          roleKey={user?.roleKey}
          draft={draftFilters}
          customers={customers}
          onChange={setDraftFilters}
          onSearch={handleSearch}
          onReset={handleReset}
        />
      ) : null}

      {loading && items.length === 0 ? (
        <View style={{ padding: Spacing[4], gap: 8 }}>
          {listHeader}
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(appliedFilters, expiryFilter, true)}
              tintColor={Colors.blue}
            />
          }
          ListEmptyComponent={
            <EmptyState title="No licences found" icon="🪪" subtitle="No driving licences match this filter." />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <DLCheckStatusModal
        visible={showCheckStatus}
        onClose={() => setShowCheckStatus(false)}
        onAdded={() => fetchData(appliedFilters, expiryFilter, true)}
      />
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtn: {
    backgroundColor: Colors.blue,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.white,
  },
  filterBtn: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterBtnActive: {
    backgroundColor: Colors.infoBg,
    borderColor: Colors.infoBorder,
  },
  filterBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  filterBtnTextActive: {
    color: Colors.infoLight,
  },
  header: { marginBottom: Spacing[2] },
  // Single horizontal line of summary cards; the row scrolls in x while the
  // licence FlatList below scrolls in y (matches Fleet Vehicles layout).
  statsRow: {
    gap: 8,
    paddingRight: Spacing[4],
    marginBottom: 10,
  },
  // Fixed width per card so they sit side-by-side instead of wrapping; sized to
  // fit the title plus the two count columns without clipping.
  statTile: { width: 168 },
  statCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    minHeight: 100,
  },
  statCardActive: {
    borderColor: Colors.infoBorder,
    backgroundColor: Colors.infoBg,
  },
  statHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 6,
  },
  statTitle: { flex: 1, fontSize: FontSize.xs, fontWeight: '700', color: Colors.white },
  statIcon: { fontSize: 16 },
  statCounts: { flexDirection: 'row', justifyContent: 'space-between' },
  statCountCol: { gap: 2 },
  statCountLabel: { fontSize: 10, color: Colors.text.subtle },
  statCountValue: { fontSize: FontSize.lg, fontWeight: '800' },
  statCountActive: { textDecorationLine: 'underline' },
  list: { paddingHorizontal: Spacing[4], gap: 8, paddingBottom: 32 },
  card: { padding: 13 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  left: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 6 },
  driverName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white },
  dlNo: { fontSize: FontSize.xs, color: Colors.text.subtle, fontFamily: 'monospace' },
  viewIcon: { fontSize: 16 },
  validityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  validItem: { width: '48%', gap: 4 },
  validLabel: { fontSize: FontSize.xs, color: Colors.text.label, fontWeight: '600' },
});
