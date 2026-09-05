/**
 * Maps customer profile API rows into the Profile screen view model.
 * FASTag AccNo stays plaintext so customers can fund wallets; PAN/GSTIN
 * (RED-tier KYC) are masked unless the viewer is ADMIN.
 */

import type { CustomerProfileRow, WalletBankDetails } from '../../../services/api/profileApi';
import type { RoleKey } from '../../../types/auth';
import { maskGstin, maskPan, redactRedPii } from '../../../utils/piiProtection';

export interface WalletDetailField {
  label: string;
  value: string;
  upiUrl?: string;
}

export interface VpaItem {
  vId: number | string;
  vrn: string;
  vpa: string;
  upiUrl?: string;
}

export interface CustomerProfileView {
  firstName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  defaultBank: string;
  autoFundThreshold: string;
  lowBalanceThreshold: string;
  /** Top-level KYC — already role-masked. */
  panNumber: string;
  gstNo: string;
  fastagYesBank: WalletDetailField[];
  fastagIdfc: WalletDetailField[];
  corporateYesBank: WalletDetailField[];
  corporateIdfc: WalletDetailField[];
  vpaList: VpaItem[];
}

function mapWalletFields(
  details: WalletBankDetails | undefined,
  roleKey?: RoleKey,
): WalletDetailField[] {
  const fields: WalletDetailField[] = [
    {
      label: 'AccName',
      value: details?.accountName ?? '',
      upiUrl: details?.upiUrl,
    },
    // FASTag collection AccNo must stay readable so the customer can transfer funds.
    // Restricted CustomerBankInfo / agent KYC accounts are masked elsewhere.
    { label: 'AccNo', value: details?.accountNumber ?? '' },
    { label: 'IFSC', value: details?.ifsc ?? '' },
    { label: 'UPI ID', value: details?.upi ?? '', upiUrl: details?.upiUrl },
  ];

  // PAN / GSTIN are RED — only ADMIN sees plaintext when the API returns them.
  if (details?.panNumber?.trim()) {
    fields.push({
      label: 'PAN',
      value: redactRedPii(details.panNumber, roleKey, maskPan),
    });
  }
  if (details?.gstNo?.trim()) {
    fields.push({
      label: 'GSTIN',
      value: redactRedPii(details.gstNo, roleKey, maskGstin),
    });
  }

  return fields;
}

export function mapCustomerProfileRow(
  data: CustomerProfileRow,
  roleKey?: RoleKey,
): CustomerProfileView {
  return {
    firstName: data.firstName ?? '',
    email: data.user?.emailId ?? '',
    phone: data.user?.mobileNumber?.toString() ?? '',
    address: data.address ?? '',
    city: data.city ?? '',
    state: data.state ?? '',
    pincode: data.pincode ?? '',
    defaultBank: data.bankId === 2 ? 'YES Bank' : 'IDFC Bank',
    autoFundThreshold: data.fundTransferThreshold?.toString() ?? '',
    lowBalanceThreshold: data.minimumBalance?.toString() ?? '',
    panNumber: redactRedPii(data.panNumber, roleKey, maskPan),
    gstNo: redactRedPii(data.gstNo, roleKey, maskGstin),
    fastagYesBank: mapWalletFields(data.walletDetails, roleKey),
    fastagIdfc: mapWalletFields(data.idfcWalletDetails, roleKey),
    corporateYesBank: mapWalletFields(data.corporateWalletDetails, roleKey),
    corporateIdfc: mapWalletFields(data.idfcCorporateWalletDetails, roleKey),
    // Same handle as web: NETC.{registration}@LIV for each vehicle on the profile.
    vpaList: (data.vehicles ?? []).map((vehicle) => {
      const vrn = (vehicle.vehicleNo ?? '').trim().toUpperCase();
      return {
        vId: vehicle.id ?? vrn,
        vrn,
        vpa: `NETC.${vrn}@LIV`,
        upiUrl: vehicle.upiUrl,
      };
    }).filter((item) => item.vrn.length > 0),
  };
}

export function hasWalletValues(fields: WalletDetailField[]): boolean {
  return fields.some((f) => f.value.trim().length > 0);
}
