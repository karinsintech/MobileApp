/**
 * Maps mobile surfaces to web Role Management privilege IDs so restricting a
 * role on the portal hides the same features in the app.
 */

import { PrivilegeIds, type PrivilegeId } from '../types/accessMenus';

/** More-menu item keys → privilege ID(s). Unmapped keys stay role-only (like web Recharge). */
export const MORE_MENU_PRIVILEGES: Record<string, PrivilegeId | PrivilegeId[]> = {
  tollRates: PrivilegeIds.TOLL_RATE_MENU,
  tollSearch: PrivilegeIds.SEARCH_TOLL_MENU,
  verifyRates: PrivilegeIds.TOLL_RATE_VERIFY_MENU,
  doubleDebit: PrivilegeIds.VERIFY_TRANSACTIONS_MENU,
  tagInventory: PrivilegeIds.TAG_INVENTORY_MENU,
  // Reports hub — any report privilege is enough to show the entry point.
  reports: [
    PrivilegeIds.REPORT,
    PrivilegeIds.TOLL_TRANSACTION_REPORT,
    PrivilegeIds.VEHICLE_TRANSACTION_REPORT,
    PrivilegeIds.WALLET_TRANSACTION_REPORT,
    PrivilegeIds.CUSTOMER_TRANSACTION_REPORT,
    PrivilegeIds.COMMISSION_REPORT_MENU,
  ],
  challans: PrivilegeIds.CHALLAN_MENU,
  challanHistory: PrivilegeIds.CHALLAN_MENU,
  rc: PrivilegeIds.VEHICLE_RC_MENU,
  dl: PrivilegeIds.DRIVER_LICENSE_MENU,
  products: PrivilegeIds.PRODUCT_MENU,
};

/** Bottom-tab features gated by role management (Dashboard / More stay open). */
export const TAB_PRIVILEGES: Record<'Toll' | 'Vehicles' | 'Claims', PrivilegeId | PrivilegeId[]> = {
  // Customer web uses report menu (219); staff may use transactions list (186).
  Toll: [PrivilegeIds.TOLL_TRANSACTIONS_MENU, PrivilegeIds.TOLL_TRANSACTION_REPORT],
  Vehicles: PrivilegeIds.VEHICLE_MENU,
  Claims: PrivilegeIds.CLAIM_SUMMARY_MENU,
};

/** Screen-level privilege for deep links that bypass the More menu. */
export const SCREEN_PRIVILEGES: Record<string, PrivilegeId | PrivilegeId[]> = {
  ClaimsList: PrivilegeIds.CLAIM_SUMMARY_MENU,
  TollList: [PrivilegeIds.TOLL_TRANSACTIONS_MENU, PrivilegeIds.TOLL_TRANSACTION_REPORT],
  VehiclesList: PrivilegeIds.VEHICLE_MENU,
  VehicleList: PrivilegeIds.VEHICLE_MENU,
  ChallanList: PrivilegeIds.CHALLAN_MENU,
  PaymentHistory: PrivilegeIds.CHALLAN_MENU,
  RCList: PrivilegeIds.VEHICLE_RC_MENU,
  DLList: PrivilegeIds.DRIVER_LICENSE_MENU,
  TagInventory: PrivilegeIds.TAG_INVENTORY_MENU,
  Products: PrivilegeIds.PRODUCT_MENU,
  Reports: [
    PrivilegeIds.REPORT,
    PrivilegeIds.TOLL_TRANSACTION_REPORT,
    PrivilegeIds.VEHICLE_TRANSACTION_REPORT,
    PrivilegeIds.WALLET_TRANSACTION_REPORT,
    PrivilegeIds.CUSTOMER_TRANSACTION_REPORT,
    PrivilegeIds.COMMISSION_REPORT_MENU,
  ],
  IncentiveReport: PrivilegeIds.COMMISSION_REPORT_MENU,
  TollSearch: PrivilegeIds.SEARCH_TOLL_MENU,
  TollRateVerify: PrivilegeIds.TOLL_RATE_VERIFY_MENU,
  DoubleDebitList: PrivilegeIds.VERIFY_TRANSACTIONS_MENU,
};
