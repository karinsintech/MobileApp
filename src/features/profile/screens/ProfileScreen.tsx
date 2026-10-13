/**
 * Profile screen — for CUSTOMER (and CGA with Fastag) uses the same tab set as
 * web UserProfile: My Profile, Fastag, Vahan, eChallan, Sarathi. Existing mobile
 * sections are placed into those tabs; nothing is added or removed.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../../store';
import { signOut } from '../../../store/slices/authSlice';
import { SecureStorage, Cache } from '../../../services/storage/SecureStorage';
import {
  disablePinLogin,
  enablePinLogin,
  fetchPinStatus,
} from '../../../services/auth/pinAuthService';
import { hasAppLockPin } from '../../../services/auth/appLockPinService';
import { profileApi } from '../../../services/api/profileApi';
import { walletApi } from '../../../services/api/walletApi';
import { LiquidBackground, GlassCard, ScreenHeader } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import DeviceInfo from 'react-native-device-info';
import {
  canShowCustomerBankInfo,
  isAdminOrEmployee,
  isAgentRole,
  isCustomer,
  isCustomerGroupAdmin,
  resolveActiveCustomerId,
} from '../../../types/auth';
import type { MoreStackParamList } from '../../../navigation/types';
import {
  mapCustomerProfileRow,
  hasWalletValues,
  type CustomerProfileView,
} from '../utils/mapCustomerProfile';
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '../../../services/notifications/notificationPreferences';
import { resolveWalletAlertThreshold } from '../../../services/notifications/walletAlertUtils';
import { hydrateWalletAlertThresholdFromApi } from '../../../services/notifications/walletAlertPreferences';
import { formatINR } from '../../../utils/format';
import { maskBankAccount, redactRedPii } from '../../../utils/piiProtection';
import type { DashboardSummary } from '../../../types/dashboard';
import {
  AdminWalletSection,
  AgentWalletSection,
  CustomerWalletSections,
} from '../components/BankWalletSection';
import { UpiVpaSection } from '../components/UpiVpaSection';
import { FastagDetailsSections } from '../components/FastagDetailsSections';
import ProfileTabBar, {
  type ProfileTabItem,
  type ProfileTabKey,
} from '../components/ProfileTabBar';
import ServiceEnrollmentStatus, {
  type EnrollmentStatus,
} from '../components/ServiceEnrollmentStatus';

interface SettingRowProps {
  icon: string;
  label: string;
  value?: string;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  danger?: boolean;
  /** When true, long values wrap onto the next line under the label. */
  wrapValue?: boolean;
}

function SettingRow({
  icon,
  label,
  value,
  toggle,
  toggleValue,
  onToggle,
  onPress,
  danger,
  wrapValue,
}: SettingRowProps) {
  return (
    <TouchableOpacity
      style={[styles.settingRow, wrapValue && styles.settingRowTop]}
      onPress={onPress}
      disabled={!onPress && !toggle}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, danger && styles.settingIconDanger]}>
          <Text style={styles.settingIconText}>{icon}</Text>
        </View>
        <Text style={[styles.settingLabel, danger && { color: Colors.dangerLight }]}>{label}</Text>
      </View>
      {toggle ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ false: Colors.glass.bg, true: Colors.success }}
          thumbColor={Colors.white}
        />
      ) : value ? (
        <Text
          style={[styles.settingValue, wrapValue && styles.settingValueMultiline]}
        >
          {value}
        </Text>
      ) : onPress ? (
        <Text style={styles.chevron}>›</Text>
      ) : null}
    </TouchableOpacity>
  );
}

function toEnrollmentStatus(raw?: string): EnrollmentStatus {
  return String(raw || '').trim().toLowerCase() === 'active' ? 'Active' : 'Inactive';
}

export default function ProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { user, dashboardContext } = useAppSelector((s) => s.auth);
  const customerId = resolveActiveCustomerId(dashboardContext, user?.defaultCustomerId);
  const roleKey = user?.roleKey;

  const [pinLoginEnabled, setPinLoginEnabled] = useState(false);
  const [hasPinSet, setHasPinSet] = useState(false);
  const [hasAppLock, setHasAppLock] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState(loadNotificationPreferences());
  const [lowBalanceThresholdLabel, setLowBalanceThresholdLabel] = useState('—');

  const [profile, setProfile] = useState<CustomerProfileView | null>(null);
  const [agentWallet, setAgentWallet] = useState({ accountNumber: '', ifsc: '', upiId: '' });
  const [bankLoading, setBankLoading] = useState(true);
  const [refreshingBalance, setRefreshingBalance] = useState(false);

  const [activeTab, setActiveTab] = useState<ProfileTabKey>('profile');
  const [serviceStatuses, setServiceStatuses] = useState<{
    vahan: EnrollmentStatus;
    echallan: EnrollmentStatus;
    sarathi: EnrollmentStatus;
  }>({ vahan: 'Inactive', echallan: 'Inactive', sarathi: 'Inactive' });
  const [serviceStatusesLoading, setServiceStatusesLoading] = useState(false);
  const [serviceStatusesError, setServiceStatusesError] = useState(false);

  const accountMobile = SecureStorage.getLastLoginMobile()
    ?? profile?.phone?.replace(/\D/g, '').slice(-10)
    ?? '';

  const fetchBankInfo = useCallback(async () => {
    setBankLoading(true);
    try {
      if (isAdminOrEmployee(roleKey)) {
        setProfile(null);
        return;
      }

      if (isAgentRole(roleKey)) {
        const { data } = await profileApi.getAgentList();
        const rows = data?.data?.rows ?? [];
        const current = rows.find((r) => r.accNo || r.ifscNo || r.upiNo) ?? rows[0];
        // Agent settlement AccNo is RED — mask for every non-ADMIN (agents included).
        setAgentWallet({
          accountNumber: redactRedPii(current?.accNo ?? '', roleKey, maskBankAccount),
          ifsc: current?.ifscNo ?? '',
          upiId: current?.upiNo ?? '',
        });
        return;
      }

      if (canShowCustomerBankInfo(roleKey)) {
        const { data } = await profileApi.getCustomerProfile();
        const row = data?.rows?.[0];
        if (row) {
          setProfile(mapCustomerProfileRow(row, roleKey));
        }
      }
    } catch {
      /* bank section stays empty */
    } finally {
      setBankLoading(false);
    }
  }, [roleKey]);

  const fetchServiceStatuses = useCallback(async () => {
    // Web parity: CUSTOMER = self; CGA = selected customer's profileUserId.
    const showServiceTabs =
      isCustomer(roleKey) || isCustomerGroupAdmin(roleKey);
    if (!showServiceTabs) return;

    // CGA must wait for profile — session userId is the admin, not the customer.
    if (isCustomerGroupAdmin(roleKey) && profile?.profileUserId == null) {
      return;
    }

    const serviceUserId = isCustomerGroupAdmin(roleKey)
      ? profile?.profileUserId
      : user?.userId;

    if (serviceUserId == null || !Number.isFinite(serviceUserId)) {
      setServiceStatusesError(true);
      return;
    }

    setServiceStatusesLoading(true);
    setServiceStatusesError(false);
    try {
      const { data } = await profileApi.getCustomerServices(serviceUserId);
      const row = data?.data;
      setServiceStatuses({
        vahan: toEnrollmentStatus(row?.vahanStatus),
        echallan: toEnrollmentStatus(row?.echallanStatus),
        sarathi: toEnrollmentStatus(row?.sarathiStatus),
      });
    } catch {
      setServiceStatusesError(true);
    } finally {
      setServiceStatusesLoading(false);
    }
  }, [profile?.profileUserId, roleKey, user?.userId]);

  useEffect(() => { fetchBankInfo(); }, [fetchBankInfo]);
  useEffect(() => { fetchServiceStatuses(); }, [fetchServiceStatuses]);

  useFocusEffect(useCallback(() => {
    fetchBankInfo();
    fetchServiceStatuses();

    const cached = Cache.getJSON<DashboardSummary>(
      `dashboard_snapshot:${user?.userId ?? 'anon'}:${customerId ?? 'self'}`,
    );
    const minimumBalance = cached?.wallet?.minimumBalance ?? 0;

    const applyLabel = () => {
      const threshold = resolveWalletAlertThreshold(minimumBalance, {
        userId: user?.userId,
        customerId,
      });
      setLowBalanceThresholdLabel(formatINR(threshold));
    };

    applyLabel();
    void hydrateWalletAlertThresholdFromApi(user?.userId, customerId).then(applyLabel);
  }, [fetchBankInfo, fetchServiceStatuses, user?.userId, customerId]));

  const handleToggleNotification = useCallback((
    key: 'walletAlerts' | 'challanAlerts' | 'complianceAlerts' | 'claimsAlerts',
    value: boolean,
  ) => {
    const next = saveNotificationPreferences({ [key]: value });
    setNotifPrefs(next);
  }, []);

  /**
   * Same live balance pull as web Fastag → Customers / UserProfile Fastag tab,
   * then reloads profile so Balance / Last Updated reflect the DB update.
   * Reloads quietly (no bankLoading spinner) so the Fastag tab does not flash.
   */
  const handleRefreshBalance = useCallback(async () => {
    const yapEntityId = profile?.yapEntityId?.trim();
    if (!yapEntityId || refreshingBalance) return;

    setRefreshingBalance(true);
    try {
      await walletApi.getCustomerBalance({
        checkBalance: true,
        yapEntityId,
      });

      const { data } = await profileApi.getCustomerProfile();
      const row = data?.rows?.[0];
      if (row) {
        setProfile(mapCustomerProfileRow(row, roleKey));
      }

      Alert.alert('Success', 'Balance refreshed successfully');
    } catch (error: unknown) {
      const apiMessage =
        error &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message;
      Alert.alert(
        'Unable to refresh',
        apiMessage || 'Unable to fetch balance. Please try again later.',
      );
    } finally {
      setRefreshingBalance(false);
    }
  }, [profile?.yapEntityId, refreshingBalance, roleKey]);

  const canManageWalletAlerts = canShowCustomerBankInfo(roleKey);

  const loadPinPrefs = useCallback(async () => {
    try {
      setPinLoginEnabled(SecureStorage.isPinLoginEnabled());
      setHasAppLock(hasAppLockPin());
      if (accountMobile.length === 10) {
        const pinSet = await fetchPinStatus(accountMobile);
        setHasPinSet(pinSet);
      } else {
        setHasPinSet(false);
      }
    } catch {
      setPinLoginEnabled(false);
      setHasPinSet(false);
      setHasAppLock(hasAppLockPin());
    }
  }, [accountMobile]);

  useEffect(() => {
    loadPinPrefs();
  }, [loadPinPrefs]);

  useFocusEffect(useCallback(() => {
    loadPinPrefs();
  }, [loadPinPrefs]));

  const handleTogglePinLogin = useCallback(async (next: boolean) => {
    if (pinBusy) return;

    if (!next) {
      disablePinLogin();
      setPinLoginEnabled(false);
      return;
    }

    if (!hasPinSet) {
      Alert.alert(
        'PIN required',
        'Set up your 4-digit PIN first, then enable quick PIN login on this device.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Set PIN', onPress: () => nav.navigate('SetPin') },
        ],
      );
      return;
    }

    if (accountMobile.length !== 10) {
      Alert.alert(
        'Mobile number required',
        'Sign out and sign in again with your mobile number before enabling PIN login.',
      );
      return;
    }

    setPinBusy(true);
    try {
      enablePinLogin(accountMobile);
      setPinLoginEnabled(true);
    } finally {
      setPinBusy(false);
    }
  }, [accountMobile, hasPinSet, nav, pinBusy]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await dispatch(signOut());
        },
      },
    ]);
  };

  // MM-07/R6 restore, merged forward into R7: this UI entry point was removed
  // (again) while SecureStorage.forgetThisDevice() and signOut({forgetDevice:true})
  // — the underlying, still-fully-functional service and thunk — were left in
  // place with no caller. Without this, a user signing out on a shared/borrowed
  // device left their PIN hash/hint (and now also their App Lock PIN hash) behind
  // for the next person who opens the app on that handset to inherit. Kept in
  // SECURITY next to the other PIN controls since that's exactly what this wipes.
  const handleForgetDevice = () => {
    Alert.alert(
      'Forget This Device',
      'This signs you out and removes your saved PIN and app lock PIN from this device. ' +
        'Anyone else using this device afterwards will need to sign in with mobile number and OTP again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget Device',
          style: 'destructive',
          onPress: async () => {
            await dispatch(signOut({ forgetDevice: true }));
          },
        },
      ],
    );
  };

  const showCorporate = profile
    ? hasWalletValues(profile.corporateYesBank) || hasWalletValues(profile.corporateIdfc)
    : false;

  // Same gates as web UserProfile: Fastag when enrolled; service tabs for CUSTOMER + CGA.
  const showCustomerServiceTabs =
    isCustomer(roleKey) || isCustomerGroupAdmin(roleKey);
  const showCustomerFastagTab =
    canShowCustomerBankInfo(roleKey) && Boolean(profile?.hasFastagEnrollment);
  const showCustomerProfileTabs =
    showCustomerFastagTab || showCustomerServiceTabs;

  const profileTabs: ProfileTabItem[] = useMemo(() => {
    if (!showCustomerProfileTabs) return [];
    const tabs: ProfileTabItem[] = [{ key: 'profile', label: 'My Profile' }];
    if (showCustomerFastagTab) {
      tabs.push({ key: 'fastag', label: 'Fastag' });
    }
    if (showCustomerServiceTabs) {
      tabs.push(
        { key: 'vahan', label: 'Vahan' },
        { key: 'echallan', label: 'eChallan' },
        { key: 'sarathi', label: 'Sarathi' },
      );
    }
    return tabs;
  }, [showCustomerFastagTab, showCustomerProfileTabs, showCustomerServiceTabs]);

  useEffect(() => {
    // Keep active tab valid when Fastag disappears after profile reload.
    if (profileTabs.length === 0) {
      setActiveTab('profile');
      return;
    }
    if (!profileTabs.some((t) => t.key === activeTab)) {
      setActiveTab('profile');
    }
  }, [activeTab, profileTabs]);

  const showProfilePane = !showCustomerProfileTabs || activeTab === 'profile';
  const showFastagPane =
    showCustomerProfileTabs
      ? activeTab === 'fastag' && showCustomerFastagTab
      : true; // staff/agent keep bank blocks on the single untabbed scroll
  const showServicePane =
    showCustomerProfileTabs
    && showCustomerServiceTabs
    && (activeTab === 'vahan' || activeTab === 'echallan' || activeTab === 'sarathi');

  const renderUserAndContact = () => {
    const displayName = profile?.firstName || user?.customerName || '—';
    const displayEmail = profile?.email?.trim() || '—';
    const displayPhone = profile?.phone?.trim() || '—';
    const cityState = [profile?.city, profile?.state, profile?.pincode]
      .filter(Boolean)
      .join(', ');

    return (
      <>
        <Text style={styles.sectionLabel}>CONTACT</Text>
        <GlassCard style={styles.section}>
          <SettingRow icon="👤" label="Name" value={displayName} wrapValue />
          <View style={styles.divider} />
          <SettingRow icon="✉️" label="Email ID" value={displayEmail} />
          <View style={styles.divider} />
          <SettingRow icon="📱" label="Mobile Number" value={displayPhone} />
          {profile?.address ? (
            <>
              <View style={styles.divider} />
              <View style={styles.addressRow}>
                <View style={styles.settingIcon}>
                  <Text style={styles.settingIconText}>📍</Text>
                </View>
                <View style={styles.addressBody}>
                  <Text style={styles.addressLabel}>Address</Text>
                  <Text style={styles.addressValue}>{profile.address}</Text>
                </View>
              </View>
            </>
          ) : null}
          {cityState ? (
            <>
              <View style={styles.divider} />
              <SettingRow icon="🏙" label="City / State" value={cityState} />
            </>
          ) : null}
          {profile?.panNumber ? (
            <>
              <View style={styles.divider} />
              <SettingRow icon="🪪" label="PAN" value={profile.panNumber} />
            </>
          ) : null}
          {profile?.gstNo ? (
            <>
              <View style={styles.divider} />
              <SettingRow icon="🧾" label="GSTIN" value={profile.gstNo} />
            </>
          ) : null}
        </GlassCard>
      </>
    );
  };

  const renderBankAndVpa = () => (
    <>
      {/* Customer Details + Balance Details sit above wallets on the Fastag tab (web parity). */}
      {profile && canShowCustomerBankInfo(roleKey) && profile.hasFastagEnrollment ? (
        <FastagDetailsSections
          profile={profile}
          refreshingBalance={refreshingBalance}
          onRefreshBalance={handleRefreshBalance}
        />
      ) : null}

      <Text style={styles.sectionLabel}>FASTAG ACCOUNT</Text>
      {bankLoading ? (
        <ActivityIndicator color={Colors.blue} style={{ marginBottom: Spacing[4] }} />
      ) : isAdminOrEmployee(roleKey) ? (
        <AdminWalletSection />
      ) : isAgentRole(roleKey) ? (
        <AgentWalletSection {...agentWallet} />
      ) : profile ? (
        <CustomerWalletSections
          fastagYesBank={profile.fastagYesBank}
          fastagIdfc={profile.fastagIdfc}
          corporateYesBank={profile.corporateYesBank}
          corporateIdfc={profile.corporateIdfc}
          showCorporate={showCorporate}
        />
      ) : (
        <GlassCard style={styles.section}>
          <Text style={styles.emptyBank}>No bank details available for this account.</Text>
        </GlassCard>
      )}

      {profile && canShowCustomerBankInfo(roleKey) ? (
        <UpiVpaSection items={profile.vpaList} />
      ) : null}
    </>
  );

  const renderSecurityNotificationsApp = () => (
    <>
      <Text style={styles.sectionLabel}>SECURITY</Text>
      <GlassCard style={styles.section}>
        <SettingRow
          icon="🔒"
          label={hasAppLock ? 'Change App Lock PIN' : 'Set App Lock PIN'}
          onPress={() => nav.navigate(hasAppLock ? 'ChangeAppLockPin' : 'SetAppLockPin')}
        />
        <View style={styles.divider} />
        <SettingRow
          icon="🔢"
          label={hasPinSet ? 'Change PIN' : 'Set PIN'}
          onPress={() => nav.navigate(hasPinSet ? 'ChangePin' : 'SetPin')}
        />
        <View style={styles.divider} />
        <SettingRow
          icon="⚡"
          label="Quick PIN Login"
          toggle
          toggleValue={pinLoginEnabled}
          onToggle={handleTogglePinLogin}
        />
        <View style={styles.divider} />
        <SettingRow
          icon="🔑"
          label="Change Password"
          onPress={() => nav.navigate('ChangePassword')}
        />
        <View style={styles.divider} />
        <SettingRow
          icon="🚫"
          label="Forget This Device"
          onPress={handleForgetDevice}
          danger
        />
      </GlassCard>

      <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
      <GlassCard style={styles.section}>
        {canManageWalletAlerts ? (
          <>
            <SettingRow
              icon="📉"
              label="Low Balance Threshold"
              value={lowBalanceThresholdLabel}
              onPress={() => nav.navigate('LowBalanceThreshold')}
            />
            <View style={styles.divider} />
          </>
        ) : null}
        <SettingRow
          icon="💳"
          label="Wallet Alerts"
          toggle
          toggleValue={notifPrefs.walletAlerts}
          onToggle={(value) => handleToggleNotification('walletAlerts', value)}
        />
        <View style={styles.divider} />
        <SettingRow
          icon="⚠️"
          label="Challan Alerts"
          toggle
          toggleValue={notifPrefs.challanAlerts}
          onToggle={(value) => handleToggleNotification('challanAlerts', value)}
        />
        <View style={styles.divider} />
        <SettingRow
          icon="🛡"
          label="Compliance Alerts"
          toggle
          toggleValue={notifPrefs.complianceAlerts}
          onToggle={(value) => handleToggleNotification('complianceAlerts', value)}
        />
        <View style={styles.divider} />
        <SettingRow
          icon="📋"
          label="Claims Updates"
          toggle
          toggleValue={notifPrefs.claimsAlerts}
          onToggle={(value) => handleToggleNotification('claimsAlerts', value)}
        />
      </GlassCard>

      <Text style={styles.sectionLabel}>APP INFO</Text>
      <GlassCard style={styles.section}>
        <SettingRow icon="ℹ️" label="Version" value={DeviceInfo.getVersion()} />
      </GlassCard>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <LiquidBackground>
      <ScreenHeader title="Profile" showBack />
      {showCustomerProfileTabs ? (
        <ProfileTabBar
          tabs={profileTabs}
          activeKey={activeTab}
          onChange={setActiveTab}
        />
      ) : null}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {showProfilePane ? (
          <>
            {renderUserAndContact()}
            {/* Untabbed staff/agent: bank stays on the single page (web parity). */}
            {!showCustomerProfileTabs ? renderBankAndVpa() : null}
            {renderSecurityNotificationsApp()}
          </>
        ) : null}

        {showCustomerProfileTabs && showFastagPane ? renderBankAndVpa() : null}

        {showServicePane && activeTab === 'vahan' ? (
          <ServiceEnrollmentStatus
            serviceLabel="Vahan"
            status={serviceStatuses.vahan}
            loading={serviceStatusesLoading}
            error={serviceStatusesError}
            onRequestAccess={() => nav.navigate('RCList', { openRequestForm: true })}
          />
        ) : null}
        {showServicePane && activeTab === 'echallan' ? (
          <ServiceEnrollmentStatus
            serviceLabel="eChallan"
            status={serviceStatuses.echallan}
            loading={serviceStatusesLoading}
            error={serviceStatusesError}
            onRequestAccess={() =>
              nav.navigate('ChallanList', { openRequestForm: true })
            }
          />
        ) : null}
        {showServicePane && activeTab === 'sarathi' ? (
          <ServiceEnrollmentStatus
            serviceLabel="Sarathi"
            status={serviceStatuses.sarathi}
            loading={serviceStatusesLoading}
            error={serviceStatusesError}
            onRequestAccess={() => nav.navigate('DLList', { openRequestForm: true })}
          />
        ) : null}

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing[4], paddingTop: Spacing[2] },
  sectionLabel: {
    fontSize: FontSize.base, fontWeight: '800', color: Colors.text.label,
    letterSpacing: 1.2, marginBottom: 8, marginTop: 4, paddingLeft: 2,
  },
  section: { marginBottom: Spacing[4], padding: 0, overflow: 'hidden' },
  emptyBank: { padding: Spacing[4], color: Colors.text.secondary, fontSize: FontSize.sm },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  // Top-align so multi-line Name stays level with the icon/label like Email/Mobile.
  settingRowTop: { alignItems: 'flex-start' },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
    maxWidth: '42%',
  },
  settingIcon: {
    width: 32, height: 32, backgroundColor: Colors.infoBg,
    borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  settingIconDanger: { backgroundColor: Colors.dangerBg },
  settingIconText: { fontSize: 15 },
  settingLabel: { fontSize: FontSize.base, color: Colors.white, fontWeight: '500' },
  settingValue: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.sm,
    color: Colors.text.subtle,
    textAlign: 'right',
  },
  // Long names wrap in the right column — same row layout as Email / Mobile.
  settingValueMultiline: {
    lineHeight: 20,
    paddingTop: 6, // optical align with icon/label baseline
  },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  addressBody: { flex: 1, gap: 3 },
  addressLabel: { fontSize: FontSize.base, color: Colors.white, fontWeight: '500' },
  addressValue: { fontSize: FontSize.sm, color: Colors.text.subtle, lineHeight: 19 },
  chevron: { fontSize: FontSize.xl, color: Colors.text.subtle },
  divider: { height: 1, backgroundColor: Colors.divider, marginLeft: 60 },
  logoutBtn: {
    backgroundColor: Colors.dangerBg, borderWidth: 1.5, borderColor: Colors.dangerBorder,
    borderRadius: Radius.lg, padding: Spacing[4], alignItems: 'center', marginBottom: Spacing[4],
  },
  logoutText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.dangerLight },
});
