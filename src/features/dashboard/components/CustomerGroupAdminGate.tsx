/**
 * Blocks CUSTOMER_GROUP_ADMIN until they pick an associated customer — mirrors
 * the web MainLayout modal shown when defaultCustomerId is missing after login.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useAppDispatch, useAppSelector } from '../../../store';
import { applyRefreshedSession, setDashboardContext, signOut } from '../../../store/slices/authSlice';
import { dashboardApi } from '../../../services/api/dashboardApi';
import { switchActiveCustomer } from '../../../services/auth/customerSwitch';
import { Cache } from '../../../services/storage/SecureStorage';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { DASHBOARD_LIGHT_WHITE } from '../dashboardTypography';
import {
  isCustomerGroupAdmin,
  resolveActiveCustomerId,
} from '../../../types/auth';
import {
  normalizeCustomers,
  filterAssociatedCustomers,
  type CustomerOption,
} from './customerContextUtils';

const CONTEXT_CACHE_KEY = 'dashboard_context';

export default function CustomerGroupAdminGate() {
  const dispatch = useAppDispatch();
  const { user, dashboardContext } = useAppSelector((s) => s.auth);

  const activeCustomerId = resolveActiveCustomerId(
    dashboardContext,
    user?.defaultCustomerId,
  );
  const shouldGate =
    isCustomerGroupAdmin(user?.roleKey) && activeCustomerId == null;

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!shouldGate) return;
    setLoading(true);
    dashboardApi
      .getCustomerList()
      .then(({ data }) => {
        setCustomers(
          filterAssociatedCustomers(normalizeCustomers(data), {
            excludeUserId: user?.userId,
          }),
        );
      })
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, [shouldGate, user?.userId]);

  const handleSubmit = useCallback(async () => {
    if (selectedId == null) return;
    const match = customers.find((c) => c.customerId === selectedId);
    if (!match) return;

    setSubmitting(true);
    try {
      const session = await switchActiveCustomer(selectedId);
      dispatch(applyRefreshedSession(session));
      // refreshToken returns the group-admin's own name; label with the picked
      // customer so the dashboard reflects the selected customer, not the BDM.
      const scopedCustomerId = session.defaultCustomerId ?? selectedId;
      const label = match.customerName || session.customerName;
      dispatch(setDashboardContext({
        customerId: scopedCustomerId,
        scopeType: 'CUSTOMER',
        label,
      }));
      Cache.setJSON(CONTEXT_CACHE_KEY, {
        customerId: scopedCustomerId,
        scopeType: 'CUSTOMER',
        label,
      });
    } catch (err: any) {
      const status = err?.status != null ? String(err.status) : '';
      const message = err?.message ?? 'Request failed';
      Alert.alert(
        'Could not select customer',
        [status, message].filter(Boolean).join(' ').trim(),
      );
    } finally {
      setSubmitting(false);
    }
  }, [customers, dispatch, selectedId]);

  const handleCancel = useCallback(() => {
    // Web logs out when the operator dismisses without choosing a customer.
    dispatch(signOut());
  }, [dispatch]);

  const visibleCustomers = customers.filter((c) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    const label = `${c.customerName} ${c.mobileNumber ?? ''}`.toLowerCase();
    return label.includes(term);
  });

  if (!shouldGate) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleCancel}>
      <Pressable style={styles.backdrop}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Select a Customer to Continue</Text>
          <Text style={styles.subtitle}>
            Choose which customer fleet you want to manage. All data will scope to this customer.
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color={Colors.infoLight} style={styles.loader} />
          ) : (
            <>
              <TextInput
                style={styles.searchInput}
                placeholder="Search customer…"
                placeholderTextColor={DASHBOARD_LIGHT_WHITE}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
              <FlatList
                data={visibleCustomers}
                keyExtractor={(item) => String(item.customerId)}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No customers found</Text>
                }
                renderItem={({ item }) => {
                  const isSelected = selectedId === item.customerId;
                  const label = item.mobileNumber
                    ? `${item.customerName || 'No Name'}-${item.mobileNumber}`
                    : item.customerName;
                  return (
                    <TouchableOpacity
                      style={[styles.option, isSelected && styles.optionSelected]}
                      onPress={() => setSelectedId(item.customerId)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[styles.optionText, isSelected && styles.optionTextSelected]}
                        numberOfLines={2}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={submitting}>
              <Text style={styles.cancelText}>Sign Out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, (selectedId == null || submitting) && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={selectedId == null || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.navy} />
              ) : (
                <Text style={styles.submitText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 11, 31, 0.88)',
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
  },
  sheet: {
    backgroundColor: Colors.bg.d2,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    maxHeight: '80%',
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: DASHBOARD_LIGHT_WHITE,
    lineHeight: 20,
    marginBottom: Spacing[3],
  },
  loader: { paddingVertical: Spacing[6] },
  searchInput: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSize.base,
    color: Colors.white,
    marginBottom: Spacing[3],
  },
  list: { flexGrow: 0, maxHeight: 280, marginBottom: Spacing[3] },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    marginBottom: 4,
  },
  optionSelected: {
    backgroundColor: Colors.infoBg,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
  },
  optionText: {
    fontSize: FontSize.base,
    color: DASHBOARD_LIGHT_WHITE,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: Colors.infoLight,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: DASHBOARD_LIGHT_WHITE,
    textAlign: 'center',
    paddingVertical: Spacing[4],
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing[3],
    marginTop: Spacing[2],
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  cancelText: { color: DASHBOARD_LIGHT_WHITE, fontWeight: '600' },
  submitBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.yellow,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: Colors.navy, fontWeight: '800' },
});
