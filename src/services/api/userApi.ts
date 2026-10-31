import { apiClient } from './client';

export const userApi = {
  setPin: (payload: { pin: string; confirmPin: string }) =>
    apiClient.post('/user/set-pin', payload),

  // currentPin omitted so a logged-in user can replace a forgotten PIN.
  changePin: (payload: {
    pin: string;
    confirmPin: string;
  }) => apiClient.put('/user/change-pin', payload),

  verifyPin: (payload: { pin: string }) =>
    apiClient.post<{ message: string; isVerified: boolean }>(
      '/user/verify-pin',
      payload,
    ),
};
