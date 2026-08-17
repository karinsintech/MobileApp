import { apiClient } from './client';
import type { DashboardSummary } from '../../types/dashboard';
import type { ScopeType } from '../../types/auth';

export interface DashboardParams {
  range?: 'today' | 'yesterday' | 'month' | 'fy';
  scope?: ScopeType;
  customerId?: number | null;
  vehicleGroupId?: number | null;
}

export const dashboardApi = {
  /** Fleet dashboard summary — all KPI cards */
  getSummary: (params: DashboardParams) =>
    apiClient.get<DashboardSummary>('/fleet-dashboard/summary', { params }),

  /** Fleet command dashboard (admin/employee portfolio view) */
  getCommandDashboard: (params: DashboardParams) =>
    apiClient.get<any>('/dashboard/fleet-command', { params }),

  /** Announcements */
  getAnnouncements: () =>
    apiClient.get<any[]>('/dashboard/announcements'),

  /** Customer list for context selector (admin/CG_ADMIN/AGENT) — returns the
   *  customers the logged-in user is allowed to scope into. */
  getCustomerList: () =>
    apiClient.get<{ customerId: number; customerName: string }[]>(
      '/user/associated-customers',
    ),

  /** Vehicle group list for VG_ADMIN */
  getVehicleGroupList: (customerId?: number) =>
    apiClient.get<{ groupId: number; groupName: string }[]>(
      '/vehicle-group/dropdown',
      { params: { customerId } },
    ),

  submitServiceEnquiry: (body: {
    serviceName: string;
    mobileNumber: string;
    fleetSize?: number;
    message?: string;
  }) =>
    apiClient.post<{ success?: boolean; enquiryId?: number | null }>(
      '/fleet-dashboard/service-enquiry',
      body,
    ),

  /** Fleet command search — vehicle, challan, driver, toll, claim (web Vehicle 360). */
  searchVehicles: (q: string) =>
    apiClient.get<{ vehicles: import('../../types/vehicleSearch').VehicleSearchRecord[] }>(
      '/fleet-dashboard/vehicle-search',
      { params: { q } },
    ),

  /** Same row the web Settings drawer reads — includes walletAlertThreshold. */
  getUserPreferences: () =>
    apiClient.get<{ preferences: FleetUserPreferences | null }>(
      '/fleet-dashboard/user-preferences',
    ),

  /** Partial upsert — omitted fields are left unchanged on the server. */
  saveUserPreferences: (prefs: Partial<FleetUserPreferences>) =>
    apiClient.post<{ success?: boolean; preferences?: FleetUserPreferences }>(
      '/fleet-dashboard/user-preferences',
      prefs,
    ),
};

/** Mirrors web FleetDashboard UserPreferences (wallet alert lives here, not on customer). */
export interface FleetUserPreferences {
  density?: 'compact' | 'comfortable';
  defaultPeriod?: string;
  walletAlertThreshold?: number;
  notifyWallet?: boolean;
  notifyChallan?: boolean;
  notifyNews?: boolean;
}
