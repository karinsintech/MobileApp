import { apiClient } from './client';
import type {
  LoginPayload, LoginResponse, OTPPayload, RefreshResponse,
  RefreshTokenResponse, DeviceRegistration,
  PinSignInPayload, PinStatusResponse,
  ForgotPasswordPayload, ForgotPasswordResponse,
} from '../../types/auth';

export const authApi = {
  // Shared web auth route — no dedicated /auth/mobile/signIn exists on the
  // backend, so reuse /auth/signIn (extra device fields are simply ignored).
  // Access token comes from the response body, and the backend also sets the
  // refresh cookie used later by /auth/refreshToken after customer switching.
  signIn: (payload: LoginPayload) =>
    apiClient.post<LoginResponse>('/auth/signIn', payload, { withCredentials: true }),

  /** Refresh access token using HTTP-only cookie */
  refresh: () =>
    apiClient.post<RefreshResponse>('/auth/mobile/refresh', {}),

  /** Logout — Bearer invalidates session; deviceId revokes push registration when present. */
  logout: (deviceId: string) =>
    apiClient.post('/auth/mobile/logout', { deviceId }),

  /** Send OTP to verify mobile number */
  sendOTP: (mobileNo: string) =>
    apiClient.get('/auth/sendOtp', { params: { mobileNo } }),

  /** Verify OTP */
  verifyOTP: (payload: OTPPayload) =>
    apiClient.put('/auth/otpVerify', payload),

  /**
   * Public password reset, shared with the web portal. Called three times against
   * the same route: mobile only → OTP_SENT, + submittedOtp → OTP_VERIFIED,
   * + password → PASSWORD_CHANGED. No auth header (see PUBLIC_AUTH_PATHS).
   */
  forgotPassword: (payload: ForgotPasswordPayload) =>
    apiClient.put<ForgotPasswordResponse>('/user/forgot-password', payload),

  /** Change password (authenticated) */
  changePassword: (payload: { oldPassword: string; newPassword: string }) =>
    apiClient.put('/auth/changePassword', payload),

  /** Register device for push notifications */
  registerDevice: (payload: DeviceRegistration) =>
    apiClient.post('/auth/mobile/register-device', payload),

  /** Revoke device (on logout) */
  revokeDevice: (deviceId: string) =>
    apiClient.post('/auth/mobile/revoke-device', { deviceId }),

  /**
   * Refresh session after customer switch. The backend reads the HTTP-only
   * refresh cookie; request body is intentionally empty.
   */
  refreshToken: () =>
    apiClient.post<RefreshTokenResponse>('/auth/refreshToken', {}, { withCredentials: true }),

  /** Point the server at the chosen customer before calling refreshToken. */
  setDefaultCustomer: (selectedCustomerId: number) =>
    apiClient.put('/user/set-default-user-id', { selectedCustomerId }),

  /** Sign in with account PIN (mobile quick login). */
  pinSignIn: (payload: PinSignInPayload) =>
    apiClient.post<LoginResponse>('/auth/pin/signIn', payload, { withCredentials: true }),

  /** Check whether the account has a PIN configured. */
  pinStatus: (mobileNumber: string) =>
    apiClient.post<PinStatusResponse>('/auth/pin/status', { mobileNumber }),
};
