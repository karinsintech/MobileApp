/**
 * Customer scope picker for multi-customer roles (ADMIN, CUSTOMER_GROUP_ADMIN,
 * EMPLOYEE, AGENT). Loads /customer/dropdown and writes the chosen customer
 * into Redux so every fleet screen scopes API calls consistently.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { useAppDispatch, useAppSelector, store } from '../../../store';
import { applyRefreshedSession, setDashboardContext } from '../../../store/slices/authSlice';
import { dashboardApi } from '../../../services/api/dashboardApi';
import { switchActiveCustomer } from '../../../services/auth/customerSwitch';
import { Cache } from '../../../services/storage/SecureStorage';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { DASHBOARD_LIGHT_WHITE } from '../dashboardTypography';
import type { DashboardContext } from '../../../types/auth';
import {
  normalizeCustomers,
  formatCustomerLabel,
  filterAssociatedCustomers,
  resolveDefaultCustomerOption,
  isCustomerGroupAdminLabel,
  type CustomerOption,
} from './customerContextUtils';
const CONTEXT_CACHE_KEY = 'dashboard_context';
const CUSTOMERS_CACHE_KEY = 'associated_customers';
const CUSTOMERS_CACHE_TTL_MS = 60 * 60 * 1000;

interface CustomersCacheEntry {
  list: CustomerOption[];
  fetchedAt: number;
}

interface CustomerContextDropdownProps {
  /** Called after the operator picks a customer so parent screens can refetch. */
  onContextChange?: () => void;
  /**
   * `inline` sits under the Fleet Health title with a lighter chrome;
   * `default` is the standalone glass trigger used elsewhere.
   */
  variant?: 'default' | 'inline';
}

export default function CustomerContextDropdown({
  onContextChange,
  variant = 'default',
}: CustomerContextDropdownProps) {
  const dispatch = useAppDispatch();
  const { dashboardContext, user } = useAppSelector((s) => s.auth);

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Keep the parent callback in a ref so it never enters effect/callback deps —
  // the dashboard passes a fresh inline function each render, and depending on it
  // was retriggering the customer fetch on every render (hammering the DB).
  const onContextChangeRef = useRef(onContextChange);
  useEffect(() => { onContextChangeRef.current = onContextChange; });

  // Guards the one-time load against React re-invocations / StrictMode double-mount.
  const didInitRef = useRef(false);

  // Mobile flow: set-default-user-id → local session patch (no cookie refresh).
  // Redux updates only after set-default succeeds so screens refetch the right data.
  const activateCustomer = useCallback(async (
    customer: CustomerOption,
    notifyParent: boolean,
    forceServerSync = false,
  ): Promise<boolean> => {
    const currentId = store.getState().auth.dashboardContext?.customerId;
    const alreadySelected = currentId === customer.customerId;
    if (alreadySelected && !forceServerSync) return true;

    setSwitching(true);
    try {
      const session = await switchActiveCustomer(customer.customerId);
      dispatch(applyRefreshedSession(session));
      // Local/session payloads keep the group-admin account name — label the
      // picker with the selected customer's display name instead.
      const scopedCustomerId = session.defaultCustomerId ?? customer.customerId;
      const label = customer.customerName || session.customerName;
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
      if (notifyParent && !alreadySelected) onContextChangeRef.current?.();
      return true;
    } catch (err: any) {
      const status = err?.status != null ? String(err.status) : '';
      const message = err?.message ?? 'Request failed';
      Alert.alert(
        'Could not switch customer',
        [status, message].filter(Boolean).join(' ').trim(),
      );
      return false;
    } finally {
      setSwitching(false);
    }
  }, [dispatch]);

  // Restore cached/default scope. Only hit the network when Redux/session is
  // missing or differs — force-syncing every mount made the picker laggy for CGA.
  const restoreContext = useCallback(async (list: CustomerOption[]): Promise<void> => {
    const scopedList = filterAssociatedCustomers(list, { excludeUserId: user?.userId });
    const cached = Cache.getJSON<DashboardContext>(CONTEXT_CACHE_KEY);
    const target = resolveDefaultCustomerOption(
      scopedList,
      user?.defaultCustomerId,
      cached?.customerId,
    );
    if (!target) return;

    const currentId =
      store.getState().auth.dashboardContext?.customerId
      ?? user?.defaultCustomerId
      ?? null;
    if (currentId === target.customerId) {
      // Already scoped — refresh the label locally without set-default / spinner.
      const label = target.customerName;
      dispatch(setDashboardContext({
        customerId: target.customerId,
        scopeType: 'CUSTOMER',
        label,
      }));
      Cache.setJSON(CONTEXT_CACHE_KEY, {
        customerId: target.customerId,
        scopeType: 'CUSTOMER',
        label,
      });
      return;
    }

    await activateCustomer(target, false, false);
  }, [activateCustomer, dispatch, user?.defaultCustomerId, user?.userId]);

  const applyCustomerList = useCallback((rawList: CustomerOption[]) => {
    const scopedList = filterAssociatedCustomers(rawList, { excludeUserId: user?.userId });
    setCustomers(scopedList);
    return scopedList;
  }, [user?.userId]);

  useEffect(() => {
    // Fetch the customer list exactly once per mount lifecycle.
    if (didInitRef.current) return;
    didInitRef.current = true;

    // Seed instantly from the cached list so there is no spinner or refetch on
    // remount. If the cache is still within its TTL, skip the network entirely.
    const cachedList = Cache.getJSON<CustomersCacheEntry>(CUSTOMERS_CACHE_KEY);
    if (cachedList?.list?.length) {
      const scopedList = applyCustomerList(cachedList.list);
      restoreContext(scopedList).catch(() => undefined);
      setLoading(false);
      if (Date.now() - cachedList.fetchedAt < CUSTOMERS_CACHE_TTL_MS) return;
    }

    // Cache miss or stale — refresh from the backend and re-cache with a stamp.
    (async () => {
      try {
        const { data } = await dashboardApi.getCustomerList();
        const scopedList = applyCustomerList(normalizeCustomers(data));
        Cache.setJSON<CustomersCacheEntry>(CUSTOMERS_CACHE_KEY, {
          list: scopedList,
          fetchedAt: Date.now(),
        });
        await restoreContext(scopedList);
      } catch {
        // Preserve any cached list already shown; only clear when we had nothing.
        if (!cachedList?.list?.length) setCustomers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [applyCustomerList, restoreContext]);

  const visibleCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((c) => c.customerName.toLowerCase().includes(term));
  }, [customers, search]);

  const selectedLabel = useMemo(() => {
    const contextLabel = dashboardContext?.label?.trim();
    if (contextLabel && !isCustomerGroupAdminLabel(contextLabel)) {
      return contextLabel;
    }
    const activeId = dashboardContext?.customerId ?? user?.defaultCustomerId;
    if (activeId != null) {
      const match = customers.find((c) => c.customerId === activeId);
      if (match) return formatCustomerLabel(match);
    }
    return 'Select customer';
  }, [customers, dashboardContext?.customerId, dashboardContext?.label, user?.defaultCustomerId]);

  const isInline = variant === 'inline';
  const triggerStyle = isInline ? styles.triggerInline : styles.trigger;
  const labelStyle = isInline ? styles.triggerTextInline : styles.triggerText;
  const mutedStyle = isInline ? styles.triggerTextMutedInline : styles.triggerTextMuted;
  const chevronStyle = isInline ? styles.chevronInline : styles.chevron;

  if (loading) {
    return (
      <View style={triggerStyle}>
        <ActivityIndicator size="small" color={Colors.infoLight} />
        <Text style={mutedStyle}>Loading customers…</Text>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={triggerStyle}
        onPress={() => !switching && setOpen(true)}
        activeOpacity={0.8}
        accessibilityLabel="Select customer"
        disabled={switching}
      >
        {switching ? (
          <ActivityIndicator size="small" color={Colors.infoLight} />
        ) : (
          <>
            <Text style={labelStyle} numberOfLines={1} ellipsizeMode="tail">{selectedLabel}</Text>
            <Text style={chevronStyle}>▾</Text>
          </>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Select Customer</Text>

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
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No customers found</Text>
              }
              renderItem={({ item }) => {
                const isSelected = dashboardContext?.customerId === item.customerId;
                return (
                  <TouchableOpacity
                    style={[styles.option, isSelected && styles.optionSelected]}
                    onPress={() => {
                      // Close immediately so the sheet never waits on set-default;
                      // the trigger shows a spinner while activateCustomer runs.
                      setOpen(false);
                      setSearch('');
                      if (isSelected) return;
                      void activateCustomer(item, true);
                    }}
                    activeOpacity={0.8}
                    disabled={switching}
                  >
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]} numberOfLines={2}>
                      {formatCustomerLabel(item)}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function loadCachedDashboardContext(): DashboardContext | null {
  return Cache.getJSON<DashboardContext>(CONTEXT_CACHE_KEY);
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 6,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  // Top-bar picker stays capped so notification/profile remain visible on the right.
  triggerInline: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 180,
    overflow: 'hidden',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  triggerText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.white,
    flexShrink: 1,
  },
  triggerTextInline: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text.secondary,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  triggerTextMuted: {
    fontSize: FontSize.sm,
    color: DASHBOARD_LIGHT_WHITE,
  },
  triggerTextMutedInline: {
    fontSize: FontSize.sm,
    color: Colors.text.muted,
  },
  chevron: {
    fontSize: FontSize.sm,
    color: Colors.infoLight,
    marginTop: 1,
  },
  chevronInline: {
    fontSize: FontSize.sm,
    color: Colors.infoLight,
    marginTop: 1,
    flexShrink: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 11, 31, 0.72)',
    justifyContent: 'flex-start',
    paddingTop: 110,
    paddingHorizontal: Spacing[4],
  },
  sheet: {
    backgroundColor: Colors.bg.d2,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    maxHeight: '70%',
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: Spacing[3],
  },
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
  list: {
    flexGrow: 0,
  },
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
});
