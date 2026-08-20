/**
 * Shared toll report filters — mirrors web Vehicle/Customer Txn report headers.
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform, Alert,
} from 'react-native';
import dayjs from 'dayjs';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { requiresAdminContextPicker, type RoleKey } from '../../../types/auth';
import { canShowAgentFilter } from '../../toll/components/TagInventoryFilterPanel';
import type { ReportCustomerOption, ReportVehicleOption } from '../../../services/api/reportApi';
import {
  EMPTY_TOLL_REPORT_FILTERS,
  TOLL_REPORT_DATE_RANGES,
  EARLIEST_TOLL_REPORT_FROM_DATE,
  buildTollReportDateValue,
  formatTollReportDateLabel,
  getTollReportMaxSelectableDate,
  getTollReportMinToDate,
  parseTollReportDate,
  validateTollReportFilters,
  type TollReportFilters,
} from '../constants/tollReportFilters';

interface AgentOption {
  id: number;
  agentName: string;
}

interface TollReportFilterPanelProps {
  mode: 'vehicle' | 'customer';
  roleKey?: RoleKey;
  draft: TollReportFilters;
  customers: ReportCustomerOption[];
  vehicles: ReportVehicleOption[];
  agents: AgentOption[];
  onChange: (next: TollReportFilters) => void;
  onSearch: () => void;
  onReset: () => void;
}

function SelectField({
  label,
  value,
  onPress,
  inRow,
}: {
  label: string;
  value: string;
  onPress: () => void;
  inRow?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.select, inRow && styles.selectInRow]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={styles.selectLabel}>{label}</Text>
      <Text style={styles.selectValue} numberOfLines={1}>{value}</Text>
    </TouchableOpacity>
  );
}

function PickerModal({
  visible, title, onClose, children,
}: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView>{children}</ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default function TollReportFilterPanel({
  mode,
  roleKey,
  draft,
  customers,
  vehicles,
  agents,
  onChange,
  onSearch,
  onReset,
}: TollReportFilterPanelProps) {
  const [customerOpen, setCustomerOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [fromDateOpen, setFromDateOpen] = useState(false);
  const [toDateOpen, setToDateOpen] = useState(false);
  const [DatePickerComponent, setDatePickerComponent] = useState<React.ComponentType<any> | null>(null);

  const showCustomerFilter = requiresAdminContextPicker(roleKey);
  const showAgentFilter = canShowAgentFilter(roleKey);

  const uniqueCustomers = useMemo(() => {
    const seen = new Set<string>();
    return customers.filter((row) => {
      if (!row.yapEntityId || seen.has(row.yapEntityId)) return false;
      seen.add(row.yapEntityId);
      return true;
    });
  }, [customers]);

  const uniqueVehicles = useMemo(() => {
    const seen = new Set<string>();
    return vehicles.filter((vehicle) => {
      if (!vehicle.vehicleNo || seen.has(vehicle.vehicleNo)) return false;
      seen.add(vehicle.vehicleNo);
      return true;
    });
  }, [vehicles]);

  const [vehicleSearch, setVehicleSearch] = useState('');

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return uniqueVehicles;
    return uniqueVehicles.filter((v) => (v.vehicleNo ?? '').toLowerCase().includes(q));
  }, [uniqueVehicles, vehicleSearch]);

  const customerLabel = uniqueCustomers.find((c) => c.firstName === draft.customerName)
    ? `${uniqueCustomers.find((c) => c.firstName === draft.customerName)?.yapEntityId} - ${draft.customerName}`
    : 'All customers';
  const vehicleLabel = draft.vehicleNo || 'All vehicles';
  const agentLabel = agents.find((a) => String(a.id) === draft.agentId)?.agentName ?? 'All agents';
  const rangeLabel = TOLL_REPORT_DATE_RANGES.find((o) => o.value === draft.dateRange)?.label ?? 'All periods';
  const fromDateLabel = formatTollReportDateLabel(draft.fromDate, 'From date');
  const toDateLabel = formatTollReportDateLabel(draft.toDate, 'To date');

  const minFromDate = dayjs(EARLIEST_TOLL_REPORT_FROM_DATE).toDate();
  const maxDate = getTollReportMaxSelectableDate();
  const minToDate = getTollReportMinToDate(draft.fromDate);

  const ensureDatePicker = () => {
    if (DatePickerComponent) return;
    import('@react-native-community/datetimepicker')
      .then((mod) => setDatePickerComponent(() => mod.default))
      .catch(() => { /* picker unavailable */ });
  };

  const applyCustomDate = (field: 'fromDate' | 'toDate', date: Date) => {
    const nextValue = buildTollReportDateValue(field === 'fromDate' ? 'from' : 'to', date);
    onChange({
      ...draft,
      [field]: nextValue,
      dateRange: '',
      ...(field === 'fromDate' && draft.toDate
        ? (() => {
          const from = dayjs(nextValue);
          const to = dayjs(draft.toDate, ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true);
          return to.isValid() && to.isBefore(from, 'day') ? { toDate: '' } : {};
        })()
        : {}),
    });
  };

  const handleSearch = () => {
    const validationError = validateTollReportFilters(draft);
    if (validationError) {
      Alert.alert('Date range', validationError);
      return;
    }
    onSearch();
  };

  const renderDatePicker = (
    field: 'fromDate' | 'toDate',
    visible: boolean,
    onClose: () => void,
  ) => {
    if (!visible) return null;

    const currentValue = parseTollReportDate(draft[field]);
    const minimumDate = field === 'fromDate' ? minFromDate : minToDate;

    if (Platform.OS === 'android') {
      if (!DatePickerComponent) {
        ensureDatePicker();
        return null;
      }
      return (
        <DatePickerComponent
          value={currentValue}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          maximumDate={maxDate}
          onChange={(_event: any, date?: Date) => {
            onClose();
            if (date) applyCustomDate(field, date);
          }}
        />
      );
    }

    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
          <View style={styles.dateSheet}>
            <Text style={styles.modalTitle}>{field === 'fromDate' ? 'From Date' : 'To Date'}</Text>
            {DatePickerComponent ? (
              <DatePickerComponent
                value={currentValue}
                mode="date"
                display="spinner"
                themeVariant="dark"
                minimumDate={minimumDate}
                maximumDate={maxDate}
                onChange={(_event: any, date?: Date) => {
                  if (date) applyCustomDate(field, date);
                }}
              />
            ) : (
              <Text style={styles.dateLoading}>Loading calendar…</Text>
            )}
            <TouchableOpacity style={styles.searchBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.searchText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <View style={styles.wrap}>
      {showCustomerFilter ? (
        <SelectField label="Customer" value={customerLabel} onPress={() => setCustomerOpen(true)} />
      ) : null}

      {showAgentFilter ? (
        <SelectField label="Agent" value={agentLabel} onPress={() => setAgentOpen(true)} />
      ) : null}

      {mode === 'vehicle' ? (
        <SelectField label="Vehicle No" value={vehicleLabel} onPress={() => setVehicleOpen(true)} />
      ) : null}

      <SelectField label="Date Range" value={rangeLabel} onPress={() => setRangeOpen(true)} />

      <View style={styles.row}>
        <SelectField
          label="From Date"
          value={fromDateLabel}
          onPress={() => { ensureDatePicker(); setFromDateOpen(true); }}
          inRow
        />
        <SelectField
          label="To Date"
          value={toDateLabel}
          onPress={() => { ensureDatePicker(); setToDateOpen(true); }}
          inRow
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} activeOpacity={0.85}>
          <Text style={styles.searchText}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetBtn} onPress={onReset} activeOpacity={0.85}>
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <PickerModal visible={customerOpen} title="Customer" onClose={() => setCustomerOpen(false)}>
        <TouchableOpacity style={styles.modalItem} onPress={() => { onChange({ ...draft, customerName: '' }); setCustomerOpen(false); }}>
          <Text style={styles.modalItemText}>All customers</Text>
        </TouchableOpacity>
        {uniqueCustomers.map((customer) => (
          <TouchableOpacity
            key={customer.yapEntityId}
            style={styles.modalItem}
            onPress={() => { onChange({ ...draft, customerName: customer.firstName }); setCustomerOpen(false); }}
          >
            <Text style={[styles.modalItemText, draft.customerName === customer.firstName && styles.modalItemActive]}>
              {customer.yapEntityId} - {customer.firstName}
            </Text>
          </TouchableOpacity>
        ))}
      </PickerModal>

      {mode === 'vehicle' ? (
        <PickerModal visible={vehicleOpen} title="Vehicle No" onClose={() => setVehicleOpen(false)}>
          <TextInput
            style={[styles.input, { marginBottom: 12 }]}
            placeholder="Search vehicle"
            placeholderTextColor={Colors.text.subtle}
            value={vehicleSearch}
            onChangeText={setVehicleSearch}
            autoCapitalize="characters"
            returnKeyType="done"
          />

          <TouchableOpacity style={styles.modalItem} onPress={() => { onChange({ ...draft, vehicleNo: '' }); setVehicleOpen(false); setVehicleSearch(''); }}>
            <Text style={styles.modalItemText}>All vehicles</Text>
          </TouchableOpacity>
          {filteredVehicles.map((vehicle) => (
            <TouchableOpacity
              key={vehicle.vehicleNo}
              style={styles.modalItem}
              onPress={() => { onChange({ ...draft, vehicleNo: vehicle.vehicleNo }); setVehicleOpen(false); setVehicleSearch(''); }}
            >
              <Text style={[styles.modalItemText, draft.vehicleNo === vehicle.vehicleNo && styles.modalItemActive]}>
                {vehicle.vehicleNo}
              </Text>
            </TouchableOpacity>
          ))}
        </PickerModal>
      ) : null}

      <PickerModal visible={agentOpen} title="Agent" onClose={() => setAgentOpen(false)}>
        <TouchableOpacity style={styles.modalItem} onPress={() => { onChange({ ...draft, agentId: '' }); setAgentOpen(false); }}>
          <Text style={styles.modalItemText}>All agents</Text>
        </TouchableOpacity>
        {agents.map((agent) => (
          <TouchableOpacity
            key={agent.id}
            style={styles.modalItem}
            onPress={() => { onChange({ ...draft, agentId: String(agent.id) }); setAgentOpen(false); }}
          >
            <Text style={[styles.modalItemText, draft.agentId === String(agent.id) && styles.modalItemActive]}>
              {agent.agentName}
            </Text>
          </TouchableOpacity>
        ))}
      </PickerModal>

      <PickerModal visible={rangeOpen} title="Date Range" onClose={() => setRangeOpen(false)}>
        <TouchableOpacity style={styles.modalItem} onPress={() => { onChange({ ...draft, dateRange: '', fromDate: '', toDate: '' }); setRangeOpen(false); }}>
          <Text style={styles.modalItemText}>All periods</Text>
        </TouchableOpacity>
        {TOLL_REPORT_DATE_RANGES.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={styles.modalItem}
            onPress={() => { onChange({ ...draft, dateRange: opt.value, fromDate: '', toDate: '' }); setRangeOpen(false); }}
          >
            <Text style={[styles.modalItemText, draft.dateRange === opt.value && styles.modalItemActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </PickerModal>

      {renderDatePicker('fromDate', fromDateOpen, () => setFromDateOpen(false))}
      {renderDatePicker('toDate', toDateOpen, () => setToDateOpen(false))}
    </View>
  );
}

export { EMPTY_TOLL_REPORT_FILTERS };

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[2], gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  select: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectInRow: { flex: 1 },
  selectLabel: { fontSize: FontSize.xs, color: Colors.text.label, marginBottom: 2 },
  selectValue: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  searchBtn: { flex: 1, backgroundColor: Colors.blue, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' },
  searchText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white },
  resetBtn: { flex: 1, backgroundColor: Colors.glass.bg, borderWidth: 1, borderColor: Colors.glass.border, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' },
  resetText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text.secondary },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { maxHeight: '60%', backgroundColor: Colors.navy, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing[4] },
  dateSheet: {
    backgroundColor: Colors.navy,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing[4],
    paddingBottom: Spacing[6],
  },
  dateLoading: { fontSize: FontSize.sm, color: Colors.text.secondary, textAlign: 'center', paddingVertical: Spacing[4] },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white, marginBottom: Spacing[3] },
  modalItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  modalItemText: { fontSize: FontSize.base, color: Colors.text.secondary },
  modalItemActive: { color: Colors.infoLight, fontWeight: '700' },
});
