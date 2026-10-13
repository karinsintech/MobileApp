/**
 * Service enrollment access — mirrors web ServiceFeatureGate /
 * GET /auth/service-access flags from customer_service enrollment.
 */

export type ServiceAccessKey =
  | 'vahan'
  | 'echallan'
  | 'sarathi'
  | 'fastag'
  | 'jiobp';

export interface ServiceAccessResponse {
  success?: boolean;
  access?: Partial<Record<ServiceAccessKey, boolean>>;
  emailId?: string;
  name?: string;
  mobileNumber?: string | number;
}

export interface ServiceUnlockRequestPayload {
  serviceName: string;
  name: string;
  mobileNumber: string;
  message: string;
}

export interface ServiceUnlockRequestResponse {
  success?: boolean;
  enquiryId?: number | null;
  message?: string;
}
