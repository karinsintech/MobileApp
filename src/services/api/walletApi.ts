/**
 * Wallet API — balance, ledger, recharge checkout, and export helpers.
 * Wallet menu merges ledger + recharge for Recent Transactions; the Wallet
 * Transaction Report uses getTransactions only (web parity).
 */

import { apiClient } from './client';
import type { WalletTransaction } from '../../types/dashboard';
import { formatWalletTypeLabel } from '../../utils/walletTypeUtils';

export interface WalletParams {
  customerId?: number | string;
  customerName?: string;
  agentId?: string | number;
  fromDate?: string;
  toDate?: string;
  dateRange?: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth';
  txnType?: string;
  walletType?: string | number;
  pageNo?: number;
  pageSize?: number;
}

export interface WalletTransactionRow {
  id?: number | string;
  txnType?: string;
  txnAmount?: string | number;
  balance?: string | number;
  txnDate?: string;
  txnRefNo?: string;
  txnStatus?: string;
  merchantLocation?: string;
  merchantId?: string;
  walletType?: number;
  type?: number;
  customer?: { firstName?: string; yapEntityId?: string };
}

export type WalletReportRow = WalletTransactionRow;

export interface WalletTransactionResponse {
  rows: WalletTransactionRow[];
  count: number;
  cards?: {
    today?: { creditAmount?: number; debitAmount?: number };
    yesterday?: { creditAmount?: number; debitAmount?: number };
    thisWeek?: { creditAmount?: number; debitAmount?: number };
    thisMonth?: { creditAmount?: number; debitAmount?: number };
  };
}

export interface RechargeTransactionRow {
  id?: number;
  orderId?: string;
  pgTransactionId?: string;
  amount?: string | number;
  createdDate?: string;
  yapStatus?: string;
  zaakpayStatus?: string;
  transferredWalletType?: string;
  receivedFrom?: string;
  customerName?: string;
}

export interface RechargeTransactionResponse {
  rows?: RechargeTransactionRow[];
  count?: number;
}

/** Web /transaction/recharge/process-recharge — initiates Zaakpay checkout. */
export interface ProcessRechargeResponse {
  checkoutUrl?: string;
  orderId?: string;
  rechargeStatus?: string;
  amount?: string | number;
  message?: string;
  paymentMode?: string;
}

/** Web POST /transaction/recharge/check-txn-status response. */
export interface RechargeTxnStatusResponse {
  orderId: string;
  amount?: string | number;
  rechargeStatus?: string;
  message?: string;
  paymentMode?: string;
}

/** Web GET /user/customer-balance — pre-recharge customer validation. */
export interface CustomerBalanceResponse {
  customerId?: string;
  customerName?: string;
  totalBalance?: number;
  fastagBalance?: number;
  corporateBalance?: number;
}

/** Admin recharge header uses this yapEntityId for partner wallet balance. */
export const ADMIN_PARTNER_YAP_ENTITY_ID = 'LQPARTNER20';

/** Backend may nest balance under `data`; mirror web RechargeContainer unwrap. */
export function unwrapCustomerBalance(
  payload: CustomerBalanceResponse | { data?: CustomerBalanceResponse },
): CustomerBalanceResponse {
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data;
  }
  return payload as CustomerBalanceResponse;
}

export interface RechargeQueryParams extends WalletParams {
  orderId?: string;
  type?: string | number;
  yapStatus?: string;
  transferredTo?: string | number;
}

export const walletApi = {
  getBalance: (customerId?: number) =>
    apiClient.get<any>('/transaction/wallet/balance', { params: { customerId } }),

  /** Web parity — /transaction/wallet/wallet-transaction-data */
  getTransactions: (params: WalletParams) =>
    apiClient.get<WalletTransactionResponse>(
      '/transaction/wallet/wallet-transaction-data',
      { params },
    ),

  /** Customer picker for wallet transaction report — web WalletTransactionReportHeader. */
  getCustomerList: () =>
    apiClient.get<Array<{ yapEntityId: string; firstName: string }>>(
      '/transaction/wallet/customer-list',
    ),

  getRecharges: (params: RechargeQueryParams) =>
    apiClient.get<RechargeTransactionResponse>('/transaction/recharge', { params }),

  /** Web parity — POST /transaction/recharge/process-recharge */
  processRecharge: (payload: { amount: string | number; customerId?: string }) =>
    apiClient.post<ProcessRechargeResponse>(
      '/transaction/recharge/process-recharge',
      payload,
    ),

  /** Web parity — POST /transaction/recharge/check-txn-status */
  checkRechargeTxnStatus: (orderId: string) =>
    apiClient.post<RechargeTxnStatusResponse>(
      '/transaction/recharge/check-txn-status',
      { orderId },
    ),

  /** Web parity — GET /user/customer-balance */
  getCustomerBalance: (params: { checkBalance: boolean; yapEntityId: string }) =>
    apiClient.get<CustomerBalanceResponse | { data?: CustomerBalanceResponse }>(
      '/user/customer-balance',
      { params },
    ),

  /** Admin recharge picker — same list as web Recharge page. */
  getFastagUsers: () =>
    apiClient.get<{ data?: Array<{ yapEntityId: string; firstName: string }> }>(
      '/user/fastag-users',
    ),

  exportRechargesExcel: (params: Omit<RechargeQueryParams, 'pageNo' | 'pageSize'>) =>
    apiClient.get<ArrayBuffer>('/transaction/recharge/export-excel', {
      params,
      responseType: 'arraybuffer',
    }),

  exportTransactionsExcel: (params: Omit<WalletParams, 'pageNo' | 'pageSize'>) =>
    apiClient.get<ArrayBuffer>('/transaction/wallet/export-wallet-transactions-excel', {
      params,
      responseType: 'arraybuffer',
    }),

  exportTransactionsPdf: (params: Omit<WalletParams, 'pageNo' | 'pageSize'>) =>
    apiClient.get<ArrayBuffer>('/transaction/wallet/export-wallet-transactions-pdf', {
      params,
      responseType: 'arraybuffer',
    }),
};

export function mapWalletTransactionRow(
  row: WalletTransactionRow,
  index: number,
): WalletTransaction {
  const isFailed = row.txnStatus === 'PAYMENT_FAILURE';
  const isCredit = row.type === 1 && !isFailed;

  return {
    id: index,
    transactionType: isCredit ? 'CR' : 'DR',
    amount: Number(row.txnAmount) || 0,
    description: row.merchantLocation || row.txnType || (isFailed ? 'Payment failed' : 'Wallet transaction'),
    transactionDate: row.txnDate ?? '',
    referenceNo: row.txnRefNo ?? '',
    balance: Number(row.balance) || 0,
    source: 'wallet',
  };
}

/** Maps /transaction/recharge rows into the same list shape as wallet debits/credits. */
export function mapRechargeTransactionRow(
  row: RechargeTransactionRow,
  index: number,
): WalletTransaction {
  const statusText = String(row.yapStatus ?? row.zaakpayStatus ?? '');
  const isFailed = /fail|reject|cancel|error/i.test(statusText);
  const walletLabel = formatWalletTypeLabel(row.transferredWalletType);
  const baseDesc = walletLabel !== '—' ? `Wallet Recharge · ${walletLabel}` : 'Wallet Recharge';

  return {
    id: row.id ?? index,
    transactionType: isFailed ? 'DR' : 'CR',
    amount: Number(row.amount) || 0,
    description: isFailed ? `${baseDesc} (${statusText || 'Failed'})` : baseDesc,
    transactionDate: row.createdDate ?? '',
    referenceNo: row.orderId ?? row.pgTransactionId ?? '',
    balance: 0,
    source: 'recharge',
  };
}

/** Merges wallet + recharge feeds and sorts newest transaction first. */
export function mergeRecentWalletTransactions(
  walletRows: WalletTransaction[],
  rechargeRows: WalletTransaction[],
): WalletTransaction[] {
  return [...walletRows, ...rechargeRows].sort((a, b) => {
    const timeA = Date.parse(a.transactionDate) || 0;
    const timeB = Date.parse(b.transactionDate) || 0;
    return timeB - timeA;
  });
}
