/**
 * Fleet vehicle list filters — field names mirror web VehicleHeader query params.
 * Backend owns filtering; mobile only forwards non-empty values on Search.
 */

export interface VehicleFilters {
  customerId: string;
  vehicleNo: string;
  vehicleClass: string;
  tagId: string;
  group: string;
  /** ACTIVE / INACTIVE (web ON/OFF toggle) */
  status: string;
  /** Single YAP status from /vehicle/filters dropdown */
  vehicleStatus: string;
}

export const EMPTY_VEHICLE_FILTERS: VehicleFilters = {
  customerId: '',
  vehicleNo: '',
  vehicleClass: '',
  tagId: '',
  group: '',
  status: '',
  vehicleStatus: '',
};

export const VEHICLE_ON_OFF_OPTIONS = [
  { label: 'ON', value: 'ACTIVE' },
  { label: 'OFF', value: 'INACTIVE' },
] as const;

/** Customer / VGA roles only see these YAP statuses in the web filter dropdown. */
export const CUSTOMER_VEHICLE_STATUS_ALLOWLIST = [
  'ALLOCATED',
  'NETC_LOWBALANCE',
  'NETC_NOTEXCEPTION',
  'NETC_HOTLIST',
  'NETC_FORCED_HOTLIST',
] as const;

export interface CustomerFilterOption {
  yapEntityId: string;
  firstName: string;
}

export interface AgentFilterOption {
  id: number;
  agentName: string;
}

/** Group picker row — id enables vehicleGroupId query; title is shown and matched client-side. */
export interface VehicleGroupOption {
  id: string;
  title: string;
}

/** VRN picker row — empty selection means the full customer fleet. */
export interface VehicleNoOption {
  vehicleNo: string;
}

export interface VehicleFilterMetaRow {
  yapStatus: string;
  customer?: {
    vehicleGroups?: { title: string }[];
  };
}
