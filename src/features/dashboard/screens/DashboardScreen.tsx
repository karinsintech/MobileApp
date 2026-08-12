/**
 * Fleet Dashboard screen — the customer's command center.
 * Mirrors the web FleetDashboard card layout (Fleet Status, Toll Spend, Wallet,
 * Savings, Compliance, Challan, Driver, Claims, Solutions, Announcements) so the
 * mobile and web portals present the same fleet picture from one session-scoped
 * summary fetch.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { dashboardApi } from '../../../services/api/dashboardApi';
import { Cache } from '../../../services/storage/SecureStorage';
import { useAppSelector } from '../../../store';
import {LiquidBackground, GlassCard, SkeletonCard} from '../../../components';
import {BellIcon} from '../../../components/icons';
import { useUnreadNotificationCount } from '../../notifications/hooks/useUnreadNotificationCount';
import { Colors, FontFamily, FontSize, Spacing, Radius } from '../../../theme';
import {fmtDate} from '../../../utils/format';
import type { DashboardSummary } from '../../../types/dashboard';
import {dashboardBody, dashboardContentFont, dashboardHeader, dashboardSubheading, DASHBOARD_LIGHT_WHITE} from '../dashboardTypography';
import { requiresAdminContextPicker, requiresContextSelection, resolveActiveCustomerId } from '../../../types/auth';
import { normalizeDashboardSummary } from '../utils/dashboardSummaryUtils';
import CustomerContextDropdown from '../components/CustomerContextDropdown';
import WalletBalanceCard from '../components/WalletBalanceCard';
import SavingsRecoveryCard, { type SavingsNavTarget } from '../components/SavingsRecoveryCard';
import FleetStatusCard from '../components/FleetStatusCard';
import TollSpendCard from '../components/TollSpendCard';
import ComplianceCard from '../components/ComplianceCard';
import DashboardSearchBar from '../components/DashboardSearchBar';
import Vehicle360Modal from '../components/Vehicle360Modal';
import type { RcListNavParams } from '../../compliance/utils/complianceNavigationUtils';
import type { VehicleSearchRecord } from '../../../types/vehicleSearch';
import ChallanCard from '../components/ChallanCard';
import ClaimsCard from '../components/ClaimsCard';
import KarinsSolutionsCard from '../components/KarinsSolutionsCard';
import DriverSectionCard from '../../compliance/components/DriverSectionCard';
import { type DLListNavParams } from '../../compliance/utils/driverNavigationUtils';
import { buildFySavingsFromSummary, hasIncentiveProgramFromSummary } from '../utils/fySavingsUtils';
import {computeFleetIntelligence} from '../dashboardMetrics';
import { syncDashboardNotifications } from '../../../services/notifications/syncDashboardNotifications';
import { syncBroadcastNotificationsFromApi } from '../../../services/notifications/notificationCenter';
import {
  DEFAULT_DASHBOARD_TOLL_PERIOD,
  mapTollPeriodToListRange,
} from '../constants/dashboardDefaults';
import type {TollPeriod} from '../../../types/dashboard';
import FleetHealthHeroCard from '../components/FleetHealthHeroCard';
import CriticalActionStrip from '../components/CriticalActionStrip';
import TimedBroadcastBanner from '../../notifications/components/TimedBroadcastBanner';

// Cache is scoped to the active identity (user + customer) so a previous
// session's snapshot is never painted after a different account logs in or an
// admin switches customer context — that was the source of "wrong data" flashes.
const CACHE_KEY_PREFIX = 'dashboard_snapshot';
const buildDashboardCacheKey = (
  userId: number | undefined,
  customerId: number | undefined,
): string => `${CACHE_KEY_PREFIX}:${userId ?? 'anon'}:${customerId ?? 'self'}`;

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { user, dashboardContext } = useAppSelector((s) => s.auth);

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [vehicle360Record, setVehicle360Record] = useState<VehicleSearchRecord | null>(null);
  const unreadNotifications = useUnreadNotificationCount();

  const customerId = resolveActiveCustomerId(dashboardContext, user?.defaultCustomerId);
  // Only admin-style roles scope by an explicit customerId; customers are session-scoped.
  const canScopeByCustomerId = requiresAdminContextPicker(user?.roleKey);

  // Identity-scoped cache key — recomputed whenever the logged-in user or the
  // active customer changes so we never paint a different account's snapshot.
  const cacheKey = useMemo(
    () => buildDashboardCacheKey(user?.userId, customerId),
    [user?.userId, customerId],
  );

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      // Paint cached data instantly on mount so the screen is never blank — but
      // only the snapshot that belongs to THIS user+customer (see cacheKey).
      const cached = Cache.getJSON<DashboardSummary>(cacheKey);
      // Clear any prior account's data first so a cache miss shows skeletons,
      // not the previous session's numbers.
      setData(cached ?? null);
      if (cached) {
        syncDashboardNotifications(cached, { userId: user?.userId, customerId });
        void syncBroadcastNotificationsFromApi();
      }
      setLoading(true);
    }
    setError(null);
    try {
      // Web calls /fleet-dashboard/summary with no query params — the session
      // scopes the customer. Admin roles still pass an explicit customerId.
      const { data: res } = await dashboardApi.getSummary({
        ...(canScopeByCustomerId && customerId ? { customerId } : {}),
      });
      const normalized = normalizeDashboardSummary(res);
      setData(normalized);
      Cache.setJSON(cacheKey, normalized);
      syncDashboardNotifications(normalized, { userId: user?.userId, customerId });
      void syncBroadcastNotificationsFromApi();
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [canScopeByCustomerId, customerId, cacheKey, user?.userId]);

  const showCustomerPicker = user ? requiresContextSelection(user.roleKey) : false;

  const hasIncentiveProgram = useMemo(
    () => hasIncentiveProgramFromSummary(data?.savings),
    [data?.savings],
  );

  const fySavings = useMemo(
    () => (data
      ? buildFySavingsFromSummary(data.savings, data.claims, hasIncentiveProgram)
      : null),
    [data, hasIncentiveProgram],
  );

  const handleRefresh = useCallback(() => {
    setRefresh(true);
    fetchData(true);
  }, [fetchData]);

  const handleNavigateDLList = useCallback((params: DLListNavParams) => {
    nav.navigate('More', { screen: 'DLList', params });
  }, [nav]);

  const handleNavigateTarget = useCallback((target: { tab: string; screen: string }) => {
    nav.navigate(target.tab, { screen: target.screen });
  }, [nav]);

  const handleNavigateVehicleList = useCallback(
    () => nav.navigate('Vehicles', { screen: 'VehicleList' }),
    [nav],
  );
  const handleNavigateTollList = useCallback(
    (period: TollPeriod = DEFAULT_DASHBOARD_TOLL_PERIOD) => {
      nav.navigate('Toll', {
        screen: 'TollList',
        params: { initialDateRange: mapTollPeriodToListRange(period) },
      });
    },
    [nav],
  );
  const handleNavigateTollWithRange = useCallback(
    (dateRange: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth') => {
      // Web fleet utilisation bars deep-link to Vehicle Toll Transactions Summary.
      nav.navigate('More', {
        screen: 'VehicleTollSummary',
        params: { initialDateRange: dateRange },
      });
    },
    [nav],
  );
  const handleNavigateRCList = useCallback(
    () => nav.navigate('More', { screen: 'RCList' }),
    [nav],
  );
  const handleNavigateRCListFiltered = useCallback(
    (params: RcListNavParams) => nav.navigate('More', { screen: 'RCList', params }),
    [nav],
  );
  const handleOpenVehicle360 = useCallback(
    (record: VehicleSearchRecord) => setVehicle360Record(record),
    [],
  );
  const handleNavigateChallanList = useCallback(
    () => nav.navigate('More', { screen: 'ChallanList' }),
    [nav],
  );
  const handleNavigateChallanFiltered = useCallback(
    (params: {
      vehicleNo?: string;
      challanNo?: string;
      status?: 'Pending' | 'Disposed' | 'All';
    }) => {
      nav.navigate('More', {
        screen: 'ChallanList',
        params: {
          initialVehicleNo: params.vehicleNo,
          initialChallanNo: params.challanNo,
          initialStatus: params.status ?? 'Pending',
        },
      });
    },
    [nav],
  );
  const handleNavigateClaimsList = useCallback(
    () => nav.navigate('Claims', { screen: 'ClaimsList' }),
    [nav],
  );
  const handleNavigateClaimsFiltered = useCallback(
    (filter: 'ALL' | 'WAITING_FOR_DOC' | 'APPROVED' | 'REJECTED' | 'EXPIRED') => {
      nav.navigate('Claims', {
        screen: 'ClaimsList',
        params: { initialFilter: filter },
      });
    },
    [nav],
  );
  // Savings tiles: Claims Recovered / Total → Claims (approved); Incentive → report.
  const handleNavigateSavings = useCallback(
    (target: SavingsNavTarget) => {
      if (target === 'incentive') {
        nav.navigate('More', { screen: 'IncentiveReport' });
        return;
      }
      nav.navigate('Claims', {
        screen: 'ClaimsList',
        params: { initialFilter: 'APPROVED' },
      });
    },
    [nav],
  );
  const handleNavigateWalletRecharge = useCallback(
    () => nav.navigate('More', { screen: 'Recharge' }),
    [nav],
  );
  const handleNavigateNotifications = useCallback(
    () => nav.navigate('More', { screen: 'Notifications' }),
    [nav],
  );
  const handleNavigateProfile = useCallback(
    () => nav.navigate('More', { screen: 'Profile' }),
    [nav],
  );
  const handleContextChange = useCallback(() => fetchData(true), [fetchData]);

  useEffect(() => {
    // Admin roles must pick a customer first; skip the fetch until one is chosen.
    if (showCustomerPicker && !customerId) return;
    fetchData();
  }, [customerId, showCustomerPicker, fetchData]);

  // Hero intelligence block (health score + open alerts) — web parity.
  const fi = useMemo(() => (data ? computeFleetIntelligence(data) : null), [data]);
  const wallet = data?.wallet;

  return (
    <LiquidBackground variant="light">
      {/* Icons are absolutely pinned on the right so title/customer can never cover them */}
      <View style={[styles.topBar, {paddingTop: insets.top + 8}]}>
        <View style={styles.headerCopy}>
          {/* Same lockup as LoginScreen — compact for the top bar */}
          <View style={styles.brandRow}>
            <Text style={styles.brandKarins}>Karins</Text>
            {/* <Text style={styles.brandFleet}>fleet</Text> */}
          </View>
          <Text style={styles.screenTitle} numberOfLines={1}>
            Fleet Dashboard
          </Text>
          {showCustomerPicker ? (
            <View style={styles.customerPickerSlot}>
              <CustomerContextDropdown
                variant="inline"
                onContextChange={handleContextChange}
              />
            </View>
          ) : (
            <Text style={styles.customerName} numberOfLines={1} ellipsizeMode="tail">
              {data?.customerName ?? user?.customerName ?? dashboardContext?.label ?? '—'}
            </Text>
          )}
        </View>

        <View style={[styles.topRight, {top: insets.top + 8, bottom: Spacing[2]}]}>
          <TouchableOpacity
            style={styles.iconBtn}
            accessibilityLabel="Notifications"
            onPress={handleNavigateNotifications}
          >
            <View>
              <BellIcon size={18} color={Colors.white} />
              {unreadNotifications > 0 ? (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.avatar}
            accessibilityLabel="Profile"
            onPress={handleNavigateProfile}
          >
            <Text style={styles.avatarText}>{user?.customerName?.charAt(0)?.toUpperCase() ?? 'U'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.blue} />
        }
        showsVerticalScrollIndicator={false}
        // Do NOT enable removeClippedSubviews on Android — it drops dashboard
        // cards from the view hierarchy when scrolling back up, so the action
        // strip / wallet / data section looks "hidden" and unreachable.
        keyboardShouldPersistTaps="handled"
      >
        <DashboardSearchBar onOpenVehicle={handleOpenVehicle360} />

        {/* Web TimedBroadcastBanner — Notice strip for broadcasts with expiresAt */}
        <TimedBroadcastBanner />

        {showCustomerPicker && !customerId ? (
          <GlassCard style={styles.promptCard}>
            <Text style={styles.promptTitle}>Select a customer</Text>
            <Text style={styles.promptText}>
              Use the customer dropdown above to choose which customer fleet you want to view.
            </Text>
          </GlassCard>
        ) : null}

        {error && (
          <GlassCard variant="danger" style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => fetchData()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </GlassCard>
        )}

        {/* Hero — Fleet Health score card with shield + compliance strip. */}
        {loading && !data ? (
          <View style={styles.heroSkeleton}><SkeletonCard /></View>
        ) : fi && data ? (
          <>
            <FleetHealthHeroCard
              summary={data}
              intelligence={fi}
              onReviewActions={handleNavigateRCList}
            />
            <CriticalActionStrip
              count={data.compliance?.totalAlerts ?? 0}
              onPress={handleNavigateRCList}
            />
          </>
        ) : null}

        {/* Fleet status — active / inactive / hotlisted split */}
        <FleetStatusCard
          fleet={data?.fleet}
          tollSpend={data?.tollSpend}
          loading={loading && !data}
          onPressActive={handleNavigateVehicleList}
          onUtilColumnPress={handleNavigateTollWithRange}
        />

        {/* Toll spend — self-contained period bars (web keeps period in-card) */}
        <TollSpendCard
          tollSpend={data?.tollSpend}
          loading={loading && !data}
          onViewAll={handleNavigateTollList}
        />

        {/* Wallet balance — wallet's only home */}
        <WalletBalanceCard
          wallet={wallet}
          loading={loading && !data}
          onRecharge={handleNavigateWalletRecharge}
        />

        {/* Savings & recovery */}
        <SavingsRecoveryCard
          fySavings={fySavings}
          loading={loading && !data}
          hasIncentiveProgram={hasIncentiveProgram}
          onNavigate={handleNavigateSavings}
        />

        {/* VAHAN compliance — per-document expiry health */}
        <ComplianceCard
          compliance={data?.compliance}
          onViewAll={handleNavigateRCList}
          onCompliancePress={handleNavigateRCListFiltered}
        />

        {/* e-Challans — mirrors web ChallanSection (top vehicles + recent) */}
        <ChallanCard
          challans={data?.challans}
          loading={loading && !data}
          onPay={handleNavigateChallanList}
          onFilter={handleNavigateChallanFiltered}
        />

        {/* Driver / Sarathi */}
        <DriverSectionCard
          drivers={data?.drivers}
          onNavigate={handleNavigateDLList}
        />

        {/* Claims pipeline */}
        <ClaimsCard
          claims={data?.claims}
          onViewAll={handleNavigateClaimsList}
          onFilter={handleNavigateClaimsFiltered}
        />

        {/* <Text style={styles.sectionLabel}>KARINS SOLUTIONS</Text> */}
        <KarinsSolutionsCard
          fleetSize={data?.fleet?.total}
          isGpsActive={data?.gpsActive}
          onNavigate={handleNavigateTarget}
        />

        {/* Announcements */}
        {(data?.announcements?.length ?? 0) > 0 && (
          <>
            <Text style={styles.sectionLabel}>Announcements</Text>
            {data!.announcements.slice(0, 3).map((ann) => (
              <GlassCard
                key={ann.id}
                variant={ann.severity === 'CRITICAL' ? 'danger' : ann.severity === 'WARNING' ? 'warning' : 'info'}
                style={styles.announcementCard}
              >
                <Text style={styles.annTitle}>{ann.title}</Text>
                <Text style={styles.annMessage}>{ann.message}</Text>
                <Text style={styles.annMeta}>{fmtDate(ann.publishDate)}</Text>
              </GlassCard>
            ))}
          </>
        )}

        {lastUpdated && (
          <Text style={styles.lastUpdated}>Last updated {fmtDate(lastUpdated, 'DD MMM, hh:mm A')}</Text>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      <Vehicle360Modal
        record={vehicle360Record}
        onClose={() => setVehicle360Record(null)}
      />
    </LiquidBackground>
  );
}

const TOP_RIGHT_CLUSTER_WIDTH = 42 + 8 + 42; // notification + gap + profile

const styles = StyleSheet.create({
  topBar: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[2],
    minHeight: 72,
    zIndex: 20,
    elevation: 20,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    // Reserve space so truncated title/customer never draw under the icons
    paddingRight: TOP_RIGHT_CLUSTER_WIDTH + Spacing[3],
    justifyContent: 'center',
    gap: 2,
    overflow: 'hidden',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  brandKarins: {
    fontFamily: FontFamily.logo,
    fontSize: 22,
    color: Colors.white,
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  brandFleet: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
    marginLeft: 7,
    marginBottom: 1,
  },
  screenTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 1,
  },
  customerPickerSlot: {
    width: '100%',
    maxWidth: 180,
    overflow: 'hidden',
  },
  customerName: {
    fontSize: dashboardContentFont.sm,
    color: Colors.text.secondary,
    fontWeight: '600',
    maxWidth: 180,
  },
  promptCard:      { marginBottom: Spacing[3], padding: Spacing[4] },
  promptTitle:     { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white, marginBottom: 6 },
  promptText:      { ...dashboardBody, lineHeight: 20 },
  topRight: {
    position: 'absolute',
    right: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    width: TOP_RIGHT_CLUSTER_WIDTH,
    zIndex: 30,
    elevation: 30,
  },
  iconBtn: {
    width: 42,
    height: 42,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    fontSize: dashboardContentFont.tiny,
    fontWeight: '700',
    color: Colors.white,
  },
  avatar: {
    width: 42,
    height: 42,
    backgroundColor: Colors.infoBg,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.infoBorder,
  },
  avatarText:      { fontSize: dashboardContentFont.base, fontWeight: '700', color: Colors.white },
  scroll: {paddingHorizontal: Spacing[4], paddingTop: Spacing[2], paddingBottom: Spacing[4]},
  errorCard:       { marginBottom: Spacing[3], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  errorText:       { color: Colors.dangerLight, fontSize: dashboardContentFont.sm, flex: 1 },
  retryText:       { color: Colors.infoLight, fontSize: dashboardContentFont.sm, fontWeight: '600' },
  heroSkeleton:    { height: 120, marginBottom: Spacing[3] },
  sectionLabel:    { ...dashboardHeader, marginBottom: Spacing[2], marginTop: Spacing[2] },
  announcementCard:{ marginBottom: 8, padding: 12 },
  annTitle:        { ...dashboardHeader, marginBottom: 3 },
  annMessage:      { ...dashboardSubheading, lineHeight: 18 },
  annMeta:         { fontSize: dashboardContentFont.xs, color: DASHBOARD_LIGHT_WHITE, marginTop: 4 },
  lastUpdated:     { fontSize: dashboardContentFont.xs, color: DASHBOARD_LIGHT_WHITE, textAlign: 'center', marginTop: Spacing[3] },
});
