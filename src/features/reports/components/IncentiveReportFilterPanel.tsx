/**
 * Incentive report filters for mobile roles — month range, year, status, receipt no.
 * No customer picker: CUSTOMER / CGA / VGA are scoped by session (web parity).
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView,
} from 'react-native';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import {
  CUSTOMER_INCENTIVE_STATUS_OPTIONS,
  INCENTIVE_MONTH_RANGE_OPTIONS,
  type IncentiveReportFilters,
} from '../constants/incentiveReportFilters';

interface IncentiveReportFilterPanelProps {
  draft: IncentiveReportFilters;
  onChange: (next: IncentiveReportFilters) => void;
  onSearch: () => void;
  onReset: () => void;
}

function SelectField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.select} onPress={onPress} activeOpacity={0.85}>
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

export default function IncentiveReportFilterPanel({
  draft,
  onChange,
  onSearch,
  onReset,
}: IncentiveReportFilterPanelProps) {
  const [monthOpen, setMonthOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const monthLabel = INCENTIVE_MONTH_RANGE_OPTIONS.find((o) => o.value === draft.monthRange)?.label ?? 'All quarters';
  const statusLabel = CUSTOMER_INCENTIVE_STATUS_OPTIONS.find((o) => o.value === draft.status)?.label ?? 'All status';

  return (
    <View style={styles.wrap}>
      <SelectField label="Month Range" value={monthLabel} onPress={() => setMonthOpen(true)} />

      <TextInput
        style={styles.input}
        placeholder="Year (e.g. 2025)"
        placeholderTextColor={Colors.text.subtle}
        value={draft.year}
        onChangeText={(year) => onChange({ ...draft, year })}
        keyboardType="number-pad"
        returnKeyType="search"
        onSubmitEditing={onSearch}
      />

      <SelectField label="Status" value={statusLabel} onPress={() => setStatusOpen(true)} />

      {/* Partial match on FY or serial — same receiptNo query as web header */}
      <TextInput
        style={styles.input}
        placeholder="Receipt No"
        placeholderTextColor={Colors.text.subtle}
        value={draft.receiptNo}
        onChangeText={(receiptNo) => onChange({ ...draft, receiptNo })}
        autoCapitalize="characters"
        returnKeyType="search"
        onSubmitEditing={onSearch}
      />

      <View style={styles.actions}>
        <TouchableOpacity style={styles.searchBtn} onPress={onSearch} activeOpacity={0.85}>
          <Text style={styles.searchText}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetBtn} onPress={onReset} activeOpacity={0.85}>
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <PickerModal visible={monthOpen} title="Month Range" onClose={() => setMonthOpen(false)}>
        <TouchableOpacity style={styles.modalItem} onPress={() => { onChange({ ...draft, monthRange: '' }); setMonthOpen(false); }}>
          <Text style={styles.modalItemText}>All quarters</Text>
        </TouchableOpacity>
        {INCENTIVE_MONTH_RANGE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={styles.modalItem}
            onPress={() => { onChange({ ...draft, monthRange: opt.value }); setMonthOpen(false); }}
          >
            <Text style={[styles.modalItemText, draft.monthRange === opt.value && styles.modalItemActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </PickerModal>

      <PickerModal visible={statusOpen} title="Status" onClose={() => setStatusOpen(false)}>
        <TouchableOpacity style={styles.modalItem} onPress={() => { onChange({ ...draft, status: '' }); setStatusOpen(false); }}>
          <Text style={styles.modalItemText}>All status</Text>
        </TouchableOpacity>
        {CUSTOMER_INCENTIVE_STATUS_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={styles.modalItem}
            onPress={() => { onChange({ ...draft, status: opt.value }); setStatusOpen(false); }}
          >
            <Text style={[styles.modalItemText, draft.status === opt.value && styles.modalItemActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </PickerModal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[2], gap: 8 },
  input: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
  select: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectLabel: { fontSize: FontSize.xs, color: Colors.text.label, marginBottom: 2 },
  selectValue: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  searchBtn: { flex: 1, backgroundColor: Colors.blue, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' },
  searchText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white },
  resetBtn: { flex: 1, backgroundColor: Colors.glass.bg, borderWidth: 1, borderColor: Colors.glass.border, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' },
  resetText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text.secondary },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { maxHeight: '60%', backgroundColor: Colors.navy, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing[4] },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white, marginBottom: Spacing[3] },
  modalItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  modalItemText: { fontSize: FontSize.base, color: Colors.text.secondary },
  modalItemActive: { color: Colors.infoLight, fontWeight: '700' },
});
