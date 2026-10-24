/**
 * Wallet Transaction Report — web /transaction/wallet-transaction-report parity.
 * Ledger-only (wallet-transaction-data); recharge history stays on the Wallet menu feed.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  walletApi,
  type WalletParams,
  type WalletReportRow,
} from '../../../services/api/walletApi';
import { apiClient } from '../../../services/api/client';
import { useAppSelector } from '../../../store';
import {
  LiquidBackground, GlassCard, SkeletonCard, EmptyState, ScreenHeader,
} from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { fmtDateTime } from '../../../utils/format';
import { downloadBinaryFile } from '../../../utils/fileExport';
import { WebDownloadIcon } from '../components/ReportExportMenu';
import { requiresAdminContextPicker } from '../../../types/auth';
import { canShowAgentFilter } from '../../toll/components/TagInventoryFilterPanel';
import WalletTransactionFilterPanel from '../components/WalletTransactionFilterPanel';
import WalletSummaryCards, { buildWalletSummaryCards } from '../components/WalletSummaryCards';
import WalletTransactionDetailModal from '../components/WalletTransactionDetailModal';
import {
  DEFAULT_WALLET_REPORT_FILTERS,
  WALLET_PAGE_SIZE_OPTIONS,
  buildWalletReportQueryParams,
  formatWalletAmount,
  hasActiveWalletReportFilters,
  walletTypeLabel,
  walletTxnAmounts,
  type WalletReportFilters,
  type WalletReportDateRange,
} from '../constants/walletReportFilters';

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'credit' | 'debit' | 'failed' }) {
  const valueStyle = tone === 'credit'
    ? styles.cellValueCredit
    : tone === 'debit'
      ? styles.cellValueDebit
      : tone === 'failed'
        ? styles.cellValueFailed
        : styles.cellValue;

  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={valueStyle} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

/** Stable row key so load-more does not re-append the same ledger entry. */
function walletRowKey(row: WalletReportRow): string {
  return `${row.txnRefNo ?? ''}-${row.txnDate ?? ''}-${row.txnAmount ?? ''}-${row.type ?? ''}`;
}

function appendWalletRows(existing: WalletReportRow[], nextPage: WalletReportRow[]): WalletReportRow[] {
  const seen = new Set(existing.map(walletRowKey));
  const merged = [...existing];
  for (const row of nextPage) {
    const key = walletRowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

export default function WalletTransactionReportScreen() {
  const { user } = useAppSelector((s) => s.auth);

  const [draftFilters, setDraftFilters] = useState<WalletReportFilters>(DEFAULT_WALLET_REPORT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<WalletReportFilters>(DEFAULT_WALLET_REPORT_FILTERS);
  const [customers, setCustomers] = useState<Array<{ yapEntityId: string; firstName: string }>>([]);
  const [agents, setAgents] = useState<Array<{ id: number; agentName: string }>>([]);
  const [items, setItems] = useState<WalletReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summaryCards, setSummaryCards] = useState(buildWalletSummaryCards());
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<WalletReportRow | null>(null);

  const fetchingRef = useRef(false);

  const showCustomerColumns = requiresAdminContextPicker(user?.roleKey);
  const showSummaryCards = user?.roleKey === 'ADMIN';

  const filtersActive = useMemo(
    () => hasActiveWalletReportFilters(appliedFilters),
    [appliedFilters],
  );

  const rangeStart = total === 0 ? 0 : 1;
  const rangeEnd = items.length;
  const hasMore = pageNo * pageSize < total;

  useEffect(() => {
    (async () => {
      try {
        const { data } = await walletApi.getCustomerList();
        setCustomers(data ?? []);
      } catch { /* optional filter source */ }
    })();
  }, []);

  useEffect(() => {
    if (!canShowAgentFilter(user?.roleKey)) return;
    (async () => {
      try {
        const { data } = await apiClient.get<any>('/agent/');
        const agentRows = data?.data?.rows ?? [];
        setAgents(agentRows.map((item: any) => ({ id: item.id, agentName: item.agentName })));
      } catch { /* optional filter source */ }
    })();
  }, [user?.roleKey]);

  const fetchData = useCallback(async (
    filters: WalletReportFilters,
    page: number,
    size: number,
    mode: 'replace' | 'append' | 'refresh' = 'replace',
  ) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    if (mode === 'refresh') setRefreshing(true);
    else if (mode === 'append') setLoadingMore(true);
    else setLoading(true);

    try {
      // Web parity: wallet ledger only — never merge /transaction/recharge here.
      const queryParams = buildWalletReportQueryParams(filters, page, size) as WalletParams;
      const { data } = await walletApi.getTransactions(queryParams);
      const rows = data.rows ?? [];

      if (mode === 'append') {
        setItems((prev) => appendWalletRows(prev, rows));
      } else {
        setItems(rows);
      }

      setTotal(data.count ?? rows.length);
      setSummaryCards(buildWalletSummaryCards(data.cards));
      setPageNo(page);
      setPageSize(size);
    } catch {
      if (mode !== 'append') {
        setItems([]);
        setTotal(0);
        setSummaryCards(buildWalletSummaryCards());
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
      fetchingRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData(appliedFilters, 1, pageSize, 'replace');
    }, [appliedFilters, fetchData, pageSize]),
  );

  const handleSearch = () => {
    setAppliedFilters({ ...draftFilters });
    setShowFilters(false);
  };

  const handleReset = () => {
    setDraftFilters(DEFAULT_WALLET_REPORT_FILTERS);
    setAppliedFilters(DEFAULT_WALLET_REPORT_FILTERS);
  };

  const handleSummarySelect = (dateRange: WalletReportDateRange) => {
    const next: WalletReportFilters = {
      ...appliedFilters,
      dateRange: appliedFilters.dateRange === dateRange ? '' : dateRange,
      fromDate: '',
      toDate: '',
    };
    setDraftFilters(next);
    setAppliedFilters(next);
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore) {
      fetchData(appliedFilters, pageNo + 1, pageSize, 'append');
    }
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    setShowExportMenu(false);
    setExporting(format);

    const exportParams = buildWalletReportQueryParams(appliedFilters, 1, pageSize);
    delete exportParams.pageNo;
    delete exportParams.pageSize;

    try {
      const response = format === 'excel'
        ? await walletApi.exportTransactionsExcel(exportParams)
        : await walletApi.exportTransactionsPdf(exportParams);

      const filename = format === 'excel' ? 'Wallet_transactions.xlsx' : 'Wallet_transactions.pdf';
      const mimeType = format === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';

      const location = await downloadBinaryFile(response.data, filename, mimeType);
      Alert.alert('Download complete', `${filename} saved to ${location}.`);
    } catch {
      Alert.alert('Export failed', `Could not export ${format.toUpperCase()} file. Please try again.`);
    } finally {
      setExporting(null);
    }
  };

  const renderItem = ({ item, index }: { item: WalletReportRow; index: number }) => {
    const amounts = walletTxnAmounts(item);
    const serialNo = index + 1;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setSelectedRecord(item)}
      >
        <GlassCard style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.serialNo}>#{serialNo}</Text>
            <Text style={styles.viewLink}>View ›</Text>
          </View>

          {showCustomerColumns ? (
            <View style={styles.rowPair}>
              <Cell label="Customer Name" value={item.customer?.firstName ?? '—'} />
              <Cell label="Customer ID" value={item.customer?.yapEntityId ?? '—'} />
            </View>
          ) : null}

          <View style={styles.rowPair}>
            <Cell label="Txn Date Time" value={item.txnDate ? fmtDateTime(item.txnDate) : '—'} />
            <Cell label="Wallet Type" value={walletTypeLabel(item.walletType)} />
          </View>

          <Cell label="Txn Type" value={item.txnType ?? '—'} />

          <View style={styles.amountRow}>
            <Cell label="Credit" value={amounts.credit ?? '—'} tone={amounts.credit ? 'credit' : undefined} />
            <Cell label="Debit" value={amounts.debit ?? '—'} tone={amounts.debit ? 'debit' : undefined} />
            {showCustomerColumns ? (
              <Cell label="Failed Txn" value={amounts.failed ?? '—'} tone={amounts.failed ? 'failed' : undefined} />
            ) : null}
          </View>

          <View style={styles.rowPair}>
            <Cell label="Balance" value={formatWalletAmount(item.balance)} />
            <Cell label="Txn Status" value={item.txnStatus ?? '—'} />
          </View>
        </GlassCard>
      </TouchableOpacity>
    );
  };

  const listFooter = (
    <View style={styles.footer}>
      <Text style={styles.footerText}>
        Showing {rangeEnd === 0 ? 0 : `${rangeStart} - ${rangeEnd}`} of {total} items
      </Text>

      <ScrollablePageSize
        pageSize={pageSize}
        onChange={(size) => {
          setPageSize(size);
          setPageNo(1);
        }}
      />

      {loadingMore ? <ActivityIndicator color={Colors.blue} style={{ marginTop: 8 }} /> : null}
      {!loadingMore && hasMore ? (
        <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore} activeOpacity={0.85}>
          <Text style={styles.loadMoreText}>Load more</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <LiquidBackground>
      <ScreenHeader
        title="Wallet Transaction Report"
        subtitle={total ? `${items.length} loaded · ${total} total` : undefined}
        showBack
        rightElement={(
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.iconBtn, showExportMenu && styles.iconBtnActive]}
              onPress={() => setShowExportMenu((open) => !open)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Download report"
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
            <TouchableOpacity
              style={[styles.filterBtn, (showFilters || filtersActive) && styles.filterBtnActive]}
              onPress={() => setShowFilters((open) => !open)}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterBtnText, (showFilters || filtersActive) && styles.filterBtnTextActive]}>
                Filters
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {showExportMenu ? (
        <View style={styles.exportMenu}>
          <TouchableOpacity style={styles.exportOption} onPress={() => handleExport('excel')}>
            <Text style={styles.exportOptionText}>Export Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportOption} onPress={() => handleExport('pdf')}>
            <Text style={styles.exportOptionText}>Export PDF</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showFilters ? (
        <WalletTransactionFilterPanel
          roleKey={user?.roleKey}
          draft={draftFilters}
          customers={customers}
          agents={agents}
          onChange={setDraftFilters}
          onSearch={handleSearch}
          onReset={handleReset}
        />
      ) : null}

      {showSummaryCards ? (
        <WalletSummaryCards
          cards={summaryCards}
          activeDateRange={appliedFilters.dateRange}
          onSelect={handleSummarySelect}
        />
      ) : null}

      {loading && !refreshing && items.length === 0 ? (
        <View style={{ flex: 1, padding: Spacing[4], gap: 8 }}>
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          style={styles.flex}
          data={items}
          keyExtractor={(item, index) => `${walletRowKey(item)}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          removeClippedSubviews={false}
          initialNumToRender={Platform.OS === 'ios' ? 12 : 10}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(appliedFilters, 1, pageSize, 'refresh')}
              tintColor={Colors.blue}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No wallet transactions found"
              icon="💳"
              subtitle="Try adjusting your filters or date range."
            />
          }
          ListFooterComponent={items.length > 0 ? listFooter : null}
          showsVerticalScrollIndicator={false}
        />
      )}

      <WalletTransactionDetailModal
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </LiquidBackground>
  );
}

function ScrollablePageSize({
  pageSize,
  onChange,
}: {
  pageSize: number;
  onChange: (size: number) => void;
}) {
  return (
    <View style={styles.pageSizeRow}>
      {WALLET_PAGE_SIZE_OPTIONS.map((size) => {
        const isActive = pageSize === size;
        return (
          <TouchableOpacity
            key={size}
            style={[styles.pageSizeChip, isActive && styles.pageSizeChipActive]}
            onPress={() => onChange(size)}
            activeOpacity={0.85}
          >
            <Text style={[styles.pageSizeText, isActive && styles.pageSizeTextActive]}>
              {size} / page
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    flexWrap: 'nowrap',
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBtnActive: { backgroundColor: Colors.infoBg, borderColor: Colors.infoBorder },
  filterBtn: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexShrink: 0,
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
  exportMenu: {
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[2],
    backgroundColor: Colors.bg.d2,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  exportOption: {
    paddingHorizontal: Spacing[3],
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  exportOptionText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.infoLight },
  list: { paddingHorizontal: Spacing[4], paddingTop: Spacing[2], gap: 8, paddingBottom: 32 },
  card: { padding: 13, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  serialNo: { fontSize: FontSize.xs, color: Colors.text.subtle, fontWeight: '700' },
  viewLink: { fontSize: FontSize.xs, color: Colors.infoLight, fontWeight: '700' },
  rowPair: { flexDirection: 'row', gap: 10 },
  amountRow: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1, gap: 3 },
  cellLabel: { fontSize: FontSize.xs, color: Colors.text.label, fontWeight: '600' },
  cellValue: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '600' },
  cellValueCredit: { fontSize: FontSize.sm, color: Colors.successLight, fontWeight: '700' },
  cellValueDebit: { fontSize: FontSize.sm, color: Colors.dangerLight, fontWeight: '700' },
  cellValueFailed: { fontSize: FontSize.sm, color: Colors.warningLight, fontWeight: '700' },
  footer: { paddingTop: Spacing[3], paddingBottom: Spacing[2], gap: 10, alignItems: 'center' },
  footerText: { fontSize: FontSize.xs, color: Colors.text.subtle, textAlign: 'center' },
  pageSizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  pageSizeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.bg,
  },
  pageSizeChipActive: {
    borderColor: Colors.infoBorder,
    backgroundColor: Colors.infoBg,
  },
  pageSizeText: { fontSize: FontSize.xs, color: Colors.text.secondary, fontWeight: '600' },
  pageSizeTextActive: { color: Colors.infoLight },
  loadMoreBtn: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  loadMoreText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.infoLight },
});
