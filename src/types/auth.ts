// Auth & Role Types — mirrors backend roleKey values

export type RoleKey =
  | 'ADMIN'
  | 'CUSTOMER'
  | 'VEHICLE_GROUP_ADMIN'
  | 'EMPLOYEE'
  | 'CUSTOMER_GROUP_ADMIN'
  | 'AGENT';

export interface AuthUser {
  userId: number;
  roleId: number;
  roleKey: RoleKey;
  mobileVerified: boolean;
  customerName: string;
  defaultCustomerId: number | null;
  eligibleForCommissionReport: boolean;
  accessToken: string;
}

export interface LoginPayload {
  // Login identifier accepted by the backend; the mobile number is sent here.
  username: string;
  password: string;
  // Optional device geolocation for security_audit_log login coords.
  latitude?: number;
  longitude?: number;
}

export interface LoginResponse {
  accessToken: string;
  userId: number;
  roleId: number;
  roleKey: RoleKey;
  mobileVerified: boolean;
  customerName: string;
  defaultCustomerId: number | null;
  eligibleForCommissionReport: boolean;
  mobileNumber?: string;
}

export interface PinSignInPayload {
  mobileNumber: string;
  pin: string;
  // Optional device geolocation for security_audit_log login coords.
  latitude?: number;
  longitude?: number;
}

export interface PinStatusResponse {
  hasPinSet: boolean;
}

export interface RefreshResponse {
  accessToken: string;
}

/** Web session refresh after switching customer — returns re-scoped user + token. */
export interface RefreshTokenResponse {
  accessToken: string;
  userId: number;
  roleId: number;
  roleKey: RoleKey;
  mobileVerified: boolean;
  customerName: string;
  defaultCustomerId: number;
  eligibleForCommissionReport: boolean;
  mobileNumber?: number;
}

export interface OTPPayload {
  mobileNo: string;
  otp: string;
}

/**
 * One endpoint serves all three reset steps; the fields present decide the step.
 * Field names are dictated by the backend Joi schema — `submittedOtp` and
 * `password` are NOT interchangeable with the authenticated reset/change
 * endpoints, which expect `newPassword`/`confirmPassword`.
 */
export interface ForgotPasswordPayload {
  mobileNo: string;
  submittedOtp?: string;
  password?: string;
}

export type ForgotPasswordStatus = 'OTP_SENT' | 'OTP_VERIFIED' | 'PASSWORD_CHANGED';

export interface ForgotPasswordResponse {
  status: ForgotPasswordStatus;
  message: string;
  // Only returned on OTP_SENT / OTP_VERIFIED — the number the server matched.
  mobileNumber?: string;
}

export interface DeviceRegistration {
  deviceId: string;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  fcmToken?: string;
  apnsToken?: string;
}

// Admin-style roles pick a customer from the dashboard dropdown (portfolio scope).
export const ADMIN_CONTEXT_ROLES: RoleKey[] = ['ADMIN', 'EMPLOYEE', 'AGENT'];

// CUSTOMER_GROUP_ADMIN uses the web header flow: associated-customers list +
// set-default-user-id so every API honours the active customer session.
export const CUSTOMER_GROUP_ADMIN_ROLE: RoleKey = 'CUSTOMER_GROUP_ADMIN';

export const REQUIRES_CONTEXT_SELECTION: RoleKey[] = [
  ...ADMIN_CONTEXT_ROLES,
  CUSTOMER_GROUP_ADMIN_ROLE,
];

export function isCustomerGroupAdmin(roleKey?: RoleKey): boolean {
  return roleKey === CUSTOMER_GROUP_ADMIN_ROLE;
}

export function requiresAdminContextPicker(roleKey?: RoleKey): boolean {
  return roleKey ? ADMIN_CONTEXT_ROLES.includes(roleKey) : false;
}

/**
 * Mobile app is customer-facing — ADMIN / EMPLOYEE / AGENT must not get a
 * session even if the backend accepts their credentials.
 */
export function isMobileAppLoginBlocked(roleKey?: RoleKey): boolean {
  return roleKey ? ADMIN_CONTEXT_ROLES.includes(roleKey) : false;
}

export function isAdminOrEmployee(roleKey?: RoleKey): boolean {
  return roleKey === 'ADMIN' || roleKey === 'EMPLOYEE';
}

export function isAgentRole(roleKey?: RoleKey): boolean {
  return roleKey === 'AGENT';
}

export function isVehicleGroupAdmin(roleKey?: RoleKey): boolean {
  return roleKey === 'VEHICLE_GROUP_ADMIN';
}

/** Customer-facing bank blocks — same visibility rule as web UserProfile. */
export function canShowCustomerBankInfo(roleKey?: RoleKey): boolean {
  return !isAdminOrEmployee(roleKey) && !isAgentRole(roleKey) && !isVehicleGroupAdmin(roleKey);
}

export function requiresContextSelection(roleKey?: RoleKey): boolean {
  return roleKey ? REQUIRES_CONTEXT_SELECTION.includes(roleKey) : false;
}

/** Resolved customer id for API scoping — cache first, then login default. */
export function resolveActiveCustomerId(
  dashboardContext: DashboardContext | null | undefined,
  defaultCustomerId: number | null | undefined,
): number | undefined {
  const id = dashboardContext?.customerId ?? defaultCustomerId;
  return id ?? undefined;
}

// ── Role-aware landing ──────────────────────────────────────────────────────
// Mirrors SideNav.tsx web routes: ADMIN/EMPLOYEE/AGENT → /dashboard,
// CUSTOMER/CUSTOMER_GROUP_ADMIN → /fleet-dashboard, VEHICLE_GROUP_ADMIN → /home.
// In the mobile app the two dashboard variants both render DashboardScreen;
// FEATURE_PRODUCTS renders the Feature Products home (VGA landing).
export type LandingRoute = 'ADMIN_DASHBOARD' | 'FLEET_DASHBOARD' | 'FEATURE_PRODUCTS';

export function getLandingRoute(roleKey?: RoleKey): LandingRoute {
  switch (roleKey) {
    case 'VEHICLE_GROUP_ADMIN':
      return 'FEATURE_PRODUCTS'; // /home — Feature Products, NOT Fleet Dashboard
    case 'CUSTOMER':
    case 'CUSTOMER_GROUP_ADMIN':
      return 'FLEET_DASHBOARD'; // /fleet-dashboard
    default:
      return 'ADMIN_DASHBOARD'; // ADMIN, EMPLOYEE, AGENT → /dashboard
  }
}

// ── Recharge guard ──────────────────────────────────────────────────────────
// More menu + screen gate — mirrors SideNav: adminItems, customerMenuItems,
// and customerGroupAdminMenuItems all expose /transaction/recharge.
export function canAccessRecharge(roleKey?: RoleKey): boolean {
  return roleKey === 'ADMIN'
    || roleKey === 'CUSTOMER'
    || roleKey === 'CUSTOMER_GROUP_ADMIN';
}

/**
 * Pay Here must not show a customer picker — wallet is implied by login
 * (CUSTOMER) or by the header switch-customer session (CUSTOMER_GROUP_ADMIN).
 * Mirrors web `hidesRechargeCustomerPicker` in roleUtils.ts.
 */
export function hidesRechargeCustomerPicker(roleKey?: RoleKey): boolean {
  return roleKey === 'CUSTOMER' || roleKey === 'CUSTOMER_GROUP_ADMIN';
}

// Dashboard scope types
export type ScopeType = 'CUSTOMER' | 'VEHICLE_GROUP' | 'ALL_ALLOWED';

export interface DashboardContext {
  customerId: number | null;
  vehicleGroupId?: number | null;
  scopeType: ScopeType;
  label: string;
}
