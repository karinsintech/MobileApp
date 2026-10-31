import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { claimsApi } from '../../../services/api/claimsApi';
import { dashboardApi } from '../../../services/api/dashboardApi';
import { vehicleApi } from '../../../services/api/vehicleApi';
import { useAppSelector } from '../../../store';
import {
  LiquidBackground, GlassCard, StatusPill, SkeletonCard, EmptyState, ScreenHeader, ScrollableChipBar,
} from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { formatINR, fmtDate } from '../../../utils/format';
import type { ClaimsStackParamList } from '../../../navigation/types';
import { requiresAdminContextPicker } from '../../../types/auth';
import {
  CLAIM_FILTER_OPTS,
  computeClaimFilterCounts,
  claimsSummaryToFilterCounts,
  matchesClaimFilter,
  type ClaimFilter,
} from '../claimStatus';
import { mapClaimListRow } from '../mapClaimRow';
import type { ClaimRecord } from '../../../types/dashboard';
import ClaimFilterPanel from '../components/ClaimFilterPanel';
import {
  getDefaultClaimFilters,
  isClaimFiltersActive,
  type ClaimCustomerOption,
  type ClaimFilters,
} from '../constants/claimFilters';
import { buildClaimQueryParams } from '../utils/buildClaimQueryParams';

type Filter = ClaimFilter;
type ClaimListItem = ClaimRecord;

const PAGE_SIZE = 25;

function buildInitialFilters(routeParams: ClaimsStackParamList['ClaimsList']): ClaimFilters {
  const base = getDefaultClaimFilters();
  if (!routeParams) return base;
  return {
    ...base,
    ...(routeParams.initialVehicleNo ? { vehicleNo: routeParams.initialVehicleNo.trim() } : {}),
    ...(routeParams.initialTollName ? { tollName: routeParams.initialTollName.trim() } : {}),
  };
}

const statusVariant = (g: string) =>
  g === 'APPROVED' ? 'success' :
  g === 'PENDING'  ? 'warning' :
  g === 'WAITING_FOR_DOC' ? 'info' :
  g === 'REJECTED' || g === 'EXPIRED' ? 'danger' : 'neutral';

export default function ClaimsScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<RouteProp<ClaimsStackParamList, 'ClaimsList'>>();
  const { user, dashboardContext } = useAppSelector((s) => s.auth);
  const customerId = dashboardContext?.customerId ?? user?.defaultCustomerId;
  const canScopeByCustomerId = requiresAdminContextPicker(user?.roleKey);

  const [filter, setFilter] = useState<Filter>(() => route.params?.initialFilter ?? 'ALL');
  const [draftFilters, setDraftFilters] = useState<ClaimFilters>(() => buildInitialFilters(route.params));
  const [appliedFilters, setAppliedFilters] = useState<ClaimFilters>(() => buildInitialFilters(route.params));
  const [showFilters, setShowFilters] = useState(() => isClaimFiltersActive(buildInitialFilters(route.params)));
  const [customers, setCustomers] = useState<ClaimCustomerOption[]>([]);
  const [claims, setClaims] = useState<ClaimListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summaryCounts, setSummaryCounts] = useState<Record<ClaimFilter, number>>(
    () => claimsSummaryToFilterCounts(null),
  );
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefresh] = useState(false);

  const fetchingRef = useRef(0);
  const claimsCountRef = useRef(0);
  // Avoid re-creating fetchData (and refetching ALL) when only the pending badge updates.
  const pendingSummaryRef = useRef(summaryCounts.PENDING);
  pendingSummaryRef.current = summaryCounts.PENDING;
  const filtersActive = isClaimFiltersActive(appliedFilters);

  useEffect(() => {
    claimsCountRef.current = claims.length;
  }, [claims.length]);

  const fetchData = useCallback(async (pg = 1, isRefresh = false) => {
    // Sequence requests so a filter/chip change is never dropped while an older
    // fetch is still in flight (that was under-showing after dashboard deep-links).
    const reqId = ++fetchingRef.current;
    if (pg === 1) { isRefresh ? setRefresh(true) : setLoading(true); }
    else setLoadingMore(true);
    try {
      // PENDING is not a /debit/getList claimStatus — scan unfiltered pages and
      // keep rows this app already classifies as statusGroup === 'PENDING'.
      if (filter === 'PENDING') {
        let sourcePage = pg;
        let accumulated: ClaimListItem[] = [];
        let apiTotal = 0;
        let exhausted = false;
        // First open: fill a screen of pending rows. Load-more: find at least one more.
        const targetCount = pg === 1 ? PAGE_SIZE : 1;
        const pendingSummary = pendingSummaryRef.current;

        while (reqId === fetchingRef.current) {
          const query = buildClaimQueryParams(
            appliedFilters,
            sourcePage,
            PAGE_SIZE,
            customerId,
            'ALL',
          );
          const { data } = await claimsApi.getList(query);
          if (reqId !== fetchingRef.current) return;

          const rows = data.rows ?? [];
          apiTotal = data.count ?? 0;
          const pendingPage = rows
            .map(mapClaimListRow)
            .filter((claim) =>
              matchesClaimFilter(claim.rawClaimStatus ?? '', claim.statusGroup, 'PENDING'),
            );
          accumulated = [...accumulated, ...pendingPage];

          exhausted =
            rows.length === 0
            || rows.length < PAGE_SIZE
            || sourcePage * PAGE_SIZE >= apiTotal;
          if (exhausted) break;
          if (accumulated.length >= targetCount) break;
          if (pendingSummary > 0 && accumulated.length >= pendingSummary) break;
          sourcePage += 1;
        }

        if (reqId !== fetchingRef.current) return;

        const nextLength = pg === 1
          ? accumulated.length
          : claimsCountRef.current + accumulated.length;
        if (pg === 1) setClaims(accumulated);
        else setClaims((prev) => [...prev, ...accumulated]);

        if (pendingSummary > 0) setTotal(pendingSummary);
        else if (exhausted) setTotal(nextLength);
        else setTotal(Math.max(apiTotal, nextLength + 1));

        setPage(sourcePage);
        return;
      }

      const query = buildClaimQueryParams(
        appliedFilters,
        pg,
        PAGE_SIZE,
        customerId,
        filter,
      );
      const { data } = await claimsApi.getList(query);
      if (reqId !== fetchingRef.current) return;

      const mapped: ClaimListItem[] = (data.rows ?? []).map((row) => mapClaimListRow(row));
      if (pg === 1) setClaims(mapped);
      else setClaims((prev) => [...prev, ...mapped]);
      setTotal(data.count ?? mapped.length);
      setPage(pg);
    } catch { /* handle silently — FlatList shows empty state */ }
    finally {
      if (reqId === fetchingRef.current) {
        setLoading(false);
        setRefresh(false);
        setLoadingMore(false);
      }
    }
  }, [appliedFilters, customerId, filter]);

  const fetchSummaryCounts = useCallback(async () => {
    try {
      const { data } = await dashboardApi.getSummary({
        ...(canScopeByCustomerId && customerId ? { customerId } : {}),
      });
      setSummaryCounts(claimsSummaryToFilterCounts(data?.claims));
    } catch {
      /* Chip counts fall back to loaded rows once pages arrive */
    }
  }, [canScopeByCustomerId, customerId]);

  useEffect(() => {
    if (!requiresAdminContextPicker(user?.roleKey)) return;
    (async () => {
      try {
        const { data } = await vehicleApi.getCustomerVehicleGroups();
        setCustomers((data ?? []).map((row: any) => ({
          yapEntityId: String(row.yapEntityId ?? ''),
          firstName: row.firstName ?? '',
        })));
      } catch { /* optional filter source */ }
    })();
  }, [user?.roleKey]);

  useEffect(() => {
    const initial = buildInitialFilters(route.params);
    if (isClaimFiltersActive(initial)) {
      setDraftFilters(initial);
      setAppliedFilters(initial);
      setShowFilters(true);
      nav.setParams({ initialVehicleNo: undefined, initialTollName: undefined });
    }
  }, [route.params, nav]);

  // Dashboard Claims card deep-links land here with a status chip selection.
  useEffect(() => {
    const next = route.params?.initialFilter;
    if (!next) return;
    setFilter(next);
    setAppliedFilters((prev) => ({ ...prev, claimStatus: '' }));
    setDraftFilters((prev) => ({ ...prev, claimStatus: '' }));
    // Clear so revisiting the same chip from the dashboard still re-applies.
    nav.setParams({ initialFilter: undefined });
  }, [route.params?.initialFilter, nav]);

  useEffect(() => {
    fetchData(1);
    fetchSummaryCounts();
  }, [fetchData, fetchSummaryCounts]);

  // When dashboard pending arrives after the first PENDING scan, align list total.
  useEffect(() => {
    if (filter === 'PENDING' && summaryCounts.PENDING > 0) {
      setTotal(summaryCounts.PENDING);
    }
  }, [filter, summaryCounts.PENDING]);

  const filterCounts = useMemo(() => {
    // Prefer list totals for ALL so badges match the date/customer-scoped ledger.
    // Other chips still use dashboard summary until the full list is loaded.
    const hasFullList = total > 0 && claims.length >= total;
    if (hasFullList) return computeClaimFilterCounts(claims, total);
    return {
      ...summaryCounts,
      ALL: total > 0 ? total : summaryCounts.ALL,
    };
  }, [claims, total, summaryCounts]);

  const handleLoadMore = () => {
    if (!loadingMore && !loading && claims.length < total) {
      fetchData(page + 1);
    }
  };

  const handleChipPress = (chip: Filter) => {
    setFilter(chip);
    setAppliedFilters((prev) => ({ ...prev, claimStatus: '' }));
    setDraftFilters((prev) => ({ ...prev, claimStatus: '' }));
  };

  const handleSearch = (next?: ClaimFilters) => {
    const filters = next ?? draftFilters;
    setDraftFilters(filters);
    setFilter('ALL');
    setAppliedFilters(filters);
    setShowFilters(false);
  };

  const handleReset = () => {
    const defaults = getDefaultClaimFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setFilter('ALL');
  };

  const renderItem = ({ item }: { item: ClaimListItem }) => (
    <TouchableOpacity activeOpacity={0.8} onPress={() => nav.navigate('ClaimDetail', { claimId: item.claimId, claim: item })}>
      <GlassCard
        variant={item.statusGroup === 'PENDING' || item.statusGroup === 'WAITING_FOR_DOC' ? 'warning' :
                 item.statusGroup === 'APPROVED' ? 'success' :
                 item.statusGroup === 'REJECTED' || item.statusGroup === 'EXPIRED' ? 'danger' : 'default'}
        style={styles.card}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <Text style={styles.vehicleNo}>{item.vehicleNo}</Text>
            <Text style={styles.plaza} numberOfLines={1}>{item.tollPlaza}</Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.amount}>{formatINR(item.amount)}</Text>
            <StatusPill label={item.claimStatus} variant={statusVariant(item.statusGroup)} small />
          </View>
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.meta}>{item.claimTypeName} · {fmtDate(item.requestedDate)}</Text>
          <Text style={styles.updated}>Updated {fmtDate(item.lastUpdated)}</Text>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );

  return (
    <LiquidBackground>
      <ScreenHeader
        title="Claims"
        subtitle={`${total} claims`}
        rightElement={(
          <TouchableOpacity
            style={[styles.filterBtn, (showFilters || filtersActive || filter !== 'ALL') && styles.filterBtnActive]}
            onPress={() => setShowFilters((open) => !open)}
            activeOpacity={0.85}
          >
            <Text style={[styles.filterBtnText, (showFilters || filtersActive || filter !== 'ALL') && styles.filterBtnTextActive]}>
              Filters
            </Text>
          </TouchableOpacity>
        )}
      />

      {showFilters ? (
        <ClaimFilterPanel
          roleKey={user?.roleKey}
          draft={draftFilters}
          customers={customers}
          onChange={setDraftFilters}
          onSearch={handleSearch}
          onReset={handleReset}
        />
      ) : null}

      <View style={styles.filterRow}>
        <ScrollableChipBar
          data={[...CLAIM_FILTER_OPTS]}
          keyExtractor={(f) => f}
          contentContainerStyle={styles.filterListContent}
          renderItem={({ item }) => {
            const count = filterCounts[item];
            const showBadge = count > 0;

            return (
              <TouchableOpacity
                style={[styles.chip, filter === item && styles.chipActive]}
                onPress={() => handleChipPress(item)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, filter === item && styles.chipTextActive]}>
                  {item.replace(/_/g, ' ')}
                </Text>
                {showBadge ? (
                  <View style={styles.chipBadge}>
                    <Text style={styles.chipBadgeText}>{count}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={{ padding: Spacing[4], gap: 8 }}>
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={claims}
          keyExtractor={(c) => String(c.claimId)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                fetchData(1, true);
                fetchSummaryCounts();
              }}
              tintColor={Colors.blue}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState title="No claims found" icon="📋" subtitle="Adjust filters or raise a claim from a suspicious toll transaction." />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.blue} style={{ marginVertical: 16 }} /> : null}
          showsVerticalScrollIndicator={false}
        />
      )}
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.bg,
  },
  filterBtnActive: { backgroundColor: Colors.infoBg, borderColor: Colors.infoBorder },
  filterBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text.secondary },
  filterBtnTextActive: { color: Colors.infoLight },
  filterRow: {
    marginBottom: 4,
    marginHorizontal: Spacing[4],
    overflow: 'visible',
  },
  filterListContent: {
    gap: 10,
    paddingTop: 6,
    paddingBottom: 6,
  },
  chip:       {
    position: 'relative',
    paddingHorizontal: 14,
    paddingVertical: 8,
    paddingRight: 16,
    backgroundColor: Colors.glass.bgMedium,
    borderWidth: 1,
    borderColor: Colors.glass.borderStrong,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    overflow: 'visible',
  },
  chipActive: { backgroundColor: Colors.infoBg, borderColor: Colors.infoBorder },
  chipText:   { fontSize: FontSize.xs, color: Colors.text.subtle, fontWeight: '500' },
  chipTextActive:{ color: Colors.infoLight, fontWeight: '700' },
  chipBadge: {
    position: 'absolute',
    top: -7,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.bg.d0,
  },
  chipBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.white,
    includeFontPadding: false,
    textAlign: 'center',
    lineHeight: 12,
  },
  list:       { paddingHorizontal: Spacing[4], paddingTop: Spacing[2], gap: 8, paddingBottom: 32 },
  card:       { padding: 13 },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardLeft:   { flex: 1, gap: 2 },
  cardRight:  { alignItems: 'flex-end', gap: 4 },
  vehicleNo:  { fontSize: FontSize.base, fontWeight: '700', color: Colors.white, fontFamily: 'monospace' },
  plaza:      { fontSize: FontSize.sm, color: Colors.text.secondary },
  amount:     { fontSize: FontSize.xl, fontWeight: '700', color: Colors.white },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  meta:       { fontSize: FontSize.xs, color: Colors.text.subtle },
  updated:    { fontSize: FontSize.xs, color: Colors.text.subtle },
});
