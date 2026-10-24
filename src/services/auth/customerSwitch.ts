/**
 * Customer-group-admin switch flow — mirrors the web header:
 * 1) PUT /user/set-default-user-id  { selectedCustomerId }
 * 2) Update the local session so the UI scopes to that customer
 *
 * Backend APIs re-read `defaultCustomerId` from the User row on every request
 * (JWT only carries userId), so a fresh access token is not required for the
 * switch to take effect. Web achieves the same via page reload.
 *
 * `/auth/refreshToken` is cookie-only and unreliable on React Native — awaiting
 * it made every CGA switch feel stuck for up to the full axios timeout. Mobile
 * therefore patches the local session after set-default and never blocks on
 * cookie refresh.
 */

import { authApi } from '../api/authApi';
import { SecureStorage } from '../storage/SecureStorage';
import type { RefreshTokenResponse, RoleKey } from '../../types/auth';

type SessionUserSnapshot = {
  userId: number;
  roleId: number;
  roleKey: RoleKey;
  mobileVerified: boolean;
  customerName: string;
  defaultCustomerId: number | null;
  eligibleForCommissionReport: boolean;
};

/**
 * Build a client-side session payload when cookie refresh is unavailable —
 * same shape as /auth/refreshToken so Redux applyRefreshedSession stays happy.
 */
function buildLocalScopedSession(
  sessionUser: SessionUserSnapshot,
  selectedCustomerId: number,
  accessToken: string,
): RefreshTokenResponse {
  return {
    accessToken,
    userId: sessionUser.userId,
    roleId: sessionUser.roleId,
    roleKey: sessionUser.roleKey,
    mobileVerified: sessionUser.mobileVerified,
    // Keep the signed-in account name; callers label the picker with the
    // selected customer's display name separately.
    customerName: sessionUser.customerName,
    defaultCustomerId: selectedCustomerId,
    eligibleForCommissionReport: sessionUser.eligibleForCommissionReport,
  };
}

export async function switchActiveCustomer(
  selectedCustomerId: number,
): Promise<RefreshTokenResponse> {
  const accessToken = await SecureStorage.getAccessToken();
  if (!accessToken) {
    throw new Error('Session expired. Please sign in again.');
  }

  const sessionUser = SecureStorage.getSessionUser<SessionUserSnapshot>();
  if (!sessionUser?.userId) {
    throw new Error('Session expired. Please sign in again.');
  }

  // Persist the chosen customer first — subsequent APIs read this from the DB.
  await authApi.setDefaultCustomer(selectedCustomerId);

  // Do not await cookie /auth/refreshToken here. Mobile rarely has the HTTP-only
  // refresh cookie (apiClient uses withCredentials: false), so that call sat in
  // the failure path for ~20s and made the picker feel broken on both platforms.
  const data = buildLocalScopedSession(
    sessionUser,
    selectedCustomerId,
    accessToken,
  );

  // Same Bearer token after a local-only scope change — skip Keychain rewrite
  // (iOS SecItem writes hitch the JS thread during the switch).
  SecureStorage.setSessionUser({
    userId: data.userId,
    roleId: data.roleId,
    roleKey: data.roleKey,
    mobileVerified: data.mobileVerified,
    customerName: data.customerName,
    defaultCustomerId: data.defaultCustomerId,
    eligibleForCommissionReport: data.eligibleForCommissionReport,
  });
  SecureStorage.setSessionRestorable(true);

  return data;
}
