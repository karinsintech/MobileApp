// Dashboard & Fleet Data Types — mirrors FleetDashboard/types.ts from web portal

export type WalletStatus = 'HEALTHY' | 'LOW' | 'CRITICAL' | 'RECHARGE_REQUIRED';
export type ComplianceStatus = 'VALID' | 'EXPIRING_30' | 'EXPIRING_15' | 'EXPIRING_7' | 'EXPIRED';
export type DriverStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'UNKNOWN';
export type ClaimStatusGroup = 'APPROVED' | 'PENDING' | 'WAITING_FOR_DOC' | 'REJECTED' | 'EXPIRED';
export type TollPeriod = 'TODAY' | 'YESTERDAY' | 'THIS_MONTH' | 'THIS_FY' | 'LAST_QUARTER';
export type NotificationSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface FleetStats {
  total: number;
  active: number;
  inactive: number;
  hotlisted: number;
  utilization?: FleetUtilization;
}

export interface FleetUtilization {
  today: number;
  yesterday: number;
  last7Days: number;
  thisMonth: number;
  lastMonth: number;
  last7DayTrend?: number[];
  last7DayVehicleTrend?: number[];
  vehicleCounts?: {
    today: number;
    yesterday: number;
    last7Days: number;
    thisMonth: number;
    lastMonth: number;
  };
}

export type FleetUtilDateRange = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth';

export interface UtilChartColumn {
  pct: number;
  label: string;
  vehicleCount: number;
  highlight?: boolean;
  dateRange?: FleetUtilDateRange;
}

export interface TollPeriodData {
  amount: number;
  txnCount: number;
  vehicleCount?: number;
}

export interface TollSpend {
  today: TollPeriodData;
  yesterday: TollPeriodData;
  thisMonth: TollPeriodData;
  thisFY: TollPeriodData;
  lastQuarter: TollPeriodData;
  last7Days?: TollPeriodData;
  lastMonth?: TollPeriodData;
}

export interface WalletInfo {
  fastagBalance: number;
  corporateBalance: number;
  totalBalance: number;
  minimumBalance: number;
  walletStatus: WalletStatus;
  isCorporate: boolean;
  lowBalanceCustomers?: number;
}

export interface FySavingsPeriodAmount {
  thisYear?: number;
  lastYear?: number;
}

export interface SavingsInfo {
  fyClaimsRecovered: number | FySavingsPeriodAmount;
  fyIncentivePaid: number | FySavingsPeriodAmount;
  fyTotalSavings: number;
  hasIncentiveReport?: boolean;
}

export interface ComplianceItem {
  expired: number;
  /** Vehicles with this document still valid — fleet total minus expired/expiring. */
  valid?: number;
  expiringSoon?: number;
  exp7?: number;
  exp15?: number;
  exp30?: number;
}

export interface ComplianceSummary {
  fitness: ComplianceItem;
  tax: ComplianceItem;
  insurance: ComplianceItem;
  pucc: ComplianceItem;
  permit: ComplianceItem;
  np: ComplianceItem;
  /** RCs with a real VAHAN blacklist status (excludes NA / empty placeholders). */
  blacklistCount?: number;
  totalAlerts: number;
  totalVehicles?: number;
}

export interface TopVehicleChallanFine {
  vehicleNo: string;
  amount: number;
  challanCount: number;
}

export interface RecentChallanItem {
  id: number;
  vehicleNo: string;
  challanNo?: string;
  date: string;
  amount: number;
  status: string;
}

/** Matches web FleetDashboard ChallanSection summary payload. */
export interface ChallanSummary {
  pendingCount: number;
  pendingAmount: number;
  recentPending?: RecentChallanItem[];
  topVehiclesByFine?: TopVehicleChallanFine[];
}

export interface ClaimsSummary {
  approved: number;
  pending: number;
  waitingForDoc: number;
  rejected: number;
  expired: number;
  recoveredFY: number;
  recoveredLastFY?: number;
  total: number;
}

export interface DriverStats {
  total: number;
  valid: number;
  suspended: number;
  expiringSoon: number;
  expired: number;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  category: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  publishDate: string;
  showAsDashboardAlert: boolean;
}

export interface DashboardSummary {
  customerId: number;
  customerName: string;
  generatedAt: string;
  fyYear: string;
  fleet: FleetStats;
  tollSpend: TollSpend;
  wallet: WalletInfo;
  savings: SavingsInfo;
  compliance: ComplianceSummary;
  challans: ChallanSummary;
  drivers: DriverStats;
  claims: ClaimsSummary;
  announcements: Announcement[];
  gpsActive?: boolean;
}

export interface TollTransaction {
  id: number;
  vehicleNo: string;
  tollPlaza: string;
  direction: string;
  txnReaderTime?: string;
  txnDateTime: string;
  txnAmount: number;
  balance: number;
  rrn: string;
  txnType: string;
  isDoubleDebit?: boolean;
  isSuspicious?: boolean;
  claimStatus?: ClaimStatusGroup | null;
}

// Extended toll fields available from the list row — passed to the detail screen
// so we don't need a separate fetch (the /transaction/toll/:id endpoint may 404).
export interface TollTransactionDetail extends TollTransaction {
  kitNumber?: string;
  txnReaderTime?: string;
  txnRefNo?: string;
  tollId?: string;
  lane?: string;
  locationLat?: string;
  locationLng?: string;
  /** Backend field name for longitude — kept when raw API rows are passed through. */
  locationLang?: string;
  externalTxnId?: string;
  barcode?: string;
  customerName?: string;
  yapEntityId?: string;
  vehicleProfileId?: string;
}

export interface ClaimRecord {
  claimId: number;
  vehicleNo: string;
  tollPlaza: string;
  claimType: number;
  claimTypeName: string;
  amount: number;
  claimStatus: string;
  statusGroup: ClaimStatusGroup;
  /** Uppercase backend code, e.g. CLAIM_RECEIVED — shown on the detail screen. */
  rawClaimStatus?: string;
  requestedDate: string;
  receivedDate: string;
  expiryDate: string;
  rejectedReason: string;
  submittedDate?: string;
  rejectedDate?: string;
  submittedDateLevel2?: string;
  rejectedDateLevel2?: string;
  rejectedReasonLevel2?: string;
  submittedDateLevel3?: string;
  rejectedDateLevel3?: string;
  rejectedReasonLevel3?: string;
  lastUpdated: string;
  rrn?: string;
  bankName?: string;
  state?: string;
  customerName?: string;
  customerId?: string;
  readerDateTime?: string;
  transactionDateTime?: string;
  mapperClass?: string;
  axle?: string;
  referenceAmount?: string;
  tollId?: string;
}

export interface ChallanRecord {
  id: number;
  vehicleNo: string;
  challanNo: string;
  challanDateTime: string;
  state: string;
  department: string;
  fineImposed: number;
  status: string;
  isPending: boolean;
  isDisposed: boolean;
  isVirtualCourt: boolean;
  paymentUrl?: string;
}

export interface VehicleRecord {
  id: number;
  vehicleNo: string;
  customerName: string;
  vehicleGroupName?: string;
  tagStatus: string;
  isActive: boolean;
  lastTollDate?: string;
  lastTollAmount?: number;
  pendingChallanCount?: number;
  complianceRisk?: 'healthy' | 'watch' | 'at-risk';
}

export interface WalletTransaction {
  id: number;
  transactionType: 'CR' | 'DR';
  amount: number;
  description: string;
  vehicleNo?: string;
  transactionDate: string;
  referenceNo: string;
  balance: number;
  /** Which ledger this row came from when the list merges wallet + recharge feeds. */
  source?: 'wallet' | 'recharge';
}

export interface RCRecord {
  id: number;
  vehicleNo: string;
  ownerName: string;
  fitnessUpto?: string;
  insuranceUpto?: string;
  puccUpto?: string;
  permitUpto?: string;
  taxUpto?: string;
  npUpto?: string;
  rcStatus: string;
  overallStatus: ComplianceStatus;
}

export interface DriverLicence {
  id: number;
  dlNo: string;
  driverName: string;
  trValidTo?: string;
  ntValidTo?: string;
  primaryExpiry?: string;
  daysLeft?: number;
  status: DriverStatus;
  dlStatus: string;
}

// API pagination wrapper
export interface PaginatedResponse<T> {
  rows: never[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
