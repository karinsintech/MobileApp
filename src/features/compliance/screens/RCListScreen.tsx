/**
 * VAHAN RC List — registration-certificate compliance from /vehicleRc/rcList.
 * Highlights expiry of fitness, insurance, PUCC, permit and tax so operators can
 * spot vehicles at risk of being non-compliant before they're flagged.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity, ScrollView,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { complianceApi } from '../../../services/api/complianceApi';
import { vehicleApi } from '../../../services/api/vehicleApi';
import { useAppSelector } from '../../../store';
import {
  LiquidBackground, GlassCard, StatusPill,
  SkeletonCard, EmptyState, ScreenHeader,
} from '../../../components';
import { Colors, FontSize, Spacing } from '../../../theme';
import { fmtDate } from '../../../utils/format';
import { requiresAdminContextPicker } from '../../../types/auth';
import type { MoreStackParamList } from '../../../navigation/types';
import RCFilterPanel from '../components/RCFilterPanel';
import {
  EMPTY_RC_FILTERS,
  type RCFilters,
  type RcCustomerOption,
  type RcGroupOption,
} from '../constants/rcFilters';
import {
  RC_BLACKLIST_CARD,
  RC_BLACKLIST_STATUS,
  RC_CARD_ACCENT,
  RC_CARD_DANGER,
  RC_CARD_WARNING,
  RC_SUMMARY_CARDS,
  type RCExpiryCounts,
  type RCExpiryFilter,
} from '../constants/rcStatusCards';

const PAGE_SIZE = 25;

interface RcExpiryFilter {
  expiryType?: string;
  expiryStatus?: string;
}

function matchesRcExpiryFilter(
  current: RcExpiryFilter | null,
  next: RCExpiryFilter,
): boolean {
  return current?.expiryStatus === next.expiryStatus
    && current?.expiryType === next.expiryType;
}

function isRcCardFilterActive(
  expiryFilter: RcExpiryFilter | null,
  cardKey: string,
): boolean {
  if (!expiryFilter) return false;
  const card = RC_SUMMARY_CARDS.find((row) => row.key === cardKey);
  if (!card) return false;
  return expiryFilter.expiryType === card.expiryType;
}

function buildInitialFilters(routeParams: MoreStackParamList['RCList']): RCFilters {
  if (!routeParams) return EMPTY_RC_FILTERS;
  return {
    ...EMPTY_RC_FILTERS,
    ...(routeParams.vehicleNo ? { vehicleNo: routeParams.vehicleNo.trim() } : {}),
    // Dashboard Black list deep-link sends status=BLACKLIST (web VehicleRcs parity).
    ...(routeParams.status ? { status: routeParams.status } : {}),
  };
}

function buildInitialExpiryFilter(routeParams: MoreStackParamList['RCList']): RcExpiryFilter | null {
  if (!routeParams?.expiryStatus) return null;
  return {
    expiryStatus: routeParams.expiryStatus,
    ...(routeParams.expiryType ? { expiryType: routeParams.expiryType } : {}),
  };
}

function buildRcQueryParams(
  filters: RCFilters,
  expiryFilter: RcExpiryFilter | null,
  customerId: number | null | undefined,
  pageNo: number,
) {
  const params: Record<string, string | number> = { pageNo, pageSize: PAGE_SIZE };

  if (filters.vehicleNo.trim()) params.vehicleNo = filters.vehicleNo.trim();
  if (filters.fromDate) params.fromDate = filters.fromDate;
  if (filters.toDate) params.toDate = filters.toDate;
  if (filters.status) params.status = filters.status;
  if (filters.groupName) params.groupName = filters.groupName;

  // Dashboard drill-down passes expiryType/expiryStatus separately (web expiryState parity).
  if (expiryFilter?.expiryStatus) params.expiryStatus = expiryFilter.expiryStatus;
  if (expiryFilter?.expiryType) {
    params.expiryType = expiryFilter.expiryType;
  } else if (filters.expiryType) {
    params.expiryType = filters.expiryType;
  }

  // Web admin customer picker sends firstName as customerName; otherwise scope by dashboard customer.
  if (filters.customerName.trim()) {
    params.customerName = filters.customerName.trim();
  } else if (customerId) {
    params.customerId = customerId;
  }

  return params;
}

function hasActiveRcFilters(filters: RCFilters, expiryFilter: RcExpiryFilter | null): boolean {
  return Boolean(
    filters.customerName.trim()
    || filters.vehicleNo.trim()
    || filters.expiryType
    || filters.fromDate
    || filters.toDate
    || filters.status
    || filters.groupName
    || expiryFilter?.expiryStatus
    || expiryFilter?.expiryType,
  );
}

function uniqueCustomers(rows: RcCustomerOption[]): RcCustomerOption[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.yapEntityId || seen.has(row.yapEntityId)) return false;
    seen.add(row.yapEntityId);
    return true;
  });
}

// A certificate within ~30 days of expiry is the operational risk window; past
// that date it is a hard compliance failure.
const expiryVariant = (dateStr: string | null) => {
  if (!dateStr) return 'neutral';
  const d = new Date(dateStr).getTime();
  if (Number.isNaN(d)) return 'neutral';
  const days = (d - Date.now()) / 86_400_000;
  if (days < 0) return 'danger';
  if (days <= 30) return 'warning';
  return 'success';
};

// VAHAN often returns NA / N/A placeholders when the RC is not blacklisted.
function hasRcBlacklistStatus(value?: string | null): boolean {
  const normalized = String(value ?? '').trim().toUpperCase();
  return Boolean(normalized) && !['NA', 'N/A', '-', 'NULL'].includes(normalized);
}

interface RCItem {
  id: string;
  vehicleNo: string;
  ownerName: string;
  fitnessUpto: string | null;
  taxUpto: string | null;
  insuranceUpto: string | null;
  puccUpto: string | null;
  permitUpto: string | null;
  npUpto: string | null;
  status: string;
  /** Raw rcBlacklistStatus — truthy only when VAHAN reports a real blacklist. */
  blacklistStatus: string;
  raw: Record<string, any>;
}

const RC_LIST_EXPIRY_FIELDS: { label: string; getValue: (item: RCItem) => string | null }[] = [
  { label: 'Fitness', getValue: (item) => item.fitnessUpto },
  { label: 'Tax', getValue: (item) => item.taxUpto },
  { label: 'Insurance', getValue: (item) => item.insuranceUpto },
  { label: 'PUCC', getValue: (item) => item.puccUpto },
  { label: 'Permit', getValue: (item) => item.permitUpto },
  { label: 'NP', getValue: (item) => item.npUpto },
];

export default function RCListScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<RouteProp<MoreStackParamList, 'RCList'>>();
  const { user, dashboardContext } = useAppSelector((s) => s.auth);
  const customerId = dashboardContext?.customerId ?? user?.defaultCustomerId;

  const [draftFilters, setDraftFilters] = useState<RCFilters>(() => buildInitialFilters(route.params));
  const [appliedFilters, setAppliedFilters] = useState<RCFilters>(() => buildInitialFilters(route.params));
  const [expiryFilter, setExpiryFilter] = useState<RcExpiryFilter | null>(
    () => buildInitialExpiryFilter(route.params),
  );
  const [customers, setCustomers] = useState<RcCustomerOption[]>([]);
  const [groups, setGroups] = useState<RcGroupOption[]>([]);
  const [showFilters, setShowFilters] = useState(() => Boolean(
    buildInitialExpiryFilter(route.params) || route.params?.vehicleNo || route.params?.status,
  ));
  const [items, setItems] = useState<RCItem[]>([]);
  const [total, setTotal] = useState(0);
  const [expiryCounts, setExpiryCounts] = useState<RCExpiryCounts | null>(null);
  // Same source as web VehicleRcsContainer — always from rcList, not page-local filter math.
  const [blacklistCount, setBlacklistCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);

  const filtersActive = useMemo(
    () => hasActiveRcFilters(appliedFilters, expiryFilter),
    [appliedFilters, expiryFilter],
  );

  useEffect(() => {
    const nextFilters = buildInitialFilters(route.params);
    const nextExpiry = buildInitialExpiryFilter(route.params);
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setExpiryFilter(nextExpiry);
    if (nextExpiry || route.params?.vehicleNo || route.params?.status) setShowFilters(true);
  }, [route.params]);

  useEffect(() => {
    if (!requiresAdminContextPicker(user?.roleKey)) return;
    (async () => {
      try {
        const { data } = await vehicleApi.getCustomerVehicleGroups();
        const mapped: RcCustomerOption[] = (data ?? []).map((row: any) => ({
          yapEntityId: String(row.yapEntityId ?? ''),
          firstName: row.firstName ?? '',
        }));
        setCustomers(uniqueCustomers(mapped));
      } catch { /* optional filter source */ }
    })();
  }, [user?.roleKey]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await vehicleApi.getGroupNames();
        const rows = data?.data ?? [];
        setGroups(rows.map((group) => ({
          id: String(group.id),
          title: group.title,
        })));
      } catch { /* optional filter source */ }
    })();
  }, []);

  const fetchData = useCallback(async (
    filters: RCFilters,
    activeExpiryFilter: RcExpiryFilter | null,
    isRefresh = false,
  ) => {
    isRefresh ? setRefresh(true) : setLoading(true);
    try {
      const { data } = await complianceApi.getRCList(
        buildRcQueryParams(filters, activeExpiryFilter, customerId, 1),
      );

      // VAHAN fields are prefixed rc*; surface all six expiry dates shown on web.
      const mapped: RCItem[] = (data.records ?? []).map((row: any) => ({
        id: String(row.id ?? row.rcRegnNo),
        vehicleNo: row.rcRegnNo ?? '—',
        ownerName: row.rcOwnerName ?? '',
        fitnessUpto: row.rcFitUpto || null,
        taxUpto: row.rcTaxUpto || null,
        insuranceUpto: row.rcInsuranceUpto || null,
        puccUpto: row.rcPuccUpto || null,
        permitUpto: row.rcPermitValidUpto || null,
        npUpto: row.rcNpUpto || null,
        status: row.rcStatus ?? '',
        blacklistStatus: row.rcBlacklistStatus ?? '',
        raw: row,
      }));
      setItems(mapped);
      setTotal(data.totalCount ?? mapped.length);
      setExpiryCounts(data.expiryCounts ?? null);
      setBlacklistCount(Number(data.blacklistCount ?? 0));
    } catch { /* handle silently — FlatList shows empty state */ }
    finally { setLoading(false); setRefresh(false); }
  }, [customerId]);

  useEffect(() => {
    fetchData(appliedFilters, expiryFilter);
  }, [fetchData, appliedFilters, expiryFilter]);

  const handleSearch = () => {
    setAppliedFilters({ ...draftFilters });
    setExpiryFilter(null);
    setShowFilters(false);
  };

  const handleReset = () => {
    setDraftFilters(EMPTY_RC_FILTERS);
    setAppliedFilters(EMPTY_RC_FILTERS);
    setExpiryFilter(null);
  };

  const isBlacklistFilterActive = appliedFilters.status === RC_BLACKLIST_STATUS;

  const clearBlacklistStatusFilter = () => {
    // Expiry cards and blacklist status must not stack — API scopes are exclusive on web.
    if (!isBlacklistFilterActive) return;
    setDraftFilters((prev) => ({ ...prev, status: '' }));
    setAppliedFilters((prev) => ({ ...prev, status: '' }));
  };

  const handleCardCountPress = (filter: RCExpiryFilter) => {
    clearBlacklistStatusFilter();
    setExpiryFilter((prev) => (
      matchesRcExpiryFilter(prev, filter) ? null : filter
    ));
  };

  const handleCardPress = (cardKey: string, leftFilter: RCExpiryFilter) => {
    clearBlacklistStatusFilter();
    setExpiryFilter((prev) => (
      isRcCardFilterActive(prev, cardKey) ? null : leftFilter
    ));
  };

  // Web Black List card: clear expiry scope and apply status=BLACKLIST (toggle off if already on).
  const handleBlacklistCardPress = () => {
    setExpiryFilter(null);
    const nextStatus = isBlacklistFilterActive ? '' : RC_BLACKLIST_STATUS;
    setDraftFilters((prev) => ({ ...prev, status: nextStatus }));
    setAppliedFilters((prev) => ({ ...prev, status: nextStatus }));
    if (nextStatus) setShowFilters(true);
  };

  const listHeader = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.statsRow}
    >
      {RC_SUMMARY_CARDS.map((card) => {
        const counts = card.readCounts(expiryCounts);
        const isActive = isRcCardFilterActive(expiryFilter, card.key);

        return (
          <TouchableOpacity
            key={card.key}
            style={styles.statTile}
            activeOpacity={0.85}
            onPress={() => handleCardPress(card.key, card.leftFilter)}
          >
            <GlassCard style={[styles.statCard, isActive && styles.statCardActive]}>
              <View style={styles.statHead}>
                <Text style={styles.statTitle} numberOfLines={2}>{card.title}</Text>
                <Text style={styles.statIcon}>{card.icon}</Text>
              </View>
              <View style={styles.statCounts}>
                <View style={styles.statCountCol}>
                  <Text style={styles.statCountLabel}>Expiring</Text>
                  <TouchableOpacity
                    onPress={() => handleCardCountPress(card.leftFilter)}
                    activeOpacity={0.85}
                  >
                    <Text style={[
                      styles.statCountValue,
                      { color: RC_CARD_ACCENT },
                      matchesRcExpiryFilter(expiryFilter, card.leftFilter) && styles.statCountActive,
                    ]}>
                      {counts.left}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.statCountCol}>
                  <Text style={styles.statCountLabel}>Expired</Text>
                  <TouchableOpacity
                    onPress={() => handleCardCountPress(card.rightFilter)}
                    activeOpacity={0.85}
                  >
                    <Text style={[
                      styles.statCountValue,
                      { color: RC_CARD_WARNING },
                      matchesRcExpiryFilter(expiryFilter, card.rightFilter) && styles.statCountActive,
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

      {/* Seventh tile — Total blacklisted RCs (web VehicleRcs cardData parity). */}
      <TouchableOpacity
        key={RC_BLACKLIST_CARD.key}
        style={styles.statTile}
        activeOpacity={0.85}
        onPress={handleBlacklistCardPress}
        accessibilityLabel={`Black List total ${blacklistCount}`}
      >
        <GlassCard style={[styles.statCard, isBlacklistFilterActive && styles.statCardActive]}>
          <View style={styles.statHead}>
            <Text style={styles.statTitle} numberOfLines={2}>{RC_BLACKLIST_CARD.title}</Text>
            <Text style={styles.statIcon}>{RC_BLACKLIST_CARD.icon}</Text>
          </View>
          <View style={styles.statCounts}>
            <View style={styles.statCountCol}>
              <Text style={styles.statCountLabel}>Total</Text>
              <Text style={[
                styles.statCountValue,
                { color: RC_CARD_DANGER },
                isBlacklistFilterActive && styles.statCountActive,
              ]}>
                {blacklistCount}
              </Text>
            </View>
            {/* Invisible spacer keeps height aligned with Expiring/Expired expiry cards. */}
            <View
              style={[styles.statCountCol, styles.statCountSpacer]}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <Text style={styles.statCountLabel}>Expired</Text>
              <Text style={styles.statCountValue}>0</Text>
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>
    </ScrollView>
  );

  // Tapping a row opens the full RC view (web parity); the row already holds the
  // complete record, so we hand it over to avoid a redundant /vehicleRc/:id call.
  const openDetail = useCallback((item: RCItem) => {
    nav.navigate('RCDetail', { rcId: Number(item.raw?.id) || 0, rc: item.raw });
  }, [nav]);

  const renderItem = ({ item }: { item: RCItem }) => {
    // Web VehicleRcs table shows "Yes" in Black list column when status is real.
    const isBlacklisted = hasRcBlacklistStatus(item.blacklistStatus);

    return (
      <TouchableOpacity activeOpacity={0.8} onPress={() => openDetail(item)}>
        <GlassCard style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.left}>
              <Text style={styles.vehicleNo}>{item.vehicleNo}</Text>
              {item.ownerName ? <Text style={styles.owner} numberOfLines={1}>{item.ownerName}</Text> : null}
            </View>
            {isBlacklisted ? (
              <View style={styles.right}>
                <StatusPill label="Black List" variant="danger" small />
              </View>
            ) : null}
          </View>
          <View style={styles.complianceGrid}>
            {RC_LIST_EXPIRY_FIELDS.map((field) => {
              const dateValue = field.getValue(item);
              return (
                <View key={field.label} style={styles.compItem}>
                  <Text style={styles.compLabel}>{field.label}</Text>
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
  };

  return (
    <LiquidBackground>
      <ScreenHeader
        title="VAHAN RC List"
        subtitle={total ? `${total} vehicles` : undefined}
        showBack
        rightElement={(
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
        )}
      />
      {showFilters ? (
        <RCFilterPanel
          roleKey={user?.roleKey}
          draft={draftFilters}
          customers={customers}
          groups={groups}
          onChange={setDraftFilters}
          onSearch={handleSearch}
          onReset={handleReset}
        />
      ) : null}
      {loading ? (
        <View style={{ padding: Spacing[4], gap: 8 }}>
          {listHeader}
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
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
            <EmptyState title="No RC records found" icon="🛡" subtitle="No registration certificates match your filters." />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
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
  statsRow: {
    gap: 8,
    paddingHorizontal: Spacing[4],
    paddingBottom: 10,
    paddingTop: 4,
  },
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
  statCountSpacer: { opacity: 0 },
  list:          { paddingHorizontal: Spacing[4], paddingTop: Spacing[2], gap: 8, paddingBottom: 32 },
  card:          { padding: 13 },
  cardTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  left:          { flex: 1, gap: 2, minWidth: 0 },
  right:         { alignItems: 'flex-end', gap: 4, maxWidth: '42%' },
  vehicleNo:     { fontSize: FontSize.base, fontWeight: '700', color: Colors.white, fontFamily: 'monospace' },
  owner:         { fontSize: FontSize.sm, color: Colors.text.secondary },
  complianceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compItem:      { width: '31%', gap: 4 },
  compLabel:     { fontSize: FontSize.xs, color: Colors.text.label, fontWeight: '600' },
});
