import { apiClient } from './client';

export interface CustomerProfileRow {
  id?: number;
  firstName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  bankId?: number;
  fundTransferThreshold?: string | number;
  /** Low balance alert limit — same field used by the web settings screen. */
  minimumBalance?: string | number;
  /** Optional top-level KYC — masked for non-ADMIN when present. */
  panNumber?: string;
  gstNo?: string;
  /** ACTIVE FASTAG + LIVQUICK enrollment — gates the Fastag profile tab (web parity). */
  hasFastagEnrollment?: boolean;
  /** Fastag tab Customer Details — same fields as web UserProfile. */
  yapEntityId?: string | number;
  agentName?: string;
  yapRegisteredDate?: string;
  status?: number | null;
  customerType?: number | null;
  balance?: string | number | null;
  autoFundTransfer?: number | null;
  balanceLastUpdatedAt?: string;
  walletDetails?: WalletBankDetails;
  idfcWalletDetails?: WalletBankDetails;
  corporateWalletDetails?: WalletBankDetails;
  idfcCorporateWalletDetails?: WalletBankDetails;
  /** Linked portal user — CGA service tabs use this id (not the admin's userId). */
  userId?: number;
  user?: { id?: number; emailId?: string; mobileNumber?: string | number };
  vehicles?: Array<{ id?: number; vehicleNo?: string; upiUrl?: string }>;
}

/** GET /onboard/customer/:userId/services — enrollment flags for profile service tabs. */
export interface CustomerServiceStatusesRow {
  vahanStatus?: string;
  echallanStatus?: string;
  sarathiStatus?: string;
}

export interface WalletBankDetails {
  accountName?: string;
  accountNumber?: string;
  ifsc?: string;
  upi?: string;
  upiUrl?: string;
  /** Optional KYC fields — masked for non-ADMIN when present (DPDP RED). */
  panNumber?: string;
  gstNo?: string;
}

export interface AgentProfileRow {
  id: number;
  agentName?: string;
  accNo?: string;
  ifscNo?: string;
  upiNo?: string;
}

export const profileApi = {
  getCustomerProfile: () =>
    apiClient.get<{ rows?: CustomerProfileRow[] }>('/customer/customers', {
      params: { getProfile: true },
    }),

  getAgentList: () =>
    apiClient.get<{ data?: { rows?: AgentProfileRow[] } }>('/agent/'),

  /** Matches web account change-password — authenticated user updates their own password. */
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    apiClient.put('/user/change-password', payload),

  /**
   * Customer service enrollment statuses for profile Vahan / eChallan / Sarathi tabs.
   * Same route as web UserProfile.
   */
  getCustomerServices: (userId: number) =>
    apiClient.get<{ data?: CustomerServiceStatusesRow }>(
      `/onboard/customer/${userId}/services`,
    ),
};
