import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import {createBottomTabNavigator, type BottomTabBarProps, type BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  MainTabParamList, DashboardStackParamList, TollStackParamList,
  ClaimsStackParamList, VehiclesStackParamList, MoreStackParamList,
} from './types';
import {Colors, FontSize, Radius} from '../theme';
import {ClaimsIcon, DashboardIcon, MoreIcon, TollIcon, VehiclesIcon} from '../components/icons';
import { useAppSelector } from '../store';
import { getLandingRoute } from '../types/auth';
import { useHasAccess } from '../hooks/useHasAccess';
import { TAB_PRIVILEGES, SCREEN_PRIVILEGES } from './mobilePrivileges';
import { createPrivilegeScreen } from './createPrivilegeScreen';
import CustomerGroupAdminGate from '../features/dashboard/components/CustomerGroupAdminGate';
import ProfileScreen from '../features/profile/screens/ProfileScreen';
import ChangePasswordScreen from '../features/profile/screens/ChangePasswordScreen';
import SetPinScreen from '../features/profile/screens/SetPinScreen';
import ChangePinScreen from '../features/profile/screens/ChangePinScreen';
import SetAppLockPinScreen from '../features/profile/screens/SetAppLockPinScreen';
import ChangeAppLockPinScreen from '../features/profile/screens/ChangeAppLockPinScreen';
import LowBalanceThresholdScreen from '../features/profile/screens/LowBalanceThresholdScreen';
import { ErrorBoundary } from '../components';

// Eager screen imports — avoids React.lazy resolving to undefined when nested
// tab stacks mount every tab's initial screen on first load.
import DashboardScreen from '../features/dashboard/screens/DashboardScreen';
import TollTransactionsScreen from '../features/toll/screens/TollTransactionsScreen';
import TollDetailScreen from '../features/toll/screens/TollDetailScreen';
import TagInventoryScreen from '../features/toll/screens/TagInventoryScreen';
import TagDetailScreen from '../features/toll/screens/TagDetailScreen';
import ClaimsScreen from '../features/claims/screens/ClaimsScreen';
import ClaimDetailScreen from '../features/claims/screens/ClaimDetailScreen';
import VehiclesScreen from '../features/vehicles/screens/VehiclesScreen';
import VehicleDetailScreen from '../features/vehicles/screens/VehicleDetailScreen';
import VehicleGroupListScreen from '../features/vehicles/screens/VehicleGroupListScreen';
import ChallanScreen from '../features/challan/screens/ChallanScreen';
import ChallanDetailScreen from '../features/challan/screens/ChallanDetailScreen';
import PaymentHistoryScreen from '../features/challan/screens/PaymentHistoryScreen';
import WalletScreen from '../features/wallet/screens/WalletScreen';
import MoreMenuScreen from '../features/more/screens/MoreMenuScreen';
import RCListScreen from '../features/compliance/screens/RCListScreen';
import RCDetailScreen from '../features/compliance/screens/RCDetailScreen';
import DLListScreen from '../features/compliance/screens/DLListScreen';
import DLDetailScreen from '../features/compliance/screens/DLDetailScreen';
import RechargeScreen from '../features/recharge/screens/RechargeScreen';
import RechargeStatusScreen from '../features/recharge/screens/RechargeStatusScreen';
import ProductsHomeScreen from '../features/products/screens/ProductsHomeScreen';
import DoubleDebitScreen from '../features/toll/screens/DoubleDebitScreen';
import TollSearchScreen from '../features/toll/screens/TollSearchScreen';
import TollRateVerifyScreen from '../features/toll/screens/TollRateVerifyScreen';
import ReportsScreen from '../features/reports/screens/ReportsScreen';
import VehicleTollSummaryScreen from '../features/reports/screens/VehicleTollSummaryScreen';
import CustomerTollSummaryScreen from '../features/reports/screens/CustomerTollSummaryScreen';
import IncentiveReportScreen from '../features/reports/screens/IncentiveReportScreen';
import WalletTransactionReportScreen from '../features/reports/screens/WalletTransactionReportScreen';
import FAQScreen from '../features/faq/screens/FAQScreen';
import NotificationsScreen from '../features/notifications/screens/NotificationsScreen';

// Wraps a tab's stack so a render crash (e.g. a screen choking on an unexpected
// payload after switching customer) is contained to that tab with a retry,
// instead of white-screening the whole app. Keyed on the active customer so
// changing context automatically clears a stale error and re-mounts the stack.
function TabBoundary({ children }: { children: React.ReactNode }) {
  const customerId = useAppSelector(
    (s) => s.auth.dashboardContext?.customerId ?? s.auth.user?.defaultCustomerId ?? 'none',
  );
  return <ErrorBoundary resetKey={customerId}>{children}</ErrorBoundary>;
}

// ── Stack navigators per tab ──────────────────────────────────────────────
const DashStack  = createNativeStackNavigator<DashboardStackParamList>();
const TollStack  = createNativeStackNavigator<TollStackParamList>();
const ClaimStack = createNativeStackNavigator<ClaimsStackParamList>();
const VehStack   = createNativeStackNavigator<VehiclesStackParamList>();
const MoreStack  = createNativeStackNavigator<MoreStackParamList>();

const stackOpts = {
  headerShown: false,
  contentStyle: { backgroundColor: '#000B1F' } as const,
};

// Privilege-gated entry screens — same IDs as web Role Management / SideNav.
const GuardedTollListScreen = createPrivilegeScreen(
  TollTransactionsScreen,
  SCREEN_PRIVILEGES.TollList,
);
const GuardedClaimsListScreen = createPrivilegeScreen(
  ClaimsScreen,
  SCREEN_PRIVILEGES.ClaimsList,
);
const GuardedVehicleListScreen = createPrivilegeScreen(
  VehiclesScreen,
  SCREEN_PRIVILEGES.VehicleList,
);
const GuardedChallanListScreen = createPrivilegeScreen(
  ChallanScreen,
  SCREEN_PRIVILEGES.ChallanList,
);
const GuardedPaymentHistoryScreen = createPrivilegeScreen(
  PaymentHistoryScreen,
  SCREEN_PRIVILEGES.PaymentHistory,
);
const GuardedTagInventoryScreen = createPrivilegeScreen(
  TagInventoryScreen,
  SCREEN_PRIVILEGES.TagInventory,
);
const GuardedReportsScreen = createPrivilegeScreen(
  ReportsScreen,
  SCREEN_PRIVILEGES.Reports,
);
const GuardedProductsScreen = createPrivilegeScreen(
  ProductsHomeScreen,
  SCREEN_PRIVILEGES.Products,
);
const GuardedRCListScreen = createPrivilegeScreen(
  RCListScreen,
  SCREEN_PRIVILEGES.RCList,
);
const GuardedDLListScreen = createPrivilegeScreen(
  DLListScreen,
  SCREEN_PRIVILEGES.DLList,
);
const GuardedTollSearchScreen = createPrivilegeScreen(
  TollSearchScreen,
  SCREEN_PRIVILEGES.TollSearch,
);
const GuardedTollRateVerifyScreen = createPrivilegeScreen(
  TollRateVerifyScreen,
  SCREEN_PRIVILEGES.TollRateVerify,
);
const GuardedDoubleDebitScreen = createPrivilegeScreen(
  DoubleDebitScreen,
  SCREEN_PRIVILEGES.DoubleDebitList,
);

function DashboardNavigator() {
  const roleKey = useAppSelector((s) => s.auth.user?.roleKey);
  const isFeatureProducts = getLandingRoute(roleKey) === 'FEATURE_PRODUCTS';
  return (
    <TabBoundary>
      <DashStack.Navigator screenOptions={stackOpts}>
        {isFeatureProducts ? (
          <DashStack.Screen name="ProductsHome" component={ProductsHomeScreen} />
        ) : (
          <DashStack.Screen name="DashboardHome" component={DashboardScreen} />
        )}
      </DashStack.Navigator>
    </TabBoundary>
  );
}

function TollNavigator() {
  return (
    <TabBoundary>
      <TollStack.Navigator screenOptions={stackOpts}>
        <TollStack.Screen name="TollList"       component={GuardedTollListScreen} />
        <TollStack.Screen name="TollDetail"     component={TollDetailScreen} />
        <TollStack.Screen name="DoubleDebitList" component={GuardedDoubleDebitScreen} />
        <TollStack.Screen name="TollSearch"     component={GuardedTollSearchScreen} />
        <TollStack.Screen name="TollRateVerify" component={GuardedTollRateVerifyScreen} />
      </TollStack.Navigator>
    </TabBoundary>
  );
}

function ClaimsNavigator() {
  return (
    <TabBoundary>
      <ClaimStack.Navigator screenOptions={stackOpts}>
        <ClaimStack.Screen name="ClaimsList"  component={GuardedClaimsListScreen} />
        <ClaimStack.Screen name="ClaimDetail" component={ClaimDetailScreen} />
      </ClaimStack.Navigator>
    </TabBoundary>
  );
}

function VehiclesNavigator() {
  return (
    <TabBoundary>
      <VehStack.Navigator screenOptions={stackOpts}>
        <VehStack.Screen name="VehicleList"      component={GuardedVehicleListScreen} />
        <VehStack.Screen name="VehicleDetail"    component={VehicleDetailScreen} />
        <VehStack.Screen name="VehicleGroupList" component={VehicleGroupListScreen} />
      </VehStack.Navigator>
    </TabBoundary>
  );
}

function MoreNavigator() {
  return (
    <TabBoundary>
      <MoreStack.Navigator screenOptions={stackOpts}>
        <MoreStack.Screen name="MoreMenu"      component={MoreMenuScreen} />
        <MoreStack.Screen name="ChallanList"   component={GuardedChallanListScreen} />
        <MoreStack.Screen name="ChallanDetail" component={ChallanDetailScreen} />
        <MoreStack.Screen name="PaymentHistory" component={GuardedPaymentHistoryScreen} />
        <MoreStack.Screen name="WalletHome"    component={WalletScreen} />
        <MoreStack.Screen name="Recharge"      component={RechargeScreen} />
        <MoreStack.Screen name="RechargeStatus" component={RechargeStatusScreen} />
        <MoreStack.Screen name="TagInventory"  component={GuardedTagInventoryScreen} />
        <MoreStack.Screen name="TagDetail"     component={TagDetailScreen} />
        <MoreStack.Screen name="Profile"       component={ProfileScreen} />
        <MoreStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        <MoreStack.Screen name="SetPin" component={SetPinScreen} />
        <MoreStack.Screen name="ChangePin" component={ChangePinScreen} />
        <MoreStack.Screen name="SetAppLockPin" component={SetAppLockPinScreen} />
        <MoreStack.Screen name="ChangeAppLockPin" component={ChangeAppLockPinScreen} />
        <MoreStack.Screen name="LowBalanceThreshold" component={LowBalanceThresholdScreen} />
        <MoreStack.Screen name="Reports"       component={GuardedReportsScreen} />
        <MoreStack.Screen name="VehicleTollSummary" component={VehicleTollSummaryScreen} />
        <MoreStack.Screen name="CustomerTollSummary" component={CustomerTollSummaryScreen} />
        <MoreStack.Screen name="IncentiveReport" component={IncentiveReportScreen} />
        <MoreStack.Screen name="WalletTransactionReport" component={WalletTransactionReportScreen} />
        <MoreStack.Screen name="Products"      component={GuardedProductsScreen} />
        <MoreStack.Screen name="FAQ"           component={FAQScreen} />
        <MoreStack.Screen name="Notifications" component={NotificationsScreen} />
        {/* Compliance lives in More so back from RC/DL returns to the More menu. */}
        <MoreStack.Screen name="RCList"        component={GuardedRCListScreen} />
        <MoreStack.Screen name="RCDetail"      component={RCDetailScreen} />
        <MoreStack.Screen name="DLList"        component={GuardedDLListScreen} />
        <MoreStack.Screen name="DLDetail"      component={DLDetailScreen} />
      </MoreStack.Navigator>
    </TabBoundary>
  );
}

// ── Custom floating glass tab bar ─────────────────────────────────────────
function tabIcon(routeName: string, color: string) {
  const props = {size: 22, color};
  switch (routeName) {
    case 'Dashboard':
      return <DashboardIcon {...props} />;
    case 'Toll':
      return <TollIcon {...props} />;
    case 'Vehicles':
      return <VehiclesIcon {...props} />;
    case 'Claims':
      return <ClaimsIcon {...props} />;
    default:
      return <MoreIcon {...props} />;
  }
}

function KarinsTabBar({state, descriptors, navigation}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // Custom tab bars ignore tabBarButton — hide revoked tabs here instead.
  const canToll = useHasAccess(TAB_PRIVILEGES.Toll);
  const canVehicles = useHasAccess(TAB_PRIVILEGES.Vehicles);
  const canClaims = useHasAccess(TAB_PRIVILEGES.Claims);

  return (
    <View style={[styles.tabShell, {paddingBottom: Math.max(insets.bottom, 8)}]}>
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          if (route.name === 'Toll' && !canToll) return null;
          if (route.name === 'Vehicles' && !canVehicles) return null;
          if (route.name === 'Claims' && !canClaims) return null;

          const isFocused = state.index === index;
          const {options} = descriptors[route.key];
          const label = typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : route.name;
          const activeColor = Colors.tabActive;
          const iconColor = isFocused ? activeColor : Colors.tabInactive;

          return (
            <TouchableOpacity
              key={route.key}
              style={[styles.tabItem, isFocused && styles.tabItemActive]}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              onLongPress={() => navigation.emit({type: 'tabLongPress', target: route.key})}
              accessibilityRole="button"
              accessibilityState={isFocused ? {selected: true} : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}>
              {tabIcon(route.name, iconColor)}
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]} numberOfLines={1}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabShell: {
    backgroundColor: Colors.bg.d0,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  tabBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.navBg,
    borderWidth: 1,
    borderColor: Colors.navBorder,
    borderRadius: Radius['2xl'],
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: Radius.lg,
    paddingHorizontal: 2,
  },
  tabItemActive: {
    backgroundColor: 'rgba(255,193,7,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(255,193,7,0.18)',
  },
  tabLabel: {
    fontSize: FontSize.xs,
    color: Colors.tabInactive,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: Colors.tabActive,
    fontWeight: '700',
  },
});

// ── Main Tab Navigator ────────────────────────────────────────────────────
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  const roleKey = useAppSelector((s) => s.auth.user?.roleKey);
  const dashboardLabel = getLandingRoute(roleKey) === 'FEATURE_PRODUCTS' ? 'Home' : 'Dashboard';

  return (
    <>
      <CustomerGroupAdminGate />
      <Tab.Navigator
        // tabBar must be a render callback — passing the component type calls it as a
        // plain function, which breaks hooks (Invalid hook call in FrameSizeProvider tree).
        tabBar={(props) => <KarinsTabBar {...props} />}
        screenOptions={{ headerShown: false, lazy: true, freezeOnBlur: true }}
      >
        <Tab.Screen name="Dashboard" component={DashboardNavigator} options={{ tabBarLabel: dashboardLabel }} />
        <Tab.Screen name="Toll" component={TollNavigator} />
        <Tab.Screen name="Vehicles" component={VehiclesNavigator} />
        <Tab.Screen name="Claims" component={ClaimsNavigator} />
        <Tab.Screen
          name="More"
          component={MoreNavigator}
          listeners={({
            navigation,
          }: {
            navigation: BottomTabNavigationProp<MainTabParamList, 'More'>;
          }) => ({
            tabPress: (e) => {
              // Always land on the More menu list when the tab is tapped — the
              // nested stack otherwise preserves the last visited screen (e.g.
              // Profile, Wallet) after switching away and coming back.
              e.preventDefault();
              navigation.navigate('More', { screen: 'MoreMenu' });
            },
          })}
        />
      </Tab.Navigator>
    </>
  );
}

export default MainTabs;
