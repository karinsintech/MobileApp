/**
 * Fleet Vehicles list — status cards + filter panel scoped to the active customer.
 * Filtering is backend-owned: Search / card taps only build the same query payload
 * as web VehicleHeader + VehicleContainer (no client-side rematch).
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, Platform, TouchableOpacity,
  RefreshControl, ScrollView, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { vehicleApi } from '../../../services/api/vehicleApi';
import { reportApi } from '../../../services/api/reportApi';
import { apiClient, getApiErrorMessage } from '../../../services/api/client';
import { useAppSelector, selectAuthState } from '../../../store';
import { LiquidBackground, GlassCard, SkeletonCard, EmptyState, ScreenHeader } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { downloadBinaryFile } from '../../../utils/fileExport';
import {
  ReportExportDropdown,
  WebDownloadIcon,
} from '../../reports/components/ReportExportMenu';
import { requiresAdminContextPicker } from '../../../types/auth';
import {
  VEHICLE_CARD_ACCENT,
  VEHICLE_STATUS_CARDS,
  type VehicleStatusCard,
} from '../constants/vehicleStatusCards';
import { isVehicleStatusOn, resolveVehicleStatusDisplay } from '../utils/vehicleStatusUtils';
import { mapVehicleListRow, type VehicleListItem } from '../mapVehicleListRow';
import VehicleFilterPanel from '../components/VehicleFilterPanel';
import { canShowAgentFilter } from '../../toll/components/TagInventoryFilterPanel';
import {
  EMPTY_VEHICLE_FILTERS,
  type VehicleFilters,
  type CustomerFilterOption,
  type AgentFilterOption,
  type VehicleFilterMetaRow,
  type VehicleGroupOption,
  type VehicleNoOption,
} from '../constants/vehicleFilters';

/**
 * Build /vehicle/vehicle-list query params — same keys as web VehicleQueryProps.
 *
 * Backend priority (vehicleService): vehicleStatuses > vehicleStatus > status.
 * Web Search clears card vehicleStatuses so form status filters apply; card click
 * sets vehicleStatuses. customerId must be yapEntityId (never numeric PK).
 */
function buildVehicleQueryParams(
  cardConfig: VehicleStatusCard | null,
  filters: VehicleFilters,
  agentId: string,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    pageNo: '1',
    pageSize: '100',
  };

  // Card filter only when a status card is selected (web handleVehicleCardClick).
  if (cardConfig) {
    params.vehicleStatuses = cardConfig.filter.join(',');
  }

  // Web form customerId is yapEntityId from customer-vehicle-groups-list.
  if (filters.customerId.trim()) {
    params.customerId = filters.customerId.trim();
  }

  if (agentId) params.agentId = agentId;

  const vehicleNo = filters.vehicleNo.trim().toUpperCase();
  const vehicleClass = filters.vehicleClass.trim();
  const tagId = filters.tagId.trim();
  if (vehicleNo) params.vehicleNo = vehicleNo;
  if (vehicleClass) params.vehicleClass = vehicleClass;
  if (tagId) params.tagId = tagId;

  // Web Form.Item name="group" → group title string.
  if (filters.group.trim()) params.group = filters.group.trim();

  // Card tap sets vehicleStatuses; form status fields apply only after Search (no card).
  if (!cardConfig) {
    if (filters.status.trim()) params.status = filters.status.trim();
    if (filters.vehicleStatus.trim()) params.vehicleStatus = filters.vehicleStatus.trim();
  }

  return params;
}

function hasActiveVehicleFilters(filters: VehicleFilters, agentId: string): boolean {
  return Boolean(
    filters.customerId.trim()
    || filters.vehicleNo.trim()
    || filters.vehicleClass.trim()
    || filters.tagId.trim()
    || filters.group
    || filters.status
    || filters.vehicleStatus
    || agentId,
  );
}

function uniqueCustomers(rows: CustomerFilterOption[]): CustomerFilterOption[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.yapEntityId || seen.has(row.yapEntityId)) return false;
    seen.add(row.yapEntityId);
    return true;
  });
}

export default function VehiclesScreen() {
  const nav = useNavigation<any>();
  const { user } = useAppSelector(selectAuthState);

  const [activeCard, setActiveCard] = useState<string | null>('total');
  const [draftFilters, setDraftFilters] = useState<VehicleFilters>(EMPTY_VEHICLE_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<VehicleFilters>(EMPTY_VEHICLE_FILTERS);
  const [agentId, setAgentId] = useState('');
  const [appliedAgentId, setAppliedAgentId] = useState('');
  const [customers, setCustomers] = useState<CustomerFilterOption[]>([]);
  const [agents, setAgents] = useState<AgentFilterOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<VehicleGroupOption[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleNoOption[]>([]);
  const [vehicleStatusOptions, setVehicleStatusOptions] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [vehicles, setVehicles] = useState<VehicleListItem[]>([]);
  const [summaryMap, setSummaryMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [togglingVehicleNo, setTogglingVehicleNo] = useState<string | null>(null);

  const filtersActive = useMemo(
    () => hasActiveVehicleFilters(appliedFilters, appliedAgentId),
    [appliedFilters, appliedAgentId],
  );

  // null = no card filter (web after Search). Selected card → vehicleStatuses CSV.
  const activeCardConfig = useMemo(
    () => (activeCard
      ? VEHICLE_STATUS_CARDS.find((c) => c.key === activeCard) ?? null
      : null),
    [activeCard],
  );

  useEffect(() => {
    if (!requiresAdminContextPicker(user?.roleKey)) return;
    (async () => {
      try {
        const { data } = await vehicleApi.getCustomerVehicleGroups();
        const mapped: CustomerFilterOption[] = (data ?? []).map((row: any) => ({
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
        const { data } = await reportApi.getCustomerVehicleList();
        const seen = new Set<string>();
        const options: VehicleNoOption[] = [];
        (data ?? []).forEach((customer) => {
          (customer.vehicles ?? []).forEach((vehicle) => {
            if (!vehicle.vehicleNo || seen.has(vehicle.vehicleNo)) return;
            seen.add(vehicle.vehicleNo);
            options.push({ vehicleNo: vehicle.vehicleNo });
          });
        });
        setVehicleOptions(options);
      } catch { /* typed VRN picker falls back to free text */ }
    })();
  }, []);

  useEffect(() => {
    if (!canShowAgentFilter(user?.roleKey)) return;
    (async () => {
      try {
        const { data } = await apiClient.get<any>('/agent/');
        const rows = data?.data?.rows ?? [];
        setAgents(rows.map((item: any) => ({
          id: item.id,
          agentName: item.agentName,
        })));
      } catch { /* optional filter source */ }
    })();
  }, [user?.roleKey]);

  useEffect(() => {
    (async () => {
      try {
        // Web VehicleHeader loads group titles + yapStatus from /vehicle/filters only.
        const metaRes = await vehicleApi.getFilterMeta();
        const metaRows: VehicleFilterMetaRow[] = Array.isArray(metaRes.data)
          ? metaRes.data
          : Array.isArray((metaRes.data as any)?.data)
            ? (metaRes.data as any).data
            : [];
        const statuses = [...new Set(metaRows.map((row) => row.yapStatus).filter(Boolean))];
        setVehicleStatusOptions(statuses);

        const titles = [
          ...new Set(
            metaRows.flatMap((row) =>
              row.customer?.vehicleGroups?.map((g) => g.title) ?? [],
            ),
          ),
        ].filter(Boolean) as string[];
        setGroupOptions(titles.map((title) => ({ id: '', title })));
      } catch { /* optional filter source */ }
    })();
  }, []);

  const fetchData = useCallback(async (
    filters: VehicleFilters,
    activeAgentId: string,
    cardConfig: VehicleStatusCard | null,
    isRefresh = false,
  ) => {
    isRefresh ? setRefresh(true) : setLoading(true);

    try {
      const { data } = await vehicleApi.getList(
        buildVehicleQueryParams(cardConfig, filters, activeAgentId) as any,
      );

      const mapped = (data.result?.rows ?? []).map(mapVehicleListRow);
      setVehicles(mapped);

      const nextSummary: Record<string, number> = {};
      (data.statusSummary ?? []).forEach((item) => {
        nextSummary[item.status] = item.count;
      });
      setSummaryMap(nextSummary);
    } catch {
      /* empty state */
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  // Refetch when applied filters, agent, or status card change.
  useEffect(() => {
    fetchData(appliedFilters, appliedAgentId, activeCardConfig);
  }, [fetchData, appliedFilters, appliedAgentId, activeCardConfig]);

  const handleCardPress = (card: VehicleStatusCard) => {
    // Toggle off → clear card filter (web has no vehicleStatuses). Same card again keeps it.
    setActiveCard((prev) => (prev === card.key ? null : card.key));
  };

  const handleDraftChange = (next: VehicleFilters) => {
    setDraftFilters({
      ...next,
      vehicleNo: next.vehicleNo.toUpperCase(),
    });
  };

  /**
   * Search applies form fields and clears card vehicleStatuses — same as web
   * setVehicleQueryParams(values) after wiping previous params.
   */
  const handleSearch = () => {
    const nextFilters: VehicleFilters = {
      ...draftFilters,
      vehicleNo: draftFilters.vehicleNo.trim().toUpperCase(),
      vehicleClass: draftFilters.vehicleClass.trim(),
      tagId: draftFilters.tagId.trim(),
    };
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setAppliedAgentId(agentId);
    setActiveCard(null);
    setShowFilters(false);
  };

  const handleReset = () => {
    setDraftFilters(EMPTY_VEHICLE_FILTERS);
    setAgentId('');
    setAppliedFilters(EMPTY_VEHICLE_FILTERS);
    setAppliedAgentId('');
    setActiveCard('total');
  };

  // Same filters as the list. Empty vehicleNo = full fleet PDF (customers).
  // Toll transaction PDFs still require a VRN because that file is too large.
  const handleExport = async (format: 'excel' | 'pdf') => {
    if (exporting) return;

    const listParams = buildVehicleQueryParams(
      activeCardConfig,
      appliedFilters,
      appliedAgentId,
    );
    const exportParams = {...listParams};
    delete exportParams.pageNo;
    delete exportParams.pageSize;

    setShowExportMenu(false);
    setExporting(format);
    try {
      const response = format === 'excel'
        ? await vehicleApi.exportVehiclesExcel(exportParams)
        : await vehicleApi.exportVehiclesPdf(exportParams);
      const filename = format === 'excel' ? 'Vehicles.xlsx' : 'Vehicles.pdf';
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

  const confirmVehicleToggle = useCallback((item: VehicleListItem, checked: boolean) => {
    const yapKitNo = item.detail.yapKitNumber?.trim();
    if (!yapKitNo) {
      Alert.alert('Unavailable', 'Tag ID is missing for this vehicle.');
      return;
    }

    Alert.alert(
      checked ? 'Activate Vehicle Status' : 'Deactivate Vehicle Status',
      `Are you sure you want to ${checked ? 'activate' : 'deactivate'} vehicle ${item.vehicleNo}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: checked ? 'Activate' : 'Deactivate',
          style: checked ? 'default' : 'destructive',
          onPress: async () => {
            setTogglingVehicleNo(item.vehicleNo);
            try {
              await vehicleApi.updateTagStatus(yapKitNo, checked);
              await fetchData(appliedFilters, appliedAgentId, activeCardConfig, true);
            } catch (err: any) {
              Alert.alert(
                'Error',
                err?.message ?? 'Failed to update vehicle tag status.',
              );
            } finally {
              setTogglingVehicleNo(null);
            }
          },
        },
      ],
    );
  }, [activeCardConfig, appliedAgentId, appliedFilters, fetchData]);

  const renderItem = ({ item }: { item: VehicleListItem }) => {
    const statusDisplay = resolveVehicleStatusDisplay(item.tagStatus);
    const isStatusOn = isVehicleStatusOn(item.tagStatus);
    const isToggling = togglingVehicleNo === item.vehicleNo;

    return (
      <GlassCard
        variant={statusDisplay.tone === 'danger' ? 'danger' : statusDisplay.tone === 'warning' ? 'warning' : 'default'}
        style={styles.card}
      >
        <View style={styles.cardTop}>
          <TouchableOpacity
            style={styles.left}
            activeOpacity={0.8}
            onPress={() => nav.navigate('VehicleDetail', {
              vehicleNo: item.vehicleNo,
              vehicle: item.detail,
            })}
          >
            <Text style={styles.vehicleNo}>{item.vehicleNo}</Text>
            <Text style={styles.customer} numberOfLines={1}>{item.customerName}</Text>
            {item.vehicleGroupName ? (
              <Text style={styles.group}>{item.vehicleGroupName ? `Group: ${item.vehicleGroupName}` : ''}</Text>
            ) : null}
          </TouchableOpacity>
          <View style={styles.right}>
            <View style={styles.switchWrap}>
              <Switch
                value={isStatusOn}
                onValueChange={(checked) => confirmVehicleToggle(item, checked)}
                disabled={isToggling}
                trackColor={{
                  false: Colors.dangerLight,
                  true: Colors.success,
                }}
                thumbColor={Colors.white}
                ios_backgroundColor={Colors.dangerLight}
                style={styles.statusSwitch}
              />
            </View>
            <Text style={styles.yapStatus} numberOfLines={1} ellipsizeMode="tail">
              {item.tagStatus}
            </Text>
          </View>
        </View>
      </GlassCard>
    );
  };

  const listHeader = (
    <View style={styles.header}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsRow}
      >
        {VEHICLE_STATUS_CARDS.map((card) => {
          const isActive = activeCard === card.key;
          const count = summaryMap[card.summaryKey] ?? 0;

          return (
            <TouchableOpacity
              key={card.key}
              style={styles.statTile}
              activeOpacity={0.85}
              onPress={() => handleCardPress(card)}
            >
              <GlassCard
                style={[styles.statChip, isActive && styles.statChipActive]}
              >
                <View style={styles.statChipHead}>
                  <Text style={styles.statChipIcon}>{card.icon}</Text>
                  <Text style={styles.statChipTitle} numberOfLines={1}>{card.title}</Text>
                </View>
                <Text style={styles.statChipValue}>{count}</Text>
              </GlassCard>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <LiquidBackground>
      <ScreenHeader
        title="Fleet Vehicles"
        rightElement={(
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.downloadBtn, showExportMenu && styles.downloadBtnActive]}
              onPress={() => setShowExportMenu((open) => !open)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Download vehicles"
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

      <ReportExportDropdown
        showMenu={showExportMenu}
        onExportExcel={() => handleExport('excel')}
        onExportPdf={() => handleExport('pdf')}
      />

      {showFilters ? (
        <VehicleFilterPanel
          roleKey={user?.roleKey}
          draft={draftFilters}
          agentId={agentId}
          customers={customers}
          agents={agents}
          groupOptions={groupOptions}
          vehicles={vehicleOptions}
          vehicleStatusOptions={vehicleStatusOptions}
          onChange={handleDraftChange}
          onAgentChange={setAgentId}
          onSearch={handleSearch}
          onReset={handleReset}
        />
      ) : null}

      {loading && vehicles.length === 0 ? (
        <View style={{ padding: Spacing[4], gap: 8 }}>
          {listHeader}
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(v) => `${v.vehicleNo}-${v.id}`}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(appliedFilters, appliedAgentId, activeCardConfig, true)}
              tintColor={Colors.blue}
            />
          }
          ListEmptyComponent={<EmptyState title="No vehicles found" icon="🚛" />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    flexWrap: 'nowrap',
  },
  downloadBtn: {
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
  downloadBtnActive: { backgroundColor: Colors.infoBg, borderColor: Colors.infoBorder },
  filterBtn: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
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
  header: { marginBottom: Spacing[2] },
  statsRow: {
    gap: 8,
    paddingRight: Spacing[4],
    marginBottom: 10,
  },
  statTile: { width: 130 },
  statChip: {
    minHeight: 78,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'space-between',
  },
  statChipActive: {
    borderColor: VEHICLE_CARD_ACCENT,
    backgroundColor: Colors.infoBg,
  },
  statChipHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statChipIcon: { fontSize: 14 },
  statChipTitle: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  statChipValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: VEHICLE_CARD_ACCENT,
    marginTop: 6,
  },
  list: { paddingHorizontal: Spacing[4], gap: 8, paddingBottom: 32 },
  card: { padding: 13, overflow: 'hidden' },
  // Keep plate/status on one row; iOS ignores % maxWidth on wrap-sized children,
  // so a long yapStatus must not be allowed to grow the trailing column.
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  left: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingRight: 10,
  },
  right: {
    width: 118,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  switchWrap: {
    width: '100%',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  // UISwitch layout box is wider than the knob; slight scale keeps the visual
  // centered with ALLOCATED-length labels on every row.
  statusSwitch: Platform.OS === 'ios'
    ? { transform: [{ scaleX: 0.86 }, { scaleY: 0.86 }] }
    : {},
  vehicleNo: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
    fontFamily: 'monospace',
  },
  customer: { fontSize: FontSize.sm, color: Colors.text.secondary },
  group: { fontSize: FontSize.xs, color: Colors.text.subtle },
  yapStatus: {
    width: '100%',
    fontSize: FontSize.xs,
    color: Colors.text.subtle,
    textAlign: 'right',
  },
});
