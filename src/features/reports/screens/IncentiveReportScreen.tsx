/**
 * Incentive Report — customer / CGA / VGA view of web CommissionReport.
 * Admin-only actions (generate, status update, adjust, refresh) are omitted.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { reportApi, type IncentiveReportRow } from '../../../services/api/reportApi';
import { useAppSelector } from '../../../store';
import {
  LiquidBackground, GlassCard, SkeletonCard, EmptyState, ScreenHeader, StatusPill,
} from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { PrivilegeIds } from '../../../types/accessMenus';
import { isCustomer } from '../../../types/auth';
import { useHasAccess } from '../../../hooks/useHasAccess';
import { downloadBinaryFile } from '../../../utils/fileExport';
import IncentiveReportFilterPanel from '../components/IncentiveReportFilterPanel';
import {
  ReportExportDropdown,
  ReportFilterButton,
  ReportHeaderActions,
} from '../components/ReportExportMenu';
import { runReportExport, stripReportPagination } from '../utils/reportExportUtils';
import {
  EMPTY_INCENTIVE_FILTERS,
  buildIncentiveQueryParams,
  canDownloadIncentiveReceipt,
  canShowMobileIncentiveReport,
  formatIncentiveAmount,
  hasActiveIncentiveFilters,
  incentiveStatusVariant,
  type IncentiveReportFilters,
} from '../constants/incentiveReportFilters';

const PAGE_SIZE = 25;

function displayIncentiveAmount(value?: string | number | null): string {
  return `₹${formatIncentiveAmount(value)}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function hasUploadedInvoice(row: IncentiveReportRow): boolean {
  return Boolean(row.invoicePath && row.s3Response);
}

function canViewInvoiceForStatus(status?: string): boolean {
  const s = (status ?? '').toUpperCase().replace(/\s+/g, '_');
  return s === 'INVOICE' || s === 'PAID' || s === 'TDS_PAID' || s === 'SETTLED';
}

export default function IncentiveReportScreen() {
  const { user } = useAppSelector((s) => s.auth);
  const hasCommissionMenu = useHasAccess(PrivilegeIds.COMMISSION_REPORT_MENU);
  const hasViewInvoice = useHasAccess(PrivilegeIds.COMMISSION_REPORT_VIEW_INVOICE);

  const [draftFilters, setDraftFilters] = useState<IncentiveReportFilters>(EMPTY_INCENTIVE_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<IncentiveReportFilters>(EMPTY_INCENTIVE_FILTERS);
  const [rows, setRows] = useState<IncentiveReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNo, setPageNo] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefresh] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<number | null>(null);

  const allowed = canShowMobileIncentiveReport({
    roleKey: user?.roleKey,
    eligibleForCommissionReport: user?.eligibleForCommissionReport,
    hasCommissionMenuAccess: hasCommissionMenu,
  });

  // Invoice actions match web CUSTOMER role only (not CGA / VGA action column).
  const showInvoiceActions = isCustomer(user?.roleKey) && hasViewInvoice;

  const filtersActive = useMemo(
    () => hasActiveIncentiveFilters(appliedFilters),
    [appliedFilters],
  );

  const fetchData = useCallback(async (
    filters: IncentiveReportFilters,
    page: number,
    mode: 'replace' | 'append' | 'refresh' = 'replace',
  ) => {
    if (mode === 'refresh') setRefresh(true);
    else if (mode === 'append') setLoadingMore(true);
    else setLoading(true);

    try {
      const { data } = await reportApi.getIncentiveReport(
        buildIncentiveQueryParams(filters, page, PAGE_SIZE),
      );
      const nextRows = data.result ?? [];
      setRows((prev) => (mode === 'append' ? [...prev, ...nextRows] : nextRows));
      setTotal(data.count ?? 0);
      setPageNo(page);
    } catch {
      if (mode !== 'append') {
        setRows([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
      setRefresh(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    fetchData(appliedFilters, 1, 'replace');
  }, [allowed, appliedFilters, fetchData]);

  const handleSearch = () => {
    setAppliedFilters({ ...draftFilters });
    setShowFilters(false);
  };

  const handleReset = () => {
    setDraftFilters(EMPTY_INCENTIVE_FILTERS);
    setAppliedFilters(EMPTY_INCENTIVE_FILTERS);
  };

  const exportParams = useMemo(
    () => stripReportPagination(buildIncentiveQueryParams(appliedFilters, 1, PAGE_SIZE)),
    [appliedFilters],
  );

  const handleExportExcel = async () => {
    setShowExportMenu(false);
    setExporting('excel');
    await runReportExport(
      'excel',
      () => reportApi.exportIncentiveReportExcel(exportParams),
      'Incentive_Report.xlsx',
    );
    setExporting(null);
  };

  const handleViewInvoice = async (row: IncentiveReportRow) => {
    const url = row.s3Response;
    if (!url) {
      Alert.alert('No Invoice', 'Invoice PDF not found.');
      return;
    }
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Unable to open', 'Cannot open invoice link on this device.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open', 'Could not open the invoice PDF.');
    }
  };

  const handleDownloadReceipt = async (row: IncentiveReportRow) => {
    if (!row?.id || downloadingReceiptId !== null) return;
    setDownloadingReceiptId(row.id);
    try {
      const response = await reportApi.downloadIncentiveReceipt(row.id);
      const safeName = String(row.receiptNo || row.id).replace(/[^\w.-]+/g, '_');
      const location = await downloadBinaryFile(
        response.data,
        `Incentive_Receipt_${safeName}.pdf`,
        'application/pdf',
      );
      Alert.alert('Download complete', `Receipt saved to ${location}.`);
    } catch {
      Alert.alert(
        'Download failed',
        'Could not download receipt. It may be outside the current FY or not settled yet.',
      );
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const handleLoadMore = () => {
    if (loading || loadingMore || refreshing) return;
    if (rows.length >= total) return;
    fetchData(appliedFilters, pageNo + 1, 'append');
  };

  const renderItem = ({ item }: { item: IncentiveReportRow }) => {
    const showReceipt = item.transactionStatus === 'SETTLED'
      && canDownloadIncentiveReceipt(item);
    const showInvoice = showInvoiceActions
      && canViewInvoiceForStatus(item.transactionStatus)
      && hasUploadedInvoice(item);

    return (
      <GlassCard style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{item.month ?? '—'} · {item.year ?? '—'}</Text>
            {item.receiptNo ? (
              <Text style={styles.subtitle}>Receipt: {item.receiptNo}</Text>
            ) : null}
          </View>
          {item.transactionStatus ? (
            <StatusPill
              label={item.transactionStatus.replace(/_/g, ' ')}
              variant={incentiveStatusVariant(item.transactionStatus)}
              small
            />
          ) : null}
        </View>

        <Text style={styles.meta}>{item.bankName ?? '—'}</Text>

        <View style={styles.metricsRow}>
          <Metric label="Debit" value={displayIncentiveAmount(item.debit)} />
          <Metric label="Credit" value={displayIncentiveAmount(item.credit)} />
          <Metric label="Base Amt" value={displayIncentiveAmount(item.baseAmount)} />
        </View>

        <View style={styles.metricsRow}>
          <Metric label="Inc Amt" value={displayIncentiveAmount(item.overallAmount)} />
          <Metric label="Adj Amt" value={displayIncentiveAmount(item.adjustmentAmount)} />
          <Metric label="Amount" value={displayIncentiveAmount(item.amount)} />
        </View>

        <View style={styles.metricsRow}>
          <Metric label="TDS (10%)" value={displayIncentiveAmount(item.tds)} />
          <Metric label="Total Payout" value={displayIncentiveAmount(item.totalPayout)} />
        </View>

        {(showInvoice || showReceipt) ? (
          <View style={styles.actionsRow}>
            {showInvoice ? (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleViewInvoice(item)}
                activeOpacity={0.85}
              >
                <Text style={styles.actionText}>View Invoice</Text>
              </TouchableOpacity>
            ) : null}
            {showReceipt ? (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleDownloadReceipt(item)}
                activeOpacity={0.85}
                disabled={downloadingReceiptId === item.id}
              >
                {downloadingReceiptId === item.id ? (
                  <ActivityIndicator size="small" color={Colors.infoLight} />
                ) : (
                  <Text style={styles.actionText}>Download Receipt</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </GlassCard>
    );
  };

  if (!allowed) {
    return (
      <LiquidBackground>
        <ScreenHeader title="Incentive Report" showBack />
        <EmptyState
          title="Incentive report unavailable"
          icon="💰"
          subtitle="Your account is not enrolled for incentive reporting, or access is not granted."
        />
      </LiquidBackground>
    );
  }

  return (
    <LiquidBackground>
      <ScreenHeader
        title="Incentive Report"
        subtitle={total ? `${total} records` : undefined}
        showBack
        rightElement={(
          <ReportHeaderActions
            showMenu={showExportMenu}
            exporting={exporting}
            excelOnly
            onToggleMenu={() => setShowExportMenu((open) => !open)}
            onExportExcel={handleExportExcel}
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
        excelOnly
        onExportExcel={handleExportExcel}
      />

      {showFilters ? (
        <IncentiveReportFilterPanel
          draft={draftFilters}
          onChange={setDraftFilters}
          onSearch={handleSearch}
          onReset={handleReset}
        />
      ) : null}

      {loading ? (
        <View style={{ padding: Spacing[4], gap: 8 }}>
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => String(row.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(appliedFilters, 1, 'refresh')}
              tintColor={Colors.blue}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 12 }} color={Colors.blue} />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title="No incentive records"
              icon="💰"
              subtitle="No incentive report matches your filters."
            />
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
  title: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white },
  subtitle: { fontSize: FontSize.xs, color: Colors.text.subtle, marginTop: 2 },
  meta: { fontSize: FontSize.xs, color: Colors.text.secondary },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { minWidth: '28%', gap: 2 },
  metricLabel: { fontSize: FontSize.xs, color: Colors.text.label, fontWeight: '600' },
  metricValue: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  actionBtn: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  actionText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.infoLight },
});
