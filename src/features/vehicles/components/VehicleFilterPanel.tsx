/**
 * Fleet vehicle filters — mirrors web VehicleHeader (customer, agent, vehicle no,
 * class, tag ID, group, ON/OFF status, YAP vehicle status). Search submits the
 * same query keys to the backend; no client-side rematch.
 *
 * Vehicle No defaults to All vehicles so customers can list/PDF the full fleet.
 * Toll transaction PDFs still require a VRN (volume), not this screen.
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView,
  Keyboard, Platform, Animated, Dimensions, type KeyboardEvent,
} from 'react-native';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { requiresAdminContextPicker, isVehicleGroupAdmin, type RoleKey } from '../../../types/auth';
import { canShowAgentFilter } from '../../toll/components/TagInventoryFilterPanel';
import {
  EMPTY_VEHICLE_FILTERS,
  VEHICLE_ON_OFF_OPTIONS,
  CUSTOMER_VEHICLE_STATUS_ALLOWLIST,
  type VehicleFilters,
  type CustomerFilterOption,
  type AgentFilterOption,
  type VehicleGroupOption,
  type VehicleNoOption,
} from '../constants/vehicleFilters';

interface VehicleFilterPanelProps {
  roleKey?: RoleKey;
  draft: VehicleFilters;
  agentId: string;
  customers: CustomerFilterOption[];
  agents: AgentFilterOption[];
  groupOptions: VehicleGroupOption[];
  vehicles?: VehicleNoOption[];
  vehicleStatusOptions: string[];
  onChange: (next: VehicleFilters) => void;
  onAgentChange: (agentId: string) => void;
  onSearch: () => void;
  onReset: () => void;
}

function SelectField({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.select} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.selectLabel}>{label}</Text>
      <Text style={styles.selectValue} numberOfLines={1}>{value}</Text>
    </TouchableOpacity>
  );
}

/**
 * Bottom sheet picker that stays usable while the soft keyboard is open.
 * Caps sheet height to the visible area and animates lift so search + list
 * remain on-screen across devices (Modal often ignores activity adjustResize).
 */
function PickerModal({
  visible,
  title,
  onClose,
  header,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Sticky content (e.g. search) kept above the scrollable options. */
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const windowHeightOnOpen = useRef(Dimensions.get('window').height);
  const windowHeight = Dimensions.get('window').height;

  useEffect(() => {
    if (!visible) {
      keyboardOffset.setValue(0);
      setKeyboardHeight(0);
      return undefined;
    }

    // Baseline before keyboard — used to detect Android windows that already resized.
    windowHeightOnOpen.current = Dimensions.get('window').height;

    const animateTo = (toValue: number, event?: KeyboardEvent) => {
      setKeyboardHeight(toValue);
      Animated.timing(keyboardOffset, {
        toValue,
        // Match OS keyboard timing when available for a smoother handoff.
        duration: event?.duration && event.duration > 0 ? event.duration : 250,
        useNativeDriver: false,
      }).start();
    };

    const handleKeyboardShow = (event: KeyboardEvent) => {
      const reportedHeight = event?.endCoordinates?.height ?? 0;
      const currentWindowHeight = Dimensions.get('window').height;
      // Some Android builds resize the modal window; lifting by full keyboard height
      // would push the sheet off-screen — only lift the uncovered remainder.
      const alreadyAbsorbed = Math.max(0, windowHeightOnOpen.current - currentWindowHeight);
      const lift = Math.max(0, reportedHeight - alreadyAbsorbed);
      animateTo(lift, event);
    };
    const handleKeyboardHide = (event: KeyboardEvent) => {
      animateTo(0, event);
    };

    // will* fires earlier on iOS so the sheet tracks the keyboard; did* is reliable on Android.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSub = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible, keyboardOffset]);

  // Available sheet height above the keyboard (or default ~72% when closed).
  const sheetMaxHeight = keyboardHeight > 0
    ? Math.max(windowHeight - keyboardHeight - 24, windowHeight * 0.35)
    : windowHeight * 0.72;

  // Title + optional search chrome — list gets an explicit maxHeight so it never
  // collapses to 0 (flex:1 inside a maxHeight-only parent hides all options).
  const chromeHeight = header ? 132 : 72;
  const listMaxHeight = Math.max(sheetMaxHeight - chromeHeight, 140);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity
          style={styles.modalBackdropTouch}
          activeOpacity={1}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
        />
        <Animated.View
          style={[
            styles.modalSheet,
            {
              maxHeight: sheetMaxHeight,
              marginBottom: keyboardOffset,
            },
          ]}
        >
          <Text style={styles.modalTitle}>{title}</Text>
          {header ? <View style={styles.modalHeader}>{header}</View> : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            contentContainerStyle={styles.modalContent}
            style={{ maxHeight: listMaxHeight }}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function VehicleFilterPanel({
  roleKey,
  draft,
  agentId,
  customers,
  agents,
  groupOptions,
  vehicles = [],
  vehicleStatusOptions,
  onChange,
  onAgentChange,
  onSearch,
  onReset,
}: VehicleFilterPanelProps) {
  const [customerOpen, setCustomerOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [vehicleStatusOpen, setVehicleStatusOpen] = useState(false);

  const showCustomerFilter = requiresAdminContextPicker(roleKey);
  const showAgentFilter = canShowAgentFilter(roleKey);

  const yapStatusOptions = useMemo(() => {
    const restrict = roleKey === 'CUSTOMER' || isVehicleGroupAdmin(roleKey);
    if (!restrict) return vehicleStatusOptions;
    return vehicleStatusOptions.filter((s) =>
      (CUSTOMER_VEHICLE_STATUS_ALLOWLIST as readonly string[]).includes(s),
    );
  }, [roleKey, vehicleStatusOptions]);

  const uniqueVehicles = useMemo(() => {
    const seen = new Set<string>();
    return vehicles.filter((vehicle) => {
      // Deduplicate VRNs so the picker can default to All vehicles.
      if (!vehicle.vehicleNo || seen.has(vehicle.vehicleNo)) return false;
      seen.add(vehicle.vehicleNo);
      return true;
    });
  }, [vehicles]);

  // Search term for vehicle picker
  const [vehicleSearch, setVehicleSearch] = useState('');

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return uniqueVehicles;
    return uniqueVehicles.filter((v) => (v.vehicleNo ?? '').toLowerCase().includes(q));
  }, [uniqueVehicles, vehicleSearch]);

  const customerLabel = customers.find((c) => c.yapEntityId === draft.customerId)
    ? `${draft.customerId} - ${customers.find((c) => c.yapEntityId === draft.customerId)?.firstName ?? ''}`
    : 'All customers';

  const agentLabel = agents.find((a) => String(a.id) === agentId)?.agentName ?? 'All agents';
  const vehicleLabel = draft.vehicleNo || 'All vehicles';
  const groupLabel = draft.group || 'All groups';
  const onOffLabel = VEHICLE_ON_OFF_OPTIONS.find((o) => o.value === draft.status)?.label ?? 'All';
  const yapLabel = draft.vehicleStatus || 'All status';

  return (
    <View style={styles.wrap}>
      {showCustomerFilter ? (
        <SelectField label="Customer" value={customerLabel} onPress={() => setCustomerOpen(true)} />
      ) : null}

      {showAgentFilter ? (
        <SelectField label="Agent" value={agentLabel} onPress={() => setAgentOpen(true)} />
      ) : null}

      <View style={styles.row}>
        {uniqueVehicles.length > 0 ? (
          <SelectField label="Vehicle No" value={vehicleLabel} onPress={() => setVehicleOpen(true)} />
        ) : (
          <TextInput
            style={styles.input}
            placeholder="All vehicles"
            placeholderTextColor={Colors.text.subtle}
            value={draft.vehicleNo}
            onChangeText={(vehicleNo) => onChange({ ...draft, vehicleNo })}
            autoCapitalize="characters"
            returnKeyType="search"
            onSubmitEditing={onSearch}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Vehicle Class"
          placeholderTextColor={Colors.text.subtle}
          value={draft.vehicleClass}
          onChangeText={(vehicleClass) => onChange({ ...draft, vehicleClass })}
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
      </View>

      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="Tag ID"
          placeholderTextColor={Colors.text.subtle}
          value={draft.tagId}
          onChangeText={(tagId) => onChange({ ...draft, tagId })}
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
        <SelectField label="Group" value={groupLabel} onPress={() => setGroupOpen(true)} />
      </View>

      <View style={styles.row}>
        <SelectField label="Status" value={onOffLabel} onPress={() => setStatusOpen(true)} />
        <SelectField label="Vehicle Status" value={yapLabel} onPress={() => setVehicleStatusOpen(true)} />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.searchBtn} onPress={onSearch} activeOpacity={0.85}>
          <Text style={styles.searchText}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetBtn} onPress={onReset} activeOpacity={0.85}>
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <PickerModal
        visible={vehicleOpen}
        title="Vehicle No"
        onClose={() => { setVehicleOpen(false); setVehicleSearch(''); }}
        header={(
          <TextInput
            style={styles.searchInput}
            placeholder="Search vehicle"
            placeholderTextColor={Colors.text.subtle}
            value={vehicleSearch}
            onChangeText={setVehicleSearch}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            // Keep focus stable while the sheet animates above the keyboard.
            blurOnSubmit={false}
          />
        )}
      >
        <TouchableOpacity
          style={styles.modalItem}
          onPress={() => { onChange({ ...draft, vehicleNo: '' }); setVehicleOpen(false); setVehicleSearch(''); }}
        >
          <Text style={styles.modalItemText}>All vehicles</Text>
        </TouchableOpacity>
        {filteredVehicles.map((vehicle) => (
          <TouchableOpacity
            key={vehicle.vehicleNo}
            style={styles.modalItem}
            onPress={() => {
              onChange({ ...draft, vehicleNo: vehicle.vehicleNo });
              setVehicleOpen(false);
              setVehicleSearch('');
            }}
          >
            <Text style={[styles.modalItemText, draft.vehicleNo === vehicle.vehicleNo && styles.modalItemActive]}>
              {vehicle.vehicleNo}
            </Text>
          </TouchableOpacity>
        ))}
      </PickerModal>

      <PickerModal visible={customerOpen} title="Customer" onClose={() => setCustomerOpen(false)}>
        <TouchableOpacity
          style={styles.modalItem}
          onPress={() => { onChange({ ...draft, customerId: '' }); setCustomerOpen(false); }}
        >
          <Text style={styles.modalItemText}>All customers</Text>
        </TouchableOpacity>
        {customers.map((customer) => (
          <TouchableOpacity
            key={customer.yapEntityId}
            style={styles.modalItem}
            onPress={() => {
              onChange({ ...draft, customerId: customer.yapEntityId });
              setCustomerOpen(false);
            }}
          >
            <Text style={[styles.modalItemText, draft.customerId === customer.yapEntityId && styles.modalItemActive]}>
              {customer.yapEntityId} - {customer.firstName}
            </Text>
          </TouchableOpacity>
        ))}
      </PickerModal>

      <PickerModal visible={agentOpen} title="Agent" onClose={() => setAgentOpen(false)}>
        <TouchableOpacity
          style={styles.modalItem}
          onPress={() => { onAgentChange(''); setAgentOpen(false); }}
        >
          <Text style={styles.modalItemText}>All agents</Text>
        </TouchableOpacity>
        {agents.map((agent) => (
          <TouchableOpacity
            key={agent.id}
            style={styles.modalItem}
            onPress={() => { onAgentChange(String(agent.id)); setAgentOpen(false); }}
          >
            <Text style={[styles.modalItemText, agentId === String(agent.id) && styles.modalItemActive]}>
              {agent.agentName}
            </Text>
          </TouchableOpacity>
        ))}
      </PickerModal>

      <PickerModal visible={groupOpen} title="Group" onClose={() => setGroupOpen(false)}>
        <TouchableOpacity
          style={styles.modalItem}
          onPress={() => { onChange({ ...draft, group: '' }); setGroupOpen(false); }}
        >
          <Text style={styles.modalItemText}>All groups</Text>
        </TouchableOpacity>
        {groupOptions.map((group) => (
          <TouchableOpacity
            key={group.id || group.title}
            style={styles.modalItem}
            onPress={() => {
              // Store title — list rows expose vehicleGroupName, not group id.
              onChange({ ...draft, group: group.title });
              setGroupOpen(false);
            }}
          >
            <Text style={[styles.modalItemText, draft.group === group.title && styles.modalItemActive]}>
              {group.title}
            </Text>
          </TouchableOpacity>
        ))}
      </PickerModal>

      <PickerModal visible={statusOpen} title="Status" onClose={() => setStatusOpen(false)}>
        <TouchableOpacity
          style={styles.modalItem}
          onPress={() => { onChange({ ...draft, status: '' }); setStatusOpen(false); }}
        >
          <Text style={styles.modalItemText}>All</Text>
        </TouchableOpacity>
        {VEHICLE_ON_OFF_OPTIONS.map((opt) => (
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

      <PickerModal visible={vehicleStatusOpen} title="Vehicle Status" onClose={() => setVehicleStatusOpen(false)}>
        <TouchableOpacity
          style={styles.modalItem}
          onPress={() => { onChange({ ...draft, vehicleStatus: '' }); setVehicleStatusOpen(false); }}
        >
          <Text style={styles.modalItemText}>All status</Text>
        </TouchableOpacity>
        {yapStatusOptions.map((status) => (
          <TouchableOpacity
            key={status}
            style={styles.modalItem}
            onPress={() => { onChange({ ...draft, vehicleStatus: status }); setVehicleStatusOpen(false); }}
          >
            <Text style={[styles.modalItemText, draft.vehicleStatus === status && styles.modalItemActive]}>
              {status}
            </Text>
          </TouchableOpacity>
        ))}
      </PickerModal>
    </View>
  );
}

export { EMPTY_VEHICLE_FILTERS };

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[2], gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
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
    flex: 1,
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
  searchBtn: {
    flex: 1,
    backgroundColor: Colors.blue,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  searchText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white },
  resetBtn: {
    flex: 1,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  resetText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text.secondary },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalBackdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalSheet: {
    backgroundColor: Colors.navy,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing[4],
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
    zIndex: 1,
  },
  modalHeader: {
    marginBottom: Spacing[2],
  },
  searchInput: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
  modalContent: {
    paddingBottom: Spacing[2],
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white, marginBottom: Spacing[3] },
  modalItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  modalItemText: { fontSize: FontSize.base, color: Colors.text.secondary },
  modalItemActive: { color: Colors.infoLight, fontWeight: '700' },
});
