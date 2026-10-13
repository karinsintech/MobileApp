/**
 * Role-management access menus — same payload shape as web
 * GET /auth/role/getUserAccess (accessMenusPortal).
 */

/** One privilege / menu entry from role management. */
export interface AccessMenuItem {
  id: string;
  menu_path?: string;
  main_menu?: string;
}

/**
 * Privilege IDs from web `useHasAccess` / Role Management.
 * Keep in sync with karins_fastag_react/src/hooks/useHasAccess.ts.
 */
export const PrivilegeIds = {
  CLAIM_SUMMARY_MENU: '130',
  TOLL_RATE_MENU: '126',
  TOLL_RATE_VERIFY_MENU: '127',
  VERIFY_TRANSACTIONS_MENU: '128',
  TOLL_TRANSACTIONS_MENU: '186',
  SEARCH_TOLL_MENU: '206',
  TAG_INVENTORY_MENU: '193',
  CHALLAN_MENU: '201',
  VEHICLE_RC_MENU: '207',
  DRIVER_LICENSE_MENU: '211',
  /** Web Check DL Status / Add — DRIVER_LICENSE.CHECK_STATUS */
  DRIVER_LICENSE_CHECK_STATUS: '213',
  TOLL_TRANSACTION_REPORT: '219',
  VEHICLE_TRANSACTION_REPORT: '223',
  WALLET_TRANSACTION_REPORT: '227',
  CUSTOMER_TRANSACTION_REPORT: '231',
  REPORT: '191',
  VEHICLE_MENU: '235',
  /** Web CommissionReport / Incentive Report menu + actions (useHasAccess COMMISSION_REPORT). */
  COMMISSION_REPORT_MENU: '252',
  COMMISSION_REPORT_VIEW_INVOICE: '256',
  COMMISSION_REPORT_DELETE_INVOICE: '258',
  PRODUCT_MENU: '259',
} as const;

export type PrivilegeId = (typeof PrivilegeIds)[keyof typeof PrivilegeIds];
