import React, { useState, useEffect, useCallback } from 'react';
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
import { LiquidBackground, GlassCard, ScreenHeader } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import DeviceInfo from 'react-native-device-info';
import {
  canShowCustomerBankInfo,
  isAdminOrEmployee,
  isAgentRole,
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
import type { DashboardSummary } from '../../../types/dashboard';
import { resolveActiveCustomerId } from '../../../types/auth';
import {
  AdminWalletSection,
  AgentWalletSection,
  CustomerWalletSections,
} from '../components/BankWalletSection';
import { UpiVpaSection } from '../components/UpiVpaSection';

interface SettingRowProps {
  icon: string;
  label: string;
  value?: string;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  danger?: boolean;
}

function SettingRow({ icon, label, value, toggle, toggleValue, onToggle, onPress, danger }: SettingRowProps) {
  return (
    <TouchableOpacity
      style={styles.settingRow}
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
        <Text style={styles.settingValue}>{value}</Text>
      ) : onPress ? (
        <Text style={styles.chevron}>›</Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { user, dashboardContext } = useAppSelector((s) => s.auth);
  const customerId = resolveActiveCustomerId(dashboardContext, user?.defaultCustomerId);

  const [pinLoginEnabled, setPinLoginEnabled] = useState(false);
  const [hasPinSet, setHasPinSet] = useState(false);
  const [hasAppLock, setHasAppLock] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState(loadNotificationPreferences());
  const [lowBalanceThresholdLabel, setLowBalanceThresholdLabel] = useState('—');

  const [profile, setProfile] = useState<CustomerProfileView | null>(null);
  const [agentWallet, setAgentWallet] = useState({ accountNumber: '', ifsc: '', upiId: '' });
  const [bankLoading, setBankLoading] = useState(true);

  const accountMobile = SecureStorage.getLastLoginMobile()
    ?? profile?.phone?.replace(/\D/g, '').slice(-10)
    ?? '';

  const fetchBankInfo = useCallback(async () => {
    setBankLoading(true);
    try {
      if (isAdminOrEmployee(user?.roleKey)) {
        setProfile(null);
        return;
      }

      if (isAgentRole(user?.roleKey)) {
        const { data } = await profileApi.getAgentList();
        const rows = data?.data?.rows ?? [];
        const current = rows.find((r) => r.accNo || r.ifscNo || r.upiNo) ?? rows[0];
        setAgentWallet({
          accountNumber: current?.accNo ?? '',
          ifsc: current?.ifscNo ?? '',
          upiId: current?.upiNo ?? '',
        });
        return;
      }

      if (canShowCustomerBankInfo(user?.roleKey)) {
        const { data } = await profileApi.getCustomerProfile();
        const row = data?.rows?.[0];
        if (row) {
          setProfile(mapCustomerProfileRow(row));
        }
      }
    } catch {
      /* bank section stays empty */
    } finally {
      setBankLoading(false);
    }
  }, [user?.roleKey]);

  useEffect(() => { fetchBankInfo(); }, [fetchBankInfo]);

  useFocusEffect(useCallback(() => {
    fetchBankInfo();

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
  }, [fetchBankInfo, user?.userId, customerId]));

  const handleToggleNotification = useCallback((
    key: 'walletAlerts' | 'challanAlerts' | 'complianceAlerts' | 'claimsAlerts',
    value: boolean,
  ) => {
    const next = saveNotificationPreferences({ [key]: value });
    setNotifPrefs(next);
  }, []);

  const canManageWalletAlerts = canShowCustomerBankInfo(user?.roleKey);

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

  const showCorporate = profile
    ? hasWalletValues(profile.corporateYesBank) || hasWalletValues(profile.corporateIdfc)
    : false;

  return (
    <LiquidBackground>
      <ScreenHeader title="Profile" showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.userCard} variant="dark">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.customerName?.charAt(0) ?? 'U'}</Text>
          </View>
          <Text style={styles.name}>{profile?.firstName || user?.customerName || '—'}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{user?.roleKey?.replace(/_/g, ' ')}</Text>
          </View>
          {profile?.email ? <Text style={styles.meta}>{profile.email}</Text> : null}
          {profile?.phone ? <Text style={styles.meta}>{profile.phone}</Text> : null}
        </GlassCard>

        {profile?.address ? (
          <>
            <Text style={styles.sectionLabel}>CONTACT</Text>
            <GlassCard style={styles.section}>
              <View style={styles.addressRow}>
                <View style={styles.settingIcon}>
                  <Text style={styles.settingIconText}>📍</Text>
                </View>
                <View style={styles.addressBody}>
                  <Text style={styles.addressLabel}>Address</Text>
                  <Text style={styles.addressValue}>{profile.address}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <SettingRow
                icon="🏙"
                label="City / State"
                value={[profile.city, profile.state, profile.pincode].filter(Boolean).join(', ')}
              />
            </GlassCard>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>FASTAG ACCOUNT</Text>
        {bankLoading ? (
          <ActivityIndicator color={Colors.blue} style={{ marginBottom: Spacing[4] }} />
        ) : isAdminOrEmployee(user?.roleKey) ? (
          <AdminWalletSection />
        ) : isAgentRole(user?.roleKey) ? (
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

        {profile && canShowCustomerBankInfo(user?.roleKey) ? (
          <UpiVpaSection items={profile.vpaList} />
        ) : null}

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

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing[4], paddingTop: Spacing[2] },
  userCard: { alignItems: 'center', paddingVertical: 20, marginBottom: Spacing[4] },
  avatar: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.blue,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    borderWidth: 2, borderColor: Colors.glass.borderStrong,
  },
  avatarText: { fontSize: FontSize['4xl'], fontWeight: '700', color: Colors.white },
  name: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.white, marginBottom: 6 },
  rolePill: {
    backgroundColor: Colors.infoBg, borderWidth: 1, borderColor: Colors.infoBorder,
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 3, marginBottom: 6,
  },
  roleText: { fontSize: FontSize.sm, color: Colors.infoLight, fontWeight: '600' },
  meta: { fontSize: FontSize.sm, color: Colors.text.secondary, marginBottom: 2 },
  sectionLabel: {
    fontSize: FontSize.base, fontWeight: '800', color: Colors.text.label,
    letterSpacing: 1.2, marginBottom: 8, marginTop: 4, paddingLeft: 2,
  },
  section: { marginBottom: Spacing[4], padding: 0, overflow: 'hidden' },
  emptyBank: { padding: Spacing[4], color: Colors.text.secondary, fontSize: FontSize.sm },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: {
    width: 32, height: 32, backgroundColor: Colors.infoBg,
    borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  settingIconDanger: { backgroundColor: Colors.dangerBg },
  settingIconText: { fontSize: 15 },
  settingLabel: { fontSize: FontSize.base, color: Colors.white, fontWeight: '500' },
  settingValue: { fontSize: FontSize.sm, color: Colors.text.subtle, flexShrink: 1, textAlign: 'right' },
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
