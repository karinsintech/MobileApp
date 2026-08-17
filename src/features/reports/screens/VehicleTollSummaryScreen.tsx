/**
 * Vehicle Toll Transactions Summary — web /transaction/vehicle-transaction-report parity.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { reportApi, type VehicleTollSummaryRow } from '../../../services/api/reportApi';
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
import ReportSummaryCards, { buildVehicleSummaryCards } from '../components/ReportSummaryCards';
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
import type { MoreStackParamList } from '../../../navigation/types';

const PAGE_SIZE = 25;

function filtersFromDateRange(dateRange?: TollReportDateRange): TollReportFilters {
  if (!dateRange) return EMPTY_TOLL_REPORT_FILTERS;
  return { ...EMPTY_TOLL_REPORT_FILTERS, dateRange };
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>{value ?? '—'}</Text>
    </View>
  );
}

export default function VehicleTollSummaryScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<RouteProp<MoreStackParamList, 'VehicleTollSummary'>>();
  const { user } = useAppSelector((s) => s.auth);

  const initialDateRange = route.params?.initialDateRange;

  const [draftFilters, setDraftFilters] = useState(() => filtersFromDateRange(initialDateRange));
  const [appliedFilters, setAppliedFilters] = useState(() => filtersFromDateRange(initialDateRange));
  const [customers, setCustomers] = useState<Array<{ yapEntityId: string; firstName: string; vehicles: Array<{ vehicleNo: string }> }>>([]);
  const [agents, setAgents] = useState<Array<{ id: number; agentName: string }>>([]);
  const [rows, setRows] = useState<VehicleTollSummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [cards, setCards] = useState<ReturnType<typeof buildVehicleSummaryCards>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  const showCustomerColumns = requiresAdminContextPicker(user?.roleKey);
  const showSummaryCards = user?.roleKey === 'ADMIN';

  const vehicles = useMemo(() => {
    const seen = new Set<string>();
    return customers.flatMap((customer) => customer.vehicles ?? [])
      .filter((vehicle) => {
        if (!vehicle.vehicleNo || seen.has(vehicle.vehicleNo)) return false;
        seen.add(vehicle.vehicleNo);
        return true;
      })
      .map((vehicle) => ({ vehicleNo: vehicle.vehicleNo }));
  }, [customers]);

  const filtersActive = useMemo(
    () => hasActiveTollReportFilters(appliedFilters),
    [appliedFilters],
  );

  // Dashboard fleet utilisation bars pass initialDateRange — apply it when the screen opens.
  useEffect(() => {
    if (!initialDateRange) return;
    const next = filtersFromDateRange(initialDateRange);
    setDraftFilters(next);
    setAppliedFilters(next);
  }, [initialDateRange]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await reportApi.getCustomerVehicleList();
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
      const { data } = await reportApi.getVehicleTollSummary(
        buildTollReportQueryParams(filters, 1, PAGE_SIZE),
      );
      setRows(data.results ?? []);
      setTotal(data.total ?? 0);
      setCards(buildVehicleSummaryCards(data.cards));
    } catch {
      setRows([]);
      setTotal(0);
      setCards(buildVehicleSummaryCards());
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

  const openVehicleToll = (vehicleNo?: string) => {
    if (!vehicleNo) return;
    nav.navigate('Toll', {
      screen: 'TollList',
      params: {
        initialVehicleNo: vehicleNo,
        initialDateRange: appliedFilters.dateRange || undefined,
      },
    });
  };

  const exportParams = useMemo(
    () => stripReportPagination(buildTollReportQueryParams(appliedFilters, 1, PAGE_SIZE)),
    [appliedFilters],
  );

  const handleExport = async (format: 'excel' | 'pdf') => {
    // Monthly summary is small enough for an all-vehicle PDF. Line-item
    // Toll Transactions still require a VRN before PDF export.
    setShowExportMenu(false);
    setExporting(format);

    const filename = format === 'excel' ? 'Vehicle_transactions.xlsx' : 'Vehicle_transactions.pdf';
    await runReportExport(
      format,
      () => (format === 'excel'
        ? reportApi.exportVehicleTollSummaryExcel(exportParams)
        : reportApi.exportVehicleTollSummaryPdf(exportParams)),
      filename,
    );

    setExporting(null);
  };

  const renderItem = ({ item }: { item: VehicleTollSummaryRow }) => (
    <TouchableOpacity activeOpacity={0.85} onPress={() => openVehicleToll(item.vehicleNo)}>
      <GlassCard style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.vehicleNo}>{item.vehicleNo ?? '—'}</Text>
          <Text style={styles.month}>{formatReportMonth(item.month)}</Text>
        </View>
        {showCustomerColumns && item.customerName ? (
          <Text style={styles.meta} numberOfLines={1}>{item.customerName}</Text>
        ) : null}
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Class</Text>
            <Text style={styles.metricValue}>{item.vehicleClass ?? '—'}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Tolls</Text>
            <Text style={styles.metricValue}>{item.noOfTolls ?? '—'}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Debit</Text>
            <Text style={styles.metricValue}>{formatINR(Number(item.debitAmount ?? 0))}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Credit</Text>
            <Text style={styles.metricValue}>{formatINR(Number(item.creditAmount ?? 0))}</Text>
          </View>
        </View>
        {showCustomerColumns ? (
          <DetailRow label="Customer ID" value={item.customerId} />
        ) : null}
      </GlassCard>
    </TouchableOpacity>
  );

  return (
    <LiquidBackground>
      <ScreenHeader
        title="Vehicle Toll Summary"
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
          mode="vehicle"
          roleKey={user?.roleKey}
          draft={draftFilters}
          customers={customers}
          vehicles={vehicles}
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

      {loading ? (
        <View style={{ padding: Spacing[4], gap: 8 }}>
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row, index) => `${row.vehicleNo ?? 'row'}-${row.month ?? index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(appliedFilters, true)} tintColor={Colors.blue} />
          }
          ListEmptyComponent={
            <EmptyState title="No records found" icon="📊" subtitle="No vehicle toll summary matches your filters." />
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  vehicleNo: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white, fontFamily: 'monospace', flex: 1 },
  month: { fontSize: FontSize.xs, color: Colors.text.subtle, fontWeight: '600' },
  meta: { fontSize: FontSize.sm, color: Colors.text.secondary },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { minWidth: '22%', gap: 2 },
  metricLabel: { fontSize: FontSize.xs, color: Colors.text.label, fontWeight: '600' },
  metricValue: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '700' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 4 },
  detailLabel: { fontSize: FontSize.xs, color: Colors.text.label },
  detailValue: { fontSize: FontSize.xs, color: Colors.text.secondary, fontWeight: '600', flex: 1, textAlign: 'right' },
});
