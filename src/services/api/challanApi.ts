import { apiClient } from './client';
import type { ChallanRecord } from '../../types/dashboard';

export interface ChallanParams {
  customerId?: number;
  vehicleNo?: string;
  // Backend filters server-side on the capitalized status (web parity):
  // 'Pending' | 'Disposed' | 'All'. 'All' is omitted from the query.
  status?: 'Pending' | 'Disposed' | 'All';
  state?: string;
  fromDate?: string;
  toDate?: string;
  pageNo?: number;
  pageSize?: number;
}

// Payment History filters mirror the web ChallanPayment header fields so mobile
// and portal scope the same ledger rows.
export interface ChallanPaymentParams {
  customerId?: number;
  challanNumber?: string;
  vehicleNo?: string;
  requestId?: string;
  paymentStatus?: string;
  pageNo?: number;
  pageSize?: number;
}

// Raw payment-history row from /echallan/payment. Amount fields arrive as
// strings, so the screen coerces them before formatting as currency.
export interface ChallanPaymentRow {
  id: number;
  challanNumber?: string;
  vehicleNo?: string;
  requestId?: string;
  paymentStatus?: string;
  fineImposed?: string | number;
  refundAmount?: string | number;
  convenienceFee?: string | number;
  paymentGatewayFee?: string | number;
  gstFee?: string | number;
  totalAmount?: string | number;
  amountSettledAt?: string;
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
  customer?: { firstName?: string; yapEntityId?: string };
}

export interface ChallanPaymentResponse {
  rows: ChallanPaymentRow[];
  count: number;
}

export interface ChallanPayNowResponse {
  // Finii returns paymentLink; older Razorpay HTML used paymentUrl.
  paymentLink?: string;
  payment_link?: string;
  paymentUrl?: string;
  payment_url?: string;
  url?: string;
  requestId?: string;
  request_id?: string;
  amountDetails?: {
    details?: Array<{ status?: string }>;
  };
  amountDetail?: {
    details?: Array<{ status?: string }>;
  };
}

/** Webhook-backed session status after Finii redirects back with requestId. */
export interface ChallanPaymentStatusResponse {
  requestId?: string;
  challanNumber?: string;
  transactionStatus?: string | null;
  ioStatus?: string | null;
  isSettled?: boolean;
  amountSettledAt?: string | null;
  paymentResult?: 'success' | 'failed' | 'cancelled' | 'initiated' | 'pending' | string;
}

export const challanApi = {
  // Paginated e-Challan ledger — backend lists under /echallan/echallans (GET).
  getList: (params: ChallanParams) =>
    apiClient.get<any>('/echallan/echallans', {
      params: { pageNo: 1, pageSize: 25, ...params },
    }),

  getById: (id: number) =>
    apiClient.get<ChallanRecord>(`/echallan/${id}`),

  search: (vehicleNo: string) =>
    apiClient.get<ChallanRecord[]>('/echallan/search', { params: { vehicleNo } }),

  // Web parity — payment ledger lives at /echallan/payment (returns { rows, count }).
  getPaymentHistory: (params: ChallanPaymentParams) =>
    apiClient.get<ChallanPaymentResponse>('/echallan/payment', {
      params: { pageNo: 1, pageSize: 25, ...params },
    }),

  // Resolves a downloadable receipt URL for a settled payment (web posts the
  // same body); only meaningful when paymentStatus is "Success".
  getPaymentReceipt: (payload: { challanNumber: string; requestId: string }) =>
    apiClient.post<{ url?: string; message?: string }>('/echallan/payment-receipt', payload),

  // Starts Finii checkout — returns paymentLink + requestId (webhook settles later).
  payNow: (payload: { challanNo: string[]; vehicleNo: string }) =>
    apiClient.post<ChallanPayNowResponse>('/echallan/paynow', payload),

  // Web parity — after Finii returnUrl, read webhook-backed status for this session.
  getPaymentStatus: (payload: { requestId: string; challanNumber: string }) =>
    apiClient.post<ChallanPaymentStatusResponse>('/echallan/payment-status', payload),

  // Releases a stale or user-cancelled checkout session on the server.
  cancelPayment: (payload: { requestId: string; challanNumber: string }) =>
    apiClient.post('/echallan/cancel-payment', payload),

  // Live ULIP status probe — returns disposed | pending | unknown string.
  checkStatus: (payload: { vehicleNo: string; challanNo: string }) =>
    apiClient.post<string>('/echallan/check-status', payload, { timeout: 10_000 }),

  getSummary: (customerId?: number) =>
    apiClient.get<any>('/echallan/summary', { params: { customerId } }),
};
