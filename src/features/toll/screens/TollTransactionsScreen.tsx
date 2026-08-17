import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import dayjs from 'dayjs';
import { tollApi, type TollExportParams } from '../../../services/api/tollApi';
import { getApiErrorMessage } from '../../../services/api/client';
import { useAppSelector } from '../../../store';
import {
  LiquidBackground, GlassCard, StatusPill,
  SkeletonCard, EmptyState, ScreenHeader,
} from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { formatINR, fmtDateTime } from '../../../utils/format';
import { downloadBinaryFile } from '../../../utils/fileExport';
import {
  ReportExportDropdown,
  WebDownloadIcon,
} from '../../reports/components/ReportExportMenu';
import { resolveTollTxnBadge } from '../utils/tollTxnBadgeUtils';
import TollDateRangeModal, { type TollCustomDateRange } from '../components/TollDateRangeModal';
import { DEFAULT_TOLL_LIST_RANGE } from '../../dashboard/constants/dashboardDefaults';
import type { TollTransactionDetail } from '../../../types/dashboard';
import { requiresAdminContextPicker } from '../../../types/auth';
import {
  TOLL_TXN_TYPE_OPTIONS,
  tollTxnTypeLabel,
  type TollTxnTypeValue,
} from '../constants/tollTxnTypeFilters';

import type { TollStackParamList } from '../../../navigation/types';

type PresetRange = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth';

type DateFilter =
  | { mode: 'preset'; dateRange: PresetRange }
  | { mode: 'custom'; fromDate: string; toDate: string };

const PRESET_PERIODS: { label: string; value: PresetRange }[] = [
  { label: 'Today',      value: 'today'     },
  { label: 'Yesterday',  value: 'yesterday' },
  { label: 'Last 7 Days',value: 'last7'     },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
];

type SearchType = 'vehicleNo' | 'locationName' | 'rrn';
const SEARCH_TYPES: { label: string; value: SearchType; placeholder: string }[] = [
  { label: 'Vehicle', value: 'vehicleNo',    placeholder: 'Vehicle no. e.g. DD03T9538' },
  { label: 'Plaza',   value: 'locationName', placeholder: 'Plaza name e.g. TALMOD TOLL PLAZA' },
  { label: 'RRN',     value: 'rrn',          placeholder: 'RRN e.g. 01000C29931869…' },
];

const PAGE_SIZE = 100;
/** Wait for typing to settle before applying Vehicle / Plaza / RRN filter. */
const SEARCH_DEBOUNCE_MS = 350;

/** Normalize the typed term for the active filter so matching stays consistent. */
function normalizeSearchTerm(raw: string, searchType: SearchType): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Vehicle + plaza ledgers are stored uppercased; RRN compared case-insensitively.
  if (searchType === 'rrn') return trimmed.toUpperCase();
  return trimmed.toUpperCase();
}

/**
 * Partial match for type-ahead (e.g. vehicle "TN", plaza "TAL", RRN prefix).
 * Runs on already-loaded ledger rows so short terms still filter when the API
 * only supports exact vehicle/plaza/RRN equality.
 */
function matchesSearchTerm(
  txn: TollTransactionDetail,
  searchType: SearchType,
  term: string,
): boolean {
  if (!term) return true;
  if (searchType === 'vehicleNo') {
    return (txn.vehicleNo ?? '').toUpperCase().includes(term);
  }
  if (searchType === 'locationName') {
    return (txn.tollPlaza ?? '').toUpperCase().includes(term);
  }
  return (txn.rrn ?? '').toUpperCase().includes(term);
}

function buildListParams(
  dateFilter: DateFilter,
  searchType: SearchType,
  search: string,
  pageNo: number,
  vehicleScoped = false,
  txnType: TollTxnTypeValue = '',
  customerId?: number,
): Record<string, string | number | boolean | undefined> {
  const term = normalizeSearchTerm(search, searchType);
  const typeParam = txnType ? { txnType } : {};
  const customerParam = customerId ? { customerId } : {};

  // Web drill-down from Vehicles: vehicleNo + showAllTxn (no dateRange cap).
  // Type-ahead Vehicle/Plaza/RRN filters are applied client-side on loaded rows.
  if (vehicleScoped && searchType === 'vehicleNo' && term) {
    return {
      showAllTxn: true,
      vehicleNo: term,
      ...typeParam,
      ...customerParam,
      pageNo,
      pageSize: PAGE_SIZE,
    };
  }

  if (dateFilter.mode === 'custom') {
    // Web TollTxnReportHeader: only fromDate+toDate (YYYY-MM-DD HH:mm).
    // Backend resolveTollHistorySources then reads live and/or archive tables.
    return {
      fromDate: dateFilter.fromDate,
      toDate: dateFilter.toDate,
      ...typeParam,
      ...customerParam,
      pageNo,
      pageSize: PAGE_SIZE,
    };
  }

  return {
    dateRange: dateFilter.dateRange,
    ...typeParam,
    ...customerParam,
    pageNo,
    pageSize: PAGE_SIZE,
  };
}

function buildExportParams(
  dateFilter: DateFilter,
  searchType: SearchType,
  search: string,
  vehicleScoped = false,
  txnType: TollTxnTypeValue = '',
  customerId?: number,
): TollExportParams {
  const base = buildListParams(dateFilter, searchType, search, 1, vehicleScoped, txnType, customerId);
  const exportParams = {...base};
  delete exportParams.pageNo;
  delete exportParams.pageSize;

  // Attach the active type-ahead term so Excel/PDF exports match the on-screen filter.
  const term = normalizeSearchTerm(search, searchType);
  if (term && !vehicleScoped) {
    exportParams[searchType] = term;
  }

  // Vehicle drill-down list omits dates (showAllTxn). Export endpoints still
  // accept the active UI range — attach it when missing so the file is scoped.
  if (!exportParams.dateRange && !(exportParams.fromDate && exportParams.toDate)) {
    if (dateFilter.mode === 'custom') {
      exportParams.fromDate = dateFilter.fromDate;
      exportParams.toDate = dateFilter.toDate;
    } else {
      exportParams.dateRange = dateFilter.dateRange;
    }
  }

  return exportParams as TollExportParams;
}

export default function TollTransactionsScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<RouteProp<TollStackParamList, 'TollList'>>();
  const { user, dashboardContext } = useAppSelector((s) => s.auth);
  const customerId = dashboardContext?.customerId ?? user?.defaultCustomerId ?? undefined;
  // Admin-style roles must pass customerId or the ledger returns a truncated portfolio slice.
  const scopedCustomerId = requiresAdminContextPicker(user?.roleKey) ? customerId : undefined;

  const initialRange = route.params?.initialDateRange;
  const initialVehicleNo = route.params?.initialVehicleNo?.trim().toUpperCase() ?? '';
  const initialRrn = route.params?.initialRrn?.trim() ?? '';

  const [dateFilter, setDateFilter] = useState<DateFilter>(() => (
    initialRange
      ? { mode: 'preset', dateRange: initialRange }
      : { mode: 'preset', dateRange: DEFAULT_TOLL_LIST_RANGE }
  ));
  const [customRange, setCustomRange] = useState<TollCustomDateRange | null>(null);
  const [showDateModal, setShowDateModal] = useState(false);
  const [searchInput, setSearchInput] = useState(initialRrn || initialVehicleNo);
  const [search, setSearch] = useState(initialRrn || initialVehicleNo);
  const [searchType, setSearchType] = useState<SearchType>(initialRrn ? 'rrn' : 'vehicleNo');
  const [txnType, setTxnType] = useState<TollTxnTypeValue>('');
  const [txnTypeOpen, setTxnTypeOpen] = useState(false);
  // When opened from Vehicle detail, fetch all txns for that vehicle (web parity).
  const [vehicleScoped, setVehicleScoped] = useState(Boolean(initialVehicleNo && !initialRrn));
  const [txns, setTxns] = useState<TollTransactionDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const reqIdRef = useRef(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const customRangeLabel = useMemo(() => {
    if (dateFilter.mode !== 'custom') return null;
    // Slice YYYY-MM-DD so the chip stays correct even if time suffix is present.
    const from = dayjs(dateFilter.fromDate.slice(0, 10)).format('DD MMM YYYY');
    const to = dayjs(dateFilter.toDate.slice(0, 10)).format('DD MMM YYYY');
    return `${from} – ${to}`;
  }, [dateFilter]);

  const fetchData = useCallback(async (pg = 1, isRefresh = false) => {
    if (pg === 1) { isRefresh ? setRefreshing(true) : setLoading(true); }
    else setLoadingMore(true);

    const reqId = ++reqIdRef.current;

    try {
      // searchType is irrelevant for the period ledger API — type-ahead filters client-side.
      // Vehicle drill-downs always query by vehicleNo (the only scoped search key).
      const listParams = buildListParams(
        dateFilter,
        'vehicleNo',
        search,
        pg,
        vehicleScoped,
        txnType,
        scopedCustomerId,
      );
      if (__DEV__) {
        // Confirm custom from/to reach the wire — archive history depends on both.
        console.log('[TollList] getTransactions', listParams);
      }
      const { data } = await tollApi.getTransactions(listParams as any);

      if (reqId !== reqIdRef.current) return;

      const mapped: TollTransactionDetail[] = (data.rows ?? []).map((row) => ({
        id: row.id,
        vehicleNo: row.vehicle?.vehicleNo ?? '',
        tollPlaza: row.locationName,
        direction: row.direction,
        txnDateTime: row.txnDateTime,
        txnAmount: Number(row.txnAmount) || 0,
        balance: Number(row.balance) || 0,
        rrn: row.rrn,
        txnType: row.txnType,
        kitNumber: row.kitNumber,
        txnReaderTime: row.txnReaderTime,
        txnRefNo: row.txnRefNo,
        tollId: row.tollId,
        lane: row.lan,
        locationLat: row.locationLat,
        locationLng: row.locationLang,
        externalTxnId: row.externalTxnId,
        barcode: row.barcode,
        customerName: row.customer?.firstName,
        yapEntityId: row.customer?.yapEntityId,
        vehicleProfileId: row.vehicle?.profileId,
      }));

      if (pg === 1) setTxns(mapped);
      else setTxns((prev) => [...prev, ...mapped]);
      setTotal(data.count ?? mapped.length);
      setPage(pg);
    } catch (err: unknown) {
      if (reqId !== reqIdRef.current) return;
      // Do not leave a previous period's rows under a new Custom chip.
      if (pg === 1) {
        setTxns([]);
        setTotal(0);
        Alert.alert(
          'Could not load transactions',
          getApiErrorMessage(err, 'Request failed. Try a shorter date range.'),
        );
      }
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  // Omit searchType: Vehicle/Plaza/RRN chips only change client-side filtering, not list API params.
  // Type-ahead search is filtered client-side — only vehicleScoped drill-downs re-fetch on `search`.
  }, [dateFilter, txnType, scopedCustomerId, vehicleScoped, vehicleScoped ? search : '']);

  // Debounced term applied to the loaded ledger (partial "TN" / plaza / RRN match).
  const visibleTxns = useMemo(() => {
    if (vehicleScoped) return txns;
    const term = normalizeSearchTerm(search, searchType);
    if (!term) return txns;
    return txns.filter((txn) => matchesSearchTerm(txn, searchType, term));
  }, [txns, search, searchType, vehicleScoped]);

  const visibleTotal = useMemo(() => {
    if (vehicleScoped) return total;
    const term = normalizeSearchTerm(search, searchType);
    if (!term) return total;
    // While filtering, show how many of the loaded rows match the typed term.
    return visibleTxns.length;
  }, [vehicleScoped, total, search, searchType, visibleTxns.length]);

  // Re-apply drill-down filters when navigating from Vehicle 360 / Vehicle detail.
  useFocusEffect(
    useCallback(() => {
      const rrn = route.params?.initialRrn?.trim();
      if (rrn) {
        setSearchInput(rrn);
        setSearch(normalizeSearchTerm(rrn, 'rrn'));
        setSearchType('rrn');
        setVehicleScoped(false);
        nav.setParams({ initialRrn: undefined, initialVehicleNo: undefined });
        return;
      }

      const vehicleNo = route.params?.initialVehicleNo?.trim().toUpperCase();
      if (!vehicleNo) return;
      setSearchInput(vehicleNo);
      setSearch(vehicleNo);
      setSearchType('vehicleNo');
      setVehicleScoped(true);
      nav.setParams({ initialVehicleNo: undefined });
    }, [route.params?.initialRrn, route.params?.initialVehicleNo, nav]),
  );

  useEffect(() => { fetchData(1); }, [fetchData]);

  // Empty filtered lists never fire onEndReached — page once when the active
  // type-ahead term has zero matches so later ledger pages can still surface hits.
  // Stop as soon as any match appears; further pages load via normal scroll.
  useEffect(() => {
    if (vehicleScoped) return;
    const term = normalizeSearchTerm(search, searchType);
    if (!term) return;
    if (loading || loadingMore || refreshing) return;
    if (txns.length >= total) return;
    // Avoid fetch storms while searching — only auto-page when nothing matches yet.
    if (visibleTxns.length > 0) return;
    fetchData(page + 1);
  }, [
    vehicleScoped,
    search,
    searchType,
    loading,
    loadingMore,
    refreshing,
    txns.length,
    total,
    visibleTxns.length,
    page,
    fetchData,
  ]);

  // Debounce Vehicle / Plaza / RRN typing — clear applies immediately, typed terms wait.
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    const next = normalizeSearchTerm(searchInput, searchType);
    if (!next) {
      setSearch((prev) => (prev === '' ? prev : ''));
      return;
    }

    // Vehicle drill-down keeps an exact server-scoped vehicleNo — apply immediately.
    if (vehicleScoped) {
      setSearch((prev) => (prev === next ? prev : next));
      return;
    }

    searchDebounceRef.current = setTimeout(() => {
      setSearch((prev) => (prev === next ? prev : next));
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [searchInput, searchType, vehicleScoped]);

  const handleSearchTypeChange = (nextType: SearchType) => {
    // Same chip is a no-op — avoids clearing an in-progress type-ahead term.
    if (nextType === searchType && !vehicleScoped) return;
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    // Clearing search + leaving vehicle scope is local UI only; list API params
    // are unchanged for a normal period ledger, so fetchData will not re-run.
    setVehicleScoped(false);
    setSearchInput('');
    setSearch('');
    setSearchType(nextType);
  };

  const handleSearchChange = (text: string) => {
    setVehicleScoped(false);
    setSearchInput(text.toUpperCase());
  };

  /** Reset period, txn type, and search — same as web TollTransactionReportHeader Reset. */
  const handleClearFilters = () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setVehicleScoped(false);
    setSearchInput('');
    setSearch('');
    setSearchType('vehicleNo');
    setTxnType('');
    setTxnTypeOpen(false);
    setCustomRange(null);
    setDateFilter({ mode: 'preset', dateRange: DEFAULT_TOLL_LIST_RANGE });
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    // PDF must be scoped to a vehicle — location/RRN-only exports are Excel-only.
    const vehicleTerm = searchType === 'vehicleNo'
      ? normalizeSearchTerm(search, 'vehicleNo')
      : '';
    if (format === 'pdf' && !vehicleTerm) {
      Alert.alert(
        'Vehicle required',
        'Select a vehicle before exporting PDF. All-vehicle PDFs are too large for this report.',
      );
      return;
    }

    const exportParams = buildExportParams(
      dateFilter,
      searchType,
      search,
      vehicleScoped,
      txnType,
      scopedCustomerId,
    );

    setShowExportMenu(false);
    setExporting(format);
    try {
      const response = format === 'excel'
        ? await tollApi.exportTransactionsExcel(exportParams)
        : await tollApi.exportTransactionsPdf(exportParams);

      const filename = format === 'excel' ? 'Toll_transactions.xlsx' : 'Toll_transactions.pdf';
      const mimeType = format === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';

      const location = await downloadBinaryFile(response.data, filename, mimeType);
      Alert.alert('Download complete', `${filename} saved to ${location}.`);
    } catch (err: unknown) {
      Alert.alert(
        'Export failed',
        getApiErrorMessage(err, `Could not export ${format.toUpperCase()} file. Please try again.`),
      );
    } finally {
      setExporting(null);
    }
  };

  const renderItem = ({ item }: { item: TollTransactionDetail }) => {
    const badge = resolveTollTxnBadge(item);
    const isClaimable = item.isDoubleDebit || item.isSuspicious;
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => nav.navigate('TollDetail', { transaction: item })}
      >
        <GlassCard
          variant={item.isDoubleDebit ? 'danger' : item.isSuspicious ? 'warning' : 'default'}
          style={styles.txnCard}
        >
          <View style={styles.txnTop}>
            <View style={styles.txnLeft}>
              <Text style={styles.vehicleNo}>{item.vehicleNo}</Text>
              <Text style={styles.plaza} numberOfLines={1}>{item.tollPlaza}</Text>
              <Text style={styles.rrn} selectable>RRN: {item.rrn}</Text>
            </View>
            <View style={styles.txnRight}>
              <Text style={[
                styles.amount,
                item.isDoubleDebit && { color: Colors.dangerLight },
                item.isSuspicious  && { color: Colors.warningLight },
              ]}>
                {formatINR(item.txnAmount)}
              </Text>
              <StatusPill label={badge.label} variant={badge.variant} small />
            </View>
          </View>
          <View style={styles.txnBottom}>
            <Text style={styles.datetime}>{fmtDateTime(item.txnDateTime)}</Text>
            {isClaimable && !item.claimStatus && (
              <TouchableOpacity style={styles.claimBtn}>
                <Text style={styles.claimBtnText}>+ Raise Claim</Text>
              </TouchableOpacity>
            )}
          </View>
        </GlassCard>
      </TouchableOpacity>
    );
  };

  return (
    <LiquidBackground>
      <ScreenHeader
        title="Toll Transactions"
        rightElement={(
          <TouchableOpacity
            style={[styles.downloadBtn, showExportMenu && styles.downloadBtnActive]}
            onPress={() => setShowExportMenu((open) => !open)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Download report"
            disabled={!!exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={showExportMenu ? Colors.infoLight : Colors.blue} />
            ) : (
              <WebDownloadIcon
                color={showExportMenu ? Colors.infoLight : Colors.blue}
                size={18}
              />
            )}
          </TouchableOpacity>
        )}
      />

      <ReportExportDropdown
        showMenu={showExportMenu}
        onExportExcel={() => handleExport('excel')}
        onExportPdf={() => handleExport('pdf')}
      />

      <View style={styles.filters}>
        <FlatList
          horizontal
          data={PRESET_PERIODS}
          keyExtractor={(p) => p.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.chip,
                dateFilter.mode === 'preset' && dateFilter.dateRange === item.value && styles.chipActive,
              ]}
              onPress={() => {
                setVehicleScoped(false);
                setDateFilter({ mode: 'preset', dateRange: item.value });
              }}
            >
              <Text style={[
                styles.chipText,
                dateFilter.mode === 'preset' && dateFilter.dateRange === item.value && styles.chipTextActive,
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          // Custom Range lives inline as the trailing chip so it aligns with the
          // Today/Yesterday presets instead of dropping to a separate row below.
          ListFooterComponent={(
            <TouchableOpacity
              style={[
                styles.chip,
                styles.customChip,
                dateFilter.mode === 'custom' && styles.chipActive,
              ]}
              onPress={() => setShowDateModal(true)}
            >
              <Text style={[
                styles.chipText,
                dateFilter.mode === 'custom' && styles.chipTextActive,
              ]}>
                {customRangeLabel ? `Custom: ${customRangeLabel}` : 'Custom Range'}
              </Text>
            </TouchableOpacity>
          )}
        />

        <TouchableOpacity
          style={[styles.txnTypeSelect, Boolean(txnType) && styles.txnTypeSelectActive]}
          onPress={() => setTxnTypeOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.txnTypeSelectLabel}>Transaction Type</Text>
          <Text
            style={[styles.txnTypeSelectValue, Boolean(txnType) && styles.txnTypeSelectValueActive]}
            numberOfLines={1}
          >
            {tollTxnTypeLabel(txnType)}
          </Text>
        </TouchableOpacity>

        <View style={styles.searchTypeRow}>
          {SEARCH_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, searchType === t.value && styles.typeChipActive]}
              onPress={() => handleSearchTypeChange(t.value)}
            >
              <Text style={[styles.typeChipText, searchType === t.value && styles.typeChipTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={SEARCH_TYPES.find((t) => t.value === searchType)?.placeholder}
            placeholderTextColor={Colors.text.subtle}
            value={searchInput}
            onChangeText={handleSearchChange}
            autoCapitalize={searchType === 'rrn' ? 'none' : 'characters'}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              // Enter applies immediately (skip remaining debounce wait).
              if (searchDebounceRef.current) {
                clearTimeout(searchDebounceRef.current);
                searchDebounceRef.current = null;
              }
              setSearch(normalizeSearchTerm(searchInput, searchType));
            }}
          />
          {searchInput.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                if (searchDebounceRef.current) {
                  clearTimeout(searchDebounceRef.current);
                  searchDebounceRef.current = null;
                }
                setSearchInput('');
                setSearch('');
                setVehicleScoped(false);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Clear search"
            >
              <Text style={styles.clearSearch}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.clearBtn}
          onPress={handleClearFilters}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Clear filters"
        >
          <Text style={styles.clearBtnText}>Clear</Text>
        </TouchableOpacity>

        {visibleTotal > 0 && (
          <View style={styles.summaryBar}>
            <Text style={styles.summaryText}>
              {normalizeSearchTerm(search, searchType) && !vehicleScoped
                ? `${visibleTotal.toLocaleString('en-IN')} matching`
                : `${visibleTotal.toLocaleString('en-IN')} transactions`}
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} style={styles.skeleton} />)}
        </View>
      ) : (
        <FlatList
          data={visibleTxns}
          keyExtractor={(t) => String(t.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(1, true)} tintColor={Colors.blue} />
          }
          onEndReached={() => {
            // Keep loading more period rows so a short type-ahead term can match later pages.
            if (!loadingMore && txns.length < total) fetchData(page + 1);
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState title="No transactions found" subtitle="Try changing the period or search term." icon="🚛" />
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={Colors.blue} style={{ marginVertical: 16 }} /> : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <TollDateRangeModal
        visible={showDateModal}
        initialRange={customRange}
        onClose={() => setShowDateModal(false)}
        onApply={(range) => {
          setVehicleScoped(false);
          setCustomRange(range);
          setDateFilter({ mode: 'custom', fromDate: range.fromDate, toDate: range.toDate });
        }}
      />

      {/* Same txn-type codes as web TollTransactionReportHeader Select. */}
      <Modal
        visible={txnTypeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTxnTypeOpen(false)}
      >
        <TouchableOpacity
          style={styles.txnTypeBackdrop}
          activeOpacity={1}
          onPress={() => setTxnTypeOpen(false)}
        >
          <View style={styles.txnTypeSheet}>
            <Text style={styles.txnTypeTitle}>Transaction Type</Text>
            <ScrollView>
              <TouchableOpacity
                style={styles.txnTypeOption}
                onPress={() => {
                  setTxnType('');
                  setTxnTypeOpen(false);
                }}
              >
                <Text style={[styles.txnTypeOptionText, !txnType && styles.txnTypeOptionActive]}>
                  All transaction types
                </Text>
              </TouchableOpacity>
              {TOLL_TXN_TYPE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={styles.txnTypeOption}
                  onPress={() => {
                    setTxnType(opt.value);
                    setTxnTypeOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.txnTypeOptionText,
                      txnType === opt.value && styles.txnTypeOptionActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  downloadBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBtnActive: { backgroundColor: Colors.infoBg, borderColor: Colors.infoBorder },
  filters: { paddingHorizontal: Spacing[4], paddingTop: Spacing[1] },
  txnTypeSelect: {
    marginTop: 8,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  txnTypeSelectActive: {
    backgroundColor: Colors.infoBg,
    borderColor: Colors.infoBorder,
  },
  txnTypeSelectLabel: {
    fontSize: FontSize.xs,
    color: Colors.text.subtle,
    fontWeight: '600',
    marginBottom: 2,
  },
  txnTypeSelectValue: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  txnTypeSelectValueActive: {
    color: Colors.infoLight,
    fontWeight: '700',
  },
  txnTypeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 11, 31, 0.72)',
    justifyContent: 'flex-end',
  },
  txnTypeSheet: {
    backgroundColor: Colors.bg.d2,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    maxHeight: '55%',
    paddingTop: Spacing[3],
    paddingBottom: Spacing[4],
  },
  txnTypeTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[2],
  },
  txnTypeOption: {
    paddingHorizontal: Spacing[4],
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  txnTypeOptionText: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  txnTypeOptionActive: {
    color: Colors.infoLight,
    fontWeight: '700',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.full,
  },
  // Trailing chip in the preset row — small left gap to match the row spacing.
  customChip: {
    marginLeft: 8,
  },
  chipActive: { backgroundColor: Colors.infoBg, borderColor: Colors.infoBorder },
  chipText: { fontSize: FontSize.sm, color: Colors.text.subtle, fontWeight: '500' },
  chipTextActive: { color: Colors.infoLight, fontWeight: '700' },
  searchTypeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  typeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
  },
  typeChipActive: { backgroundColor: Colors.infoBg, borderColor: Colors.infoBorder },
  typeChipText: { fontSize: FontSize.sm, color: Colors.text.subtle, fontWeight: '500' },
  typeChipTextActive: { color: Colors.infoLight, fontWeight: '700' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: FontSize.base, color: Colors.white },
  clearSearch: { fontSize: 14, color: Colors.text.subtle, paddingHorizontal: 4 },
  clearBtn: {
    marginTop: 8,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  clearBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  summaryBar: { marginTop: 6, marginBottom: 2 },
  summaryText: { fontSize: FontSize.xs, color: Colors.text.subtle, fontWeight: '500' },
  loadingContainer: { padding: Spacing[4], gap: 8 },
  skeleton: { marginBottom: 2 },
  listContent: { paddingHorizontal: Spacing[4], paddingTop: Spacing[2], gap: 8, paddingBottom: 32 },
  txnCard: { padding: 13 },
  txnTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  txnLeft: { flex: 1, gap: 2 },
  txnRight: { alignItems: 'flex-end', gap: 4 },
  vehicleNo: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white, fontFamily: 'monospace' },
  plaza: { fontSize: FontSize.sm, color: Colors.text.secondary },
  rrn: { fontSize: FontSize.xs, color: Colors.text.subtle, fontFamily: 'monospace' },
  amount: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },
  txnBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  datetime: { fontSize: FontSize.xs, color: Colors.text.subtle },
  claimBtn: { backgroundColor: Colors.yellow, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  claimBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.navy },
});
