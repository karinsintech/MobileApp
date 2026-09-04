import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TollTransactionDetail, ClaimRecord } from '../types/dashboard';
import type { VehicleDetailPayload } from '../features/vehicles/types/vehicleDetail';
import type { TagDetailPayload } from '../features/toll/types/tagDetail';
import type { ChallanDetailPayload } from '../features/challan/types/challanDetail';

// ── Auth Stack ────────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Splash:        undefined;
  Login:         undefined;
  OTPVerify:     { mobileNo: string };
  ForgotPassword:undefined;
  RequestDemo:   undefined;
};

// ── Dashboard Stack ───────────────────────────────────────────────────────
export type DashboardStackParamList = {
  DashboardHome:    undefined;
  ProductsHome:     undefined; // VEHICLE_GROUP_ADMIN landing (Feature Products / /home)
  ContextSelector:  undefined;
};

// ── Toll Stack ────────────────────────────────────────────────────────────
export type TollStackParamList = {
  TollList:          {
    initialDateRange?: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth';
    initialVehicleNo?: string;
    initialRrn?: string;
  } | undefined;
  TollDetail:        { transaction: TollTransactionDetail };
  DoubleDebitList:   { title?: string } | undefined;
  TollSearch:        { title?: string } | undefined;
  TollRateVerify:    { title?: string } | undefined;
};

// ── Claims Stack ──────────────────────────────────────────────────────────
export type ClaimsStackParamList = {
  ClaimsList:   {
    initialVehicleNo?: string;
    initialTollName?: string;
    /** Dashboard Claims card deep-link — selects the matching status chip. */
    initialFilter?: 'ALL' | 'WAITING_FOR_DOC' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  } | undefined;
  // Pass the fully-mapped record from the list so the detail renders instantly
  // without depending on a separate /debit/:id shape that may differ.
  ClaimDetail:  { claimId: number; claim?: ClaimRecord };
};

// ── Vehicles Stack ────────────────────────────────────────────────────────
export type VehiclesStackParamList = {
  VehicleList:       undefined;
  VehicleDetail:     { vehicleNo: string; vehicle?: VehicleDetailPayload };
  VehicleGroupList:  undefined;
  VehicleGroupDetail:{ groupId: number };
};

// Shared compliance list params — live under More (not Vehicles) so More → RC/DL
// back-navigation returns to the More menu instead of the Vehicles tab.
export type RCListParams = {
  expiryType?: string;
  expiryStatus?: 'expired' | 'expiring' | 'valid';
  vehicleNo?: string;
} | undefined;

export type DLListParams = {
  expiryStatus?: string;
  expiryType?: string;
  licenseNo?: string;
  driverName?: string;
} | undefined;

// ── More Stack ────────────────────────────────────────────────────────────
export type MoreStackParamList = {
  MoreMenu:          undefined;
  ChallanList:       {
    initialVehicleNo?: string;
    initialChallanNo?: string;
    initialStatus?: 'Pending' | 'Disposed' | 'All';
  } | undefined;
  ChallanDetail:     { challan?: ChallanDetailPayload; challanNo?: string };
  PaymentHistory:    undefined;
  WalletHome:        undefined;
  WalletTransactions:undefined;
  Recharge:          undefined;
  RechargeStatus:    {
    transactionId?: string;
    orderId?: string;
    amount?: string | number;
    rechargeStatus?: string;
    message?: string;
    paymentMode?: string;
  };
  Reports:           { title?: string } | undefined;
  VehicleTollSummary: { initialDateRange?: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' } | undefined;
  CustomerTollSummary: undefined;
  IncentiveReport: undefined;
  WalletTransactionReport: undefined;
  Products:          { title?: string } | undefined;
  FAQ:               { title?: string } | undefined;
  Profile:           undefined;
  ChangePassword:    undefined;
  SetPin:            undefined;
  ChangePin:         undefined;
  SetAppLockPin:     undefined;
  ChangeAppLockPin:  undefined;
  LowBalanceThreshold: undefined;
  Notifications:     { title?: string } | undefined;
  TagInventory:      undefined;
  TagDetail:         { tagId: string; tag?: TagDetailPayload };
  RCList:            RCListParams;
  // Pass the full VAHAN row so the detail view renders instantly without a
  // second fetch (the rcList row already carries every rc* field).
  RCDetail:          { rcId: number; rc?: Record<string, any> };
  DLList:            DLListParams;
  DLDetail:          { dlId: number; detail?: object; driverName?: string };
};

// ── Main Tab Navigator ────────────────────────────────────────────────────
// Each tab hosts a nested stack; NavigatorScreenParams allows typed
// cross-tab jumps such as navigate('More', { screen: 'ChallanList' }).
export type MainTabParamList = {
  Dashboard:   NavigatorScreenParams<DashboardStackParamList> | undefined;
  Toll:        NavigatorScreenParams<TollStackParamList> | undefined;
  Claims:      NavigatorScreenParams<ClaimsStackParamList> | undefined;
  Vehicles:    NavigatorScreenParams<VehiclesStackParamList> | undefined;
  More:        NavigatorScreenParams<MoreStackParamList> | undefined;
};

// ── Screen Props helpers ──────────────────────────────────────────────────
export type AuthScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type DashboardScreenProps<T extends keyof DashboardStackParamList> =
  NativeStackScreenProps<DashboardStackParamList, T>;

export type TollScreenProps<T extends keyof TollStackParamList> =
  NativeStackScreenProps<TollStackParamList, T>;

export type ClaimsScreenProps<T extends keyof ClaimsStackParamList> =
  NativeStackScreenProps<ClaimsStackParamList, T>;

export type VehiclesScreenProps<T extends keyof VehiclesStackParamList> =
  NativeStackScreenProps<VehiclesStackParamList, T>;

export type MoreScreenProps<T extends keyof MoreStackParamList> =
  NativeStackScreenProps<MoreStackParamList, T>;
