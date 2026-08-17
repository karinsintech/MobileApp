/**
 * Customer Toll Transactions Summary — web /transaction/customer-transaction-report parity.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
} from 'react-native';
import { reportApi, type CustomerBalanceSummary, type CustomerTollSummaryRow } from '../../../services/api/reportApi';
import { apiClient } from '../../../services/api/client';
import { useAppSelector } from '../../../store';
import {
  LiquidBackground, GlassCard, SkeletonCard, EmptyState, ScreenHeader,
} from '../../../components';
import { Colors, FontSize, Spacing } from '../../../theme';
import { formatINR } from '../../../utils/format';
import { requiresAdminContextPicker } from '../../../types/auth';
import { canShowAgentFilter } from '../../toll/components/TagInventoryFilterPanel';
import TollReportFilterPanel from '../components/TollReportFilterPanel';
import ReportSummaryCards, { buildCustomerSummaryCards } from '../components/ReportSummaryCards';
import {
  ReportExportDropdown,
  ReportFilterButton,
  ReportHeaderActions,
} from '../components/ReportExportMenu';
import { runReportExport, stripReportPagination } from '../utils/reportExportUtils';
import {
  EMPTY_TOLL_REPORT_FILTERS,
  buildTollReportQueryParams,
  formatReportMonth,
  hasActiveTollReportFilters,
  type TollReportFilters,
  type TollReportDateRange,
} from '../constants/tollReportFilters';

const PAGE_SIZE = 25;

function BalanceSummaryCard({ summary }: { summary: CustomerBalanceSummary }) {
  const rows: Array<[string, number | undefined]> = [
    ['Opening Balance', summary.accountOpeningBalance],
    ['Credit Amount', summary.accountTotalCredit],
    ['Claim Amount', summary.accountTotalClaim],
    ['Miscellaneous Debit', summary.miscellaneousDebit],
    ['Total Expenses', summary.accountTotalDebit],
    ['Closing Balance', summary.accountClosingBalance],
    ['In Transit (Corp to Fastag)', summary.inTransitAmount],
  ];

  return (
    <GlassCard style={styles.balanceCard}>
      <Text style={styles.balanceTitle}>Balance Summary</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>{label}</Text>
          <Text style={styles.balanceValue}>{formatINR(Number(value ?? 0))}</Text>
        </View>
      ))}
    </GlassCard>
  );
}

export default function CustomerTollSummaryScreen() {
  const { user } = useAppSelector((s) => s.auth);

  const [draftFilters, setDraftFilters] = useState<TollReportFilters>(EMPTY_TOLL_REPORT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<TollReportFilters>(EMPTY_TOLL_REPORT_FILTERS);
  const [customers, setCustomers] = useState<Array<{ yapEntityId: string; firstName: string }>>([]);
  const [agents, setAgents] = useState<Array<{ id: number; agentName: string }>>([]);
  const [rows, setRows] = useState<CustomerTollSummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [balanceSummary, setBalanceSummary] = useState<CustomerBalanceSummary | null>(null);
  const [cards, setCards] = useState<ReturnType<typeof buildCustomerSummaryCards>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  const showCustomerColumns = requiresAdminContextPicker(user?.roleKey);
  const showSummaryCards = user?.roleKey === 'ADMIN' || user?.roleKey === 'AGENT';

  const filtersActive = useMemo(
    () => hasActiveTollReportFilters(appliedFilters),
    [appliedFilters],
  );

  useEffect(() => {
    (async () => {
      try {
        const { data } = await reportApi.getCustomerList();
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

  const fetchData = useCallback(async (filters: TollReportFilters, isRefresh = false) => {
    isRefresh ? setRefresh(true) : setLoading(true);
    try {
      const { data } = await reportApi.getCustomerTollSummary(
        buildTollReportQueryParams(filters, 1, PAGE_SIZE),
      );
      setRows(data.result ?? []);
      setTotal(data.count ?? 0);
      setBalanceSummary(data.balanceSummary ?? null);
      setCards(buildCustomerSummaryCards(data.cards));
    } catch {
      setRows([]);
      setTotal(0);
      setBalanceSummary(null);
      setCards(buildCustomerSummaryCards());
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  useEffect(() => { fetchData(appliedFilters); }, [fetchData, appliedFilters]);

  const handleSearch = () => {
    setAppliedFilters({ ...draftFilters });
    setShowFilters(false);
  };

  const handleReset = () => {
    setDraftFilters(EMPTY_TOLL_REPORT_FILTERS);
    setAppliedFilters(EMPTY_TOLL_REPORT_FILTERS);
  };

  const handleSummaryCardPress = (dateRange: TollReportDateRange) => {
    const next = {
      ...appliedFilters,
      dateRange,
      fromDate: '',
      toDate: '',
    };
    setDraftFilters(next);
    setAppliedFilters(next);
  };

  const exportParams = useMemo(
    () => stripReportPagination(buildTollReportQueryParams(appliedFilters, 1, PAGE_SIZE)),
    [appliedFilters],
  );

  const handleExport = async (format: 'excel' | 'pdf') => {
    setShowExportMenu(false);
    setExporting(format);

    const filename = format === 'excel' ? 'Customer_txn_summary.xlsx' : 'Customer_txn_summary.pdf';
    await runReportExport(
      format,
      () => (format === 'excel'
        ? reportApi.exportCustomerTollSummaryExcel(exportParams)
        : reportApi.exportCustomerTollSummaryPdf(exportParams)),
      filename,
    );

    setExporting(null);
  };

  const renderItem = ({ item }: { item: CustomerTollSummaryRow }) => (
    <GlassCard style={styles.card}>
      <View style={styles.cardTop}>
        {showCustomerColumns ? (
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{item.customerName ?? '—'}</Text>
            <Text style={styles.customerId}>{item.customerId ?? '—'}</Text>
          </View>
        ) : (
          <Text style={styles.customerName}>Summary</Text>
        )}
        <Text style={styles.month}>{formatReportMonth(item.month)}</Text>
      </View>
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>No of Tolls</Text>
          <Text style={styles.metricValue}>{item.noOfTolls ?? '—'}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Toll Expenses</Text>
          <Text style={styles.metricValue}>{formatINR(Number(item.totalExpenses ?? 0))}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Claim Amt</Text>
          <Text style={styles.metricValue}>{formatINR(Number(item.claimAmount ?? 0))}</Text>
        </View>
      </View>
    </GlassCard>
  );

  return (
    <LiquidBackground>
      <ScreenHeader
        title="Customer Toll Summary"
        subtitle={total ? `${total} records` : undefined}
        showBack
        rightElement={(
          <ReportHeaderActions
            showMenu={showExportMenu}
            exporting={exporting}
            onToggleMenu={() => setShowExportMenu((open) => !open)}
            onExportExcel={() => handleExport('excel')}
            onExportPdf={() => handleExport('pdf')}
            filterButton={(
              <ReportFilterButton
                active={showFilters || filtersActive}
                onPress={() => setShowFilters((open) => !open)}
              />
            )}
          />
        )}
      />

      <ReportExportDropdown
        showMenu={showExportMenu}
        onExportExcel={() => handleExport('excel')}
        onExportPdf={() => handleExport('pdf')}
      />

      {showFilters ? (
        <TollReportFilterPanel
          mode="customer"
          roleKey={user?.roleKey}
          draft={draftFilters}
          customers={customers}
          vehicles={[]}
          agents={agents}
          onChange={setDraftFilters}
          onSearch={handleSearch}
          onReset={handleReset}
        />
      ) : null}

      {showSummaryCards ? (
        <ReportSummaryCards
          cards={cards}
          activeDateRange={appliedFilters.dateRange}
          onSelect={handleSummaryCardPress}
        />
      ) : null}

      {balanceSummary ? (
        <View style={{ paddingHorizontal: Spacing[4], paddingBottom: Spacing[2] }}>
          <BalanceSummaryCard summary={balanceSummary} />
        </View>
      ) : null}

      {loading ? (
        <View style={{ padding: Spacing[4], gap: 8 }}>
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row, index) => `${row.customerId ?? 'row'}-${row.month ?? index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(appliedFilters, true)} tintColor={Colors.blue} />
          }
          ListEmptyComponent={
            <EmptyState title="No records found" icon="📊" subtitle="No customer toll summary matches your filters." />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing[4], paddingTop: Spacing[2], gap: 8, paddingBottom: 32 },
  card: { padding: 13, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  customerName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white },
  customerId: { fontSize: FontSize.xs, color: Colors.text.subtle, marginTop: 2 },
  month: { fontSize: FontSize.xs, color: Colors.text.subtle, fontWeight: '600' },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { minWidth: '28%', gap: 2 },
  metricLabel: { fontSize: FontSize.xs, color: Colors.text.label, fontWeight: '600' },
  metricValue: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '700' },
  balanceCard: { padding: Spacing[3], gap: 8 },
  balanceTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white, marginBottom: 4 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  balanceLabel: { fontSize: FontSize.xs, color: Colors.text.label, flex: 1 },
  balanceValue: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '700' },
});
