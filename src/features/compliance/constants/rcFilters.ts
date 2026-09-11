/**
 * VAHAN RC list filters — query field names mirror web VehicleRcsHeader.
 */

export interface RCFilters {
  customerName: string;
  vehicleNo: string;
  expiryType: string;
  fromDate: string;
  toDate: string;
  status: string;
  /** Vehicle group id from /vehicle-group/group-names (web sends as groupName). */
  groupName: string;
}

export const EMPTY_RC_FILTERS: RCFilters = {
  customerName: '',
  vehicleNo: '',
  expiryType: '',
  fromDate: '',
  toDate: '',
  status: '',
  groupName: '',
};

export const RC_EXPIRY_TYPE_OPTIONS = [
  { label: 'Fit Expiry', value: 'rcFitUpto' },
  { label: 'Tax Expiry', value: 'rcTaxUpto' },
  { label: 'Insurance Expiry', value: 'rcInsuranceUpto' },
  { label: 'PUC Expiry', value: 'rcPuccUpto' },
  { label: 'Permit Expiry', value: 'rcPermitValidUpto' },
  { label: 'NP Expiry', value: 'rcNpUpto' },
  { label: 'AIT Expiry', value: 'rcAitpUpto' },
  { label: 'AIT Permit Expiry', value: 'rcAitpPmtUpto' },
  { label: 'Non Use Expiry', value: 'rcNonUseUpto' },
] as const;

export const RC_STATUS_OPTIONS = [
  { label: 'ACTIVE', value: 'ACTIVE' },
  { label: 'FITNESS EXPIRED', value: 'FITNESS_EXPIRED' },
  { label: 'RC CANCELLED', value: 'RC_CANCELLED' },
  { label: 'NOC ISSUED', value: 'NOC_ISSUED' },
  { label: 'RC SURRENDER', value: 'RC_SURRENDER' },
  // Filters on rcBlacklistStatus (not rcStatus) — handled specially in rcList API
  { label: 'BLACK LIST', value: 'BLACKLIST' },
] as const;

export interface RcGroupOption {
  id: string;
  title: string;
}

export interface RcCustomerOption {
  yapEntityId: string;
  firstName: string;
}
