import { apiClient } from './client';
import type { RCRecord, DriverLicence } from '../../types/dashboard';

export interface ComplianceParams {
  /** Admin DL filter sends yapEntityId; dashboard context may send numeric id. */
  customerId?: number | string;
  mobileNo?: string;
  /** Web admin RC filter sends customer first name as customerName. */
  customerName?: string;
  vehicleGroupId?: number;
  vehicleNo?: string;
  status?: string;
  pageNo?: number;
  pageSize?: number;
  expiryStatus?: string;
  expiryType?: string;
  fromDate?: string;
  toDate?: string;
  /** Vehicle group id — web VehicleRcsHeader sends this as groupName. */
  groupName?: string | number;
  licenseNo?: string;
  driverName?: string;
}

export interface DLExpiryBucket {
  expiringSoon?: number;
  expired?: number;
}

export interface DLListResponse {
  records?: unknown[];
  totalCount?: number;
  statusCounts?: { Active?: number; Suspended?: number };
  expiryCounts?: {
    dlTrValdtoDt?: DLExpiryBucket;
    dlNtValdtoDt?: DLExpiryBucket;
    dlHzValdtoDt?: DLExpiryBucket;
    dlHlValdtoDt?: DLExpiryBucket;
  };
}

export interface RCExpiryBucket {
  expiringSoon?: number;
  expired?: number;
}

export interface RCExpiryCounts {
  rcFitUpto?: RCExpiryBucket;
  rcTaxUpto?: RCExpiryBucket;
  rcInsuranceUpto?: RCExpiryBucket;
  rcPuccUpto?: RCExpiryBucket;
  rcPermitValidUpto?: RCExpiryBucket;
  rcNpUpto?: RCExpiryBucket;
}

export interface RCListResponse {
  records?: unknown[];
  totalCount?: number;
  expiryCounts?: RCExpiryCounts;
  /** RCs with a real VAHAN blacklist status (excludes NA / empty placeholders). */
  blacklistCount?: number;
}

export const complianceApi = {
  // VAHAN RC — backend lists registration certificates under /vehicleRc/rcList.
  getRCList: (params: ComplianceParams) =>
    apiClient.get<RCListResponse>('/vehicleRc/rcList', {
      params: { pageNo: 1, pageSize: 25, ...params },
    }),

  getRCById: (id: number) =>
    apiClient.get<RCRecord>(`/vehicleRc/${id}`),

  searchRC: (vehicleNo: string) =>
    apiClient.get<any>('/vehicleRc/search', { params: { vehicleNo } }),

  // SARATHI Driving Licence — backend lists licences under /driverLicense/all.
  getDLList: (params: ComplianceParams) =>
    apiClient.get<DLListResponse>('/driverLicense/all', {
      params: { pageNo: 1, pageSize: 25, ...params },
    }),

  getDLById: (id: number) =>
    apiClient.get<DriverLicence>(`/driverLicense/${id}`),

  searchDL: (dlNo: string) =>
    apiClient.get<any>('/driverLicense/search', { params: { dlNo } }),

  /**
   * ULIP Sarathi lookup — same body as web Check Status
   * (POST /driverLicense/search-dl).
   */
  searchDLStatus: (payload: {
    dlNumber: string;
    dob: string;
    mobileNo: string;
    driverName: string;
  }) =>
    // Sarathi upstream is often slower than list APIs; keep room past client default.
    apiClient.post<any>('/driverLicense/search-dl', payload, { timeout: 30_000 }),

  /**
   * Persist Sarathi result + operator-entered contact fields, then link to the
   * signed-in customer (POST /driverLicense/create-driver).
   */
  createDriver: (payload: {
    result: unknown;
    mobileNo: string;
    dob: string;
    driverName: string;
    custId?: number | string;
  }) =>
    apiClient.post<{ message?: string }>('/driverLicense/create-driver', payload),

  getComplianceSummary: (customerId?: number) =>
    apiClient.get<any>('/vehicleRc/compliance-summary', { params: { customerId } }),
};
