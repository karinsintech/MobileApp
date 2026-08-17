import { apiClient } from './client';

export interface TollReportQueryParams {
  customerName?: string;
  customerId?: string;
  vehicleNo?: string;
  agentId?: string | number;
  dateRange?: string;
  fromDate?: string;
  toDate?: string;
  pageNo?: number;
  pageSize?: number;
}

export interface TollReportPeriodCard {
  debitAmount?: number;
  creditAmount?: number;
  noOfTolls?: number;
  tollExpenses?: number;
  claimAmount?: number;
}

export interface VehicleTollSummaryRow {
  customerName?: string;
  customerId?: string;
  vehicleNo?: string;
  vehicleClass?: string;
  month?: string;
  noOfTolls?: string | number;
  debitAmount?: string | number;
  creditAmount?: string | number;
}

export interface VehicleTollSummaryResponse {
  total: number;
  results: VehicleTollSummaryRow[];
  cards?: {
    today?: TollReportPeriodCard;
    yesterday?: TollReportPeriodCard;
    thisWeek?: TollReportPeriodCard;
    thisMonth?: TollReportPeriodCard;
  };
}

export interface CustomerTollSummaryRow {
  customerId?: string;
  customerName?: string;
  month?: string;
  noOfTolls?: number;
  totalExpenses?: number;
  claimAmount?: number;
}

export interface CustomerBalanceSummary {
  accountOpeningBalance?: number;
  accountTotalCredit?: number;
  accountTotalClaim?: number;
  miscellaneousDebit?: number;
  accountTotalDebit?: number;
  accountClosingBalance?: number;
  /** Corp P2C not yet paired as NETC — same field as web customer txn summary. */
  inTransitAmount?: number;
}

export interface CustomerTollSummaryResponse {
  count: number;
  result: CustomerTollSummaryRow[];
  balanceSummary?: CustomerBalanceSummary;
  cards?: {
    today?: TollReportPeriodCard;
    yesterday?: TollReportPeriodCard;
    thisWeek?: TollReportPeriodCard;
    thisMonth?: TollReportPeriodCard;
  };
}

export interface IncentiveReportQueryParams {
  customerId?: string;
  monthRange?: string;
  year?: string;
  status?: string | number;
  pageNo?: number;
  pageSize?: number;
}

export interface IncentiveReportRow {
  id: number;
  customerId?: string;
  customerName?: string;
  bankName?: string;
  month?: string;
  year?: string;
  debit?: string | number;
  credit?: string | number;
  baseAmount?: string | number;
  commissionPercentage?: string | number;
  overallAmount?: string | number;
  adjustmentAmount?: string | number;
  totalAmount?: string | number;
  transactionStatus?: string;
  comment?: string;
  updatedAt?: string;
}

export interface IncentiveReportResponse {
  count: number;
  result: IncentiveReportRow[];
}

export interface ReportCustomerOption {
  yapEntityId: string;
  firstName: string;
}

export interface ReportVehicleOption {
  vehicleNo: string;
}

function buildReportParams(params: Record<string, string | number>): Record<string, string | number> {
  const query: Record<string, string | number> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query[key] = value as string | number;
  });
  return query;
}

function exportReportFile(path: string, params: Record<string, string | number>) {
  return apiClient.get<ArrayBuffer>(path, {
    params: buildReportParams(params),
    responseType: 'arraybuffer',
  });
}

export const reportApi = {
  /** Vehicle picker source — web VehicleTxnReportHeader. */
  getCustomerVehicleList: () =>
    apiClient.get<Array<{
      yapEntityId: string;
      firstName: string;
      vehicles: Array<{ vehicleNo: string }>;
    }>>('/transaction/vehicle/customer-vehicle-list'),

  /** Customer picker source — web CustomerTxnReportHeader. */
  getCustomerList: () =>
    apiClient.get<ReportCustomerOption[]>('/transaction/customer/customer-list'),

  /** Vehicle Toll Transactions Summary — web /transaction/vehicle-transaction-report. */
  getVehicleTollSummary: (params: TollReportQueryParams) =>
    apiClient.get<VehicleTollSummaryResponse>(
      '/transaction/vehicle/vehicle-transaction-data',
      { params: buildReportParams(params as Record<string, string | number>) },
    ),

  /** Customer Toll Transactions Summary — web /transaction/customer-transaction-report. */
  getCustomerTollSummary: (params: TollReportQueryParams) =>
    apiClient.get<CustomerTollSummaryResponse>(
      '/transaction/customer/customer-txn-data',
      { params: buildReportParams(params as Record<string, string | number>) },
    ),

  /** Incentive Report — web /transaction/incentive-report (CommissionReport). */
  getIncentiveReport: (params: IncentiveReportQueryParams) =>
    apiClient.get<IncentiveReportResponse>(
      '/transaction/commission',
      { params: buildReportParams(params as Record<string, string | number>) },
    ),

  exportVehicleTollSummaryExcel: (params: Record<string, string | number>) =>
    exportReportFile('/transaction/vehicle/export-vehicle-transactions-excel', params),

  exportVehicleTollSummaryPdf: (params: Record<string, string | number>) =>
    exportReportFile('/transaction/vehicle/export-vehicle-transactions-pdf', params),

  exportCustomerTollSummaryExcel: (params: Record<string, string | number>) =>
    exportReportFile('/transaction/customer/export-customer-txn-excel', params),

  exportCustomerTollSummaryPdf: (params: Record<string, string | number>) =>
    exportReportFile('/transaction/customer/export-customer-txn-pdf', params),

  /** Web CommissionReport — Excel only. */
  exportIncentiveReportExcel: (params: Record<string, string | number>) =>
    exportReportFile('/transaction/commission/export-toll-txn-incentive-data', params),
};
