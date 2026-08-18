/**
 * Auth slice — owns mobile session state and sign-in progress.
 * Access tokens are written to Keychain by the thunk; Redux keeps only display
 * and routing-safe user metadata needed by navigation and screens.
 */

import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '../../services/api/authApi';
import { invalidateApiSession, markApiSessionActive, getApiErrorMessage } from '../../services/api/client';
import { SecureStorage, Cache } from '../../services/storage/SecureStorage';
import type { AuthUser, DashboardContext, LoginPayload, RefreshTokenResponse } from '../../types/auth';
import {
  isCustomerGroupAdmin,
  isMobileAppLoginBlocked,
  requiresAdminContextPicker,
} from '../../types/auth';
import { switchActiveCustomer } from '../../services/auth/customerSwitch';
import { ensureDeviceIdPersisted, resolveLogoutDeviceId } from '../../services/auth/deviceIdentity';
import { signInWithPinLogin, syncPinLoginPreference, enablePinLogin } from '../../services/auth/pinAuthService';

/** Same wording as a bad-credentials failure so restricted roles are not tipped off. */
const MOBILE_LOGIN_BLOCKED_MESSAGE = 'Username and password is invalid';

type SessionUser = Omit<AuthUser, 'accessToken'>;

interface SignInResult {
  user: SessionUser;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  // Gates the UI until the cold-start session restore resolves, preventing a
  // flash of the login screen for users who are actually still logged in.
  isBootstrapping: boolean;
  // Emotional splash plays once after sign-in, before the main app shell.
  showPostLoginSplash: boolean;
  error: string | null;
  user: SessionUser | null;
  dashboardContext: DashboardContext | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: false,
  isBootstrapping: true,
  showPostLoginSplash: false,
  error: null,
  user: null,
  dashboardContext: null,
};

function buildSessionUser(data: {
  userId: number;
  roleId: number;
  roleKey: SessionUser['roleKey'];
  mobileVerified: boolean;
  customerName: string;
  defaultCustomerId: number | null;
  eligibleForCommissionReport: boolean;
}): SessionUser {
  return {
    userId: data.userId,
    roleId: data.roleId,
    roleKey: data.roleKey,
    mobileVerified: data.mobileVerified,
    customerName: data.customerName,
    defaultCustomerId: data.defaultCustomerId,
    eligibleForCommissionReport: data.eligibleForCommissionReport,
  };
}

async function persistSession(
  accessToken: string,
  sessionUser: SessionUser,
  mobileNumber?: string,
): Promise<void> {
  await SecureStorage.setAccessToken(accessToken);
  SecureStorage.setSessionUser(sessionUser);
  SecureStorage.setSessionRestorable(true);
  if (mobileNumber) {
    SecureStorage.setLastLoginMobile(mobileNumber);
  }
  markApiSessionActive();
  try {
    await ensureDeviceIdPersisted();
  } catch {
    // Best-effort — logout still resolves hardware id at sign-out time.
  }
}

export const signIn = createAsyncThunk<
  SignInResult,
  LoginPayload,
  { rejectValue: string }
>('auth/signIn', async (payload, { rejectWithValue }) => {
  try {
    invalidateApiSession();
    await SecureStorage.prepareForSignIn();

    const { data } = await authApi.signIn(payload);

    if (!data?.accessToken) {
      return rejectWithValue('Sign-in succeeded but no access token was returned.');
    }

    // Block staff roles from the mobile app — treat as invalid credentials.
    if (isMobileAppLoginBlocked(data.roleKey)) {
      await SecureStorage.prepareForSignIn();
      invalidateApiSession();
      return rejectWithValue(MOBILE_LOGIN_BLOCKED_MESSAGE);
    }

    const sessionUser = buildSessionUser(data);

    try {
      await persistSession(data.accessToken, sessionUser, payload.username.trim());
    } catch (persistError: unknown) {
      try {
        await SecureStorage.prepareForSignIn();
      } catch {
        // ignore
      }
      invalidateApiSession();
      return rejectWithValue(
        getApiErrorMessage(persistError, 'Could not save session on this device. Try again.'),
      );
    }

    SecureStorage.setLastLoginMobile(payload.username.trim());

    // PIN preference is best-effort — must not fail an otherwise successful sign-in.
    try {
      await syncPinLoginPreference(payload.username.trim());
    } catch {
      // Ignore — user can still use password login.
    }

    return { user: sessionUser };
  } catch (error: unknown) {
    // Cleanup must never swallow the real sign-in error (Keychain throws on Appetize).
    try {
      await SecureStorage.prepareForSignIn();
    } catch {
      // ignore
    }
    invalidateApiSession();
    return rejectWithValue(getApiErrorMessage(error, 'Unable to sign in. Please try again.'));
  }
});

export const signInWithPin = createAsyncThunk<
  SignInResult,
  { mobileNumber: string; pin: string },
  { rejectValue: string }
>('auth/signInWithPin', async ({ mobileNumber, pin }, { rejectWithValue }) => {
  try {
    invalidateApiSession();
    await SecureStorage.prepareForSignIn();

    const result = await signInWithPinLogin(mobileNumber.trim(), pin);
    if (result.status === 'error' || !result.sessionData) {
      return rejectWithValue(result.status === 'error' ? result.message : 'PIN sign-in failed.');
    }

    // Same staff-role gate as password login — do not persist a mobile session.
    if (isMobileAppLoginBlocked(result.sessionData.roleKey)) {
      await SecureStorage.prepareForSignIn();
      invalidateApiSession();
      return rejectWithValue(MOBILE_LOGIN_BLOCKED_MESSAGE);
    }

    const sessionUser = buildSessionUser(result.sessionData);
    const resolvedMobile = mobileNumber.trim();

    await persistSession(
      result.sessionData.accessToken,
      sessionUser,
      resolvedMobile,
    );
    SecureStorage.setLastLoginMobile(resolvedMobile);
    enablePinLogin(resolvedMobile);

    return { user: sessionUser };
  } catch (error: unknown) {
    try {
      await SecureStorage.prepareForSignIn();
    } catch {
      // ignore
    }
    invalidateApiSession();
    return rejectWithValue(getApiErrorMessage(error, 'PIN sign-in failed.'));
  }
});

// Rehydrate auth on app launch — only when the user explicitly signed in and did
// not log out (can_restore_session gate). Token or user alone is never enough.
export const restoreSession = createAsyncThunk<
  { user: SessionUser } | null
>(
  'auth/restoreSession',
  async () => {
    const token = await SecureStorage.getAccessToken();
    const user = SecureStorage.getSessionUser<SessionUser>();
    const canRestore = SecureStorage.isSessionRestorable();

    if (!canRestore) {
      if (token) await SecureStorage.removeAccessToken();
      if (user) SecureStorage.clearSessionUser();
      invalidateApiSession();
      return null;
    }

    if (!token || !user) {
      SecureStorage.setSessionRestorable(false);
      if (token) await SecureStorage.removeAccessToken();
      SecureStorage.clearSessionUser();
      invalidateApiSession();
      return null;
    }

    // Drop restored staff sessions — mobile login is customer-only.
    if (isMobileAppLoginBlocked(user.roleKey)) {
      SecureStorage.setSessionRestorable(false);
      await SecureStorage.removeAccessToken();
      SecureStorage.clearSessionUser();
      invalidateApiSession();
      return null;
    }

    markApiSessionActive();
    return { user };
  },
);

// Rehydrate the last customer scope for multi-customer roles on cold start.
export const restoreDashboardContext = createAsyncThunk(
  'auth/restoreDashboardContext',
  async () => Cache.getJSON<DashboardContext>('dashboard_context'),
);

// Re-apply the cached customer on cold start using the web switch + refresh flow.
export const syncDefaultCustomerSession = createAsyncThunk<
  RefreshTokenResponse | null,
  void,
  { state: { auth: AuthState } }
>(
  'auth/syncDefaultCustomerSession',
  async (_, { getState }) => {
    const { dashboardContext, user } = getState().auth;

    // CUSTOMER_GROUP_ADMIN uses its own associated-customer switch flow after the
    // app shell loads. Forcing the admin-style refresh here can invalidate the
    // fresh login before that picker has chosen the correct scoped customer.
    if (!user?.roleKey || !requiresAdminContextPicker(user.roleKey)) {
      return null;
    }

    const customerId = dashboardContext?.customerId ?? user?.defaultCustomerId;
    if (customerId == null) return null;
    return switchActiveCustomer(customerId);
  },
);

export const signOut = createAsyncThunk<void, void>(
  'auth/signOut',
  async () => {
    const deviceId = await resolveLogoutDeviceId();

    // Bearer is still in Keychain until clearAll — server invalidates the session.
    try {
      await authApi.logout(deviceId);
    } catch {
      /* server logout is best-effort — local sign-out must still complete */
    }

    try {
      await authApi.revokeDevice(deviceId);
    } catch {
      /* push may never have been registered for this handset */
    }

    invalidateApiSession();
    await SecureStorage.clearAll();
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginSuccess(state, action: PayloadAction<SessionUser>) {
      state.isAuthenticated = true;
      state.error = null;
      state.user = action.payload;
    },
    logout(state) {
      state.isAuthenticated = false;
      state.isLoading = false;
      state.showPostLoginSplash = false;
      state.error = null;
      state.user = null;
      state.dashboardContext = null;
    },
    dismissPostLoginSplash(state) {
      state.showPostLoginSplash = false;
    },
    setAuthenticated(state, action: PayloadAction<boolean>) {
      state.isAuthenticated = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
    setDashboardContext(state, action: PayloadAction<DashboardContext | null>) {
      const next = action.payload;
      const current = state.dashboardContext;
      // Ignore redundant writes — dispatching the same scope was recreating the
      // auth slice and retriggering dashboard effects in an infinite loop.
      if (
        current?.customerId === next?.customerId &&
        current?.scopeType === next?.scopeType &&
        current?.label === next?.label
      ) {
        return;
      }
      state.dashboardContext = next;
    },
    /** Apply /auth/refreshToken payload after a customer switch. */
    applyRefreshedSession(state, action: PayloadAction<RefreshTokenResponse>) {
      const session = action.payload;
      if (state.user) {
        state.user = {
          ...state.user,
          userId: session.userId,
          roleId: session.roleId,
          roleKey: session.roleKey,
          mobileVerified: session.mobileVerified,
          customerName: session.customerName,
          defaultCustomerId: session.defaultCustomerId,
          eligibleForCommissionReport: session.eligibleForCommissionReport,
        };
      }
      state.dashboardContext = {
        customerId: session.defaultCustomerId,
        scopeType: 'CUSTOMER',
        label: session.customerName,
      };
    },
  },
  extraReducers: (builder) => {
    const handleSignInFulfilled = (
      state: AuthState,
      action: PayloadAction<SignInResult>,
    ) => {
      state.isLoading = false;
      state.isAuthenticated = true;
      state.isBootstrapping = false;
      state.showPostLoginSplash = true;
      state.user = action.payload.user;
      if (
        isCustomerGroupAdmin(action.payload.user.roleKey) &&
        action.payload.user.defaultCustomerId != null
      ) {
        // Label is resolved from associated-customers — login customerName is the BDM account.
        state.dashboardContext = {
          customerId: action.payload.user.defaultCustomerId,
          scopeType: 'CUSTOMER',
          label: '',
        };
      }
    };

    builder
      .addCase(signIn.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.showPostLoginSplash = false;
      })
      .addCase(signIn.fulfilled, handleSignInFulfilled)
      .addCase(signIn.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.showPostLoginSplash = false;
        state.error = action.payload ?? 'Unable to sign in. Please try again.';
      })
      .addCase(signInWithPin.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.showPostLoginSplash = false;
      })
      .addCase(signInWithPin.fulfilled, handleSignInFulfilled)
      .addCase(signInWithPin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'PIN sign-in failed.';
      })
      .addCase(signOut.fulfilled, (state) => {
        state.isAuthenticated = false;
        state.isLoading = false;
        state.isBootstrapping = false;
        state.showPostLoginSplash = false;
        state.error = null;
        state.user = null;
        state.dashboardContext = null;
      })
      // Even if revoke somehow rejects, local clearAll has run — treat the user
      // as fully signed out so the UI can never get stuck in the app shell.
      .addCase(signOut.rejected, (state) => {
        state.isAuthenticated = false;
        state.isLoading = false;
        state.isBootstrapping = false;
        state.showPostLoginSplash = false;
        state.error = null;
        state.user = null;
        state.dashboardContext = null;
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        if (action.payload) {
          state.isAuthenticated = true;
          state.user = action.payload.user;
        } else {
          state.isAuthenticated = false;
          state.user = null;
          state.dashboardContext = null;
        }
        state.isBootstrapping = false;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.isBootstrapping = false;
      })
      .addCase(restoreDashboardContext.fulfilled, (state, action) => {
        if (action.payload) state.dashboardContext = action.payload;
      })
      .addCase(syncDefaultCustomerSession.fulfilled, (state, action) => {
        if (!action.payload) return;
        const session = action.payload;
        if (state.user) {
          state.user = {
            ...state.user,
            userId: session.userId,
            roleId: session.roleId,
            roleKey: session.roleKey,
            mobileVerified: session.mobileVerified,
            customerName: session.customerName,
            defaultCustomerId: session.defaultCustomerId,
            eligibleForCommissionReport: session.eligibleForCommissionReport,
          };
        }
        state.dashboardContext = {
          customerId: session.defaultCustomerId,
          scopeType: 'CUSTOMER',
          label: session.customerName,
        };
      });
  },
});

export const {
  loginSuccess,
  logout,
  dismissPostLoginSplash,
  clearError,
  setAuthenticated,
  setDashboardContext,
  applyRefreshedSession,
} = authSlice.actions;
export default authSlice.reducer;
