/**
 * Lock / request-screen copy for gated compliance services.
 * Intro “once enabled” block uses a vertical benefit list (VAHAN mock copy).
 */

import type { ServiceAccessKey } from '../../types/serviceAccess';
import type { ServiceAccessIconKey } from './serviceAccessIcons';

export interface ServiceFeatureBullet {
  icon: ServiceAccessIconKey;
  title: string;
  desc: string;
}

export interface ServiceLockCopy {
  serviceKey: ServiceAccessKey;
  /** Sent as serviceName on /auth/service-unlock-request (web parity). */
  serviceLabel: string;
  /** Nav title (e.g. Driver Licence). */
  screenTitle: string;
  /** Header trailing label (e.g. COMPLIANCE). */
  categoryLabel: string;
  brandIcon: ServiceAccessIconKey;
  /** Hero headline (e.g. Driver Licence Validation). */
  heroTitle: string;
  /** Small badge next to hero title (e.g. SARATHI). */
  badge: string;
  tagline: string;
  /** Soft CTA hint above Request Access. */
  ctaHint: string;
  /** Attribution under benefits. */
  poweredBy: string;
  formTitle: string;
  formSub: string;
  defaultMessage: string;
  successDesc: string;
  /** Info callout above Submit on the request form (web vahan-lock__note). */
  requestInfoNote: string;
  /** Benefits shown on the lock intro list. */
  features: ServiceFeatureBullet[];
}

const ECHALLAN_COPY: ServiceLockCopy = {
  serviceKey: 'echallan',
  serviceLabel: 'eChallan',
  screenTitle: 'e-Challan',
  categoryLabel: 'E-CHALLAN',
  brandIcon: 'claims',
  heroTitle: 'e-Challan Management',
  badge: 'ECHALLAN',
  tagline: 'View, track and pay traffic e-Challans across your fleet.',
  ctaHint:
    'eChallan services are not enabled for this account. Request access to activate the service.',
  poweredBy:
    'Powered by authorised e-Challan APIs. All data is fetched through secure integrations.',
  formTitle: 'Request e-Challan Access',
  formSub: 'Share your details and our support team will enable e-Challan services.',
  defaultMessage: 'Please enable eChallan for my account.',
  successDesc: 'Our support team will review and enable e-Challan shortly.',
  requestInfoNote:
    'Our support team will verify your request and enable e-Challan services for your account. You will be notified once it is activated.',
  features: [
    { icon: 'bell', title: 'Get real-time alerts', desc: 'Receive instant notifications on new challans' },
    { icon: 'fileText', title: 'View & manage challans', desc: 'Search, view details and download challans' },
    { icon: 'rupee', title: 'Pay online', desc: 'Pay directly with multiple payment options' },
    { icon: 'chart', title: 'Keep fleet compliant', desc: 'Reduce penalties and maintain clean records' },
    { icon: 'search', title: 'Search by vehicle', desc: 'Find challans across your fleet quickly' },
    { icon: 'creditCard', title: 'Track payments', desc: 'Follow payment status and receipts' },
  ],
};

const VAHAN_COPY: ServiceLockCopy = {
  serviceKey: 'vahan',
  serviceLabel: 'Vahan',
  screenTitle: 'VAHAN RC',
  categoryLabel: 'COMPLIANCE',
  brandIcon: 'truckSolid',
  heroTitle: 'Vehicle RC Validation',
  badge: 'VAHAN',
  tagline: 'Verify vehicle registration, fitness and compliance for your fleet.',
  ctaHint:
    'VAHAN services are not enabled for this account. Request access to activate the service.',
  poweredBy:
    'Powered by Government of India – VAHAN. All data is fetched through authorised APIs.',
  formTitle: 'Request VAHAN Access',
  formSub: '',
  defaultMessage: 'Please enable VAHAN access for my account.',
  successDesc: 'Our support team will review and enable VAHAN shortly.',
  requestInfoNote:
    'Our support team will verify your request and enable VAHAN services for your account. You will be notified once it is activated.',
  // Same six items / copy as the approved “What you can do once enabled” grid.
  features: [
    { icon: 'fileText', title: 'View vehicle details', desc: 'Registration, owner, RC status and more' },
    { icon: 'shield', title: 'Check compliance status', desc: 'Fitness, insurance, permit, PUCC validity' },
    { icon: 'clock', title: 'Get expiry alerts', desc: 'Timely reminders to avoid penalties' },
    { icon: 'download', title: 'Download records', desc: 'View and download VAHAN data for your fleet' },
    { icon: 'ban', title: 'Black list Status', desc: 'Check black list status for vehicles' },
    { icon: 'chart', title: 'Maintain compliant fleet', desc: 'Reduce risk and downtime' },
  ],
};

const SARATHI_COPY: ServiceLockCopy = {
  serviceKey: 'sarathi',
  serviceLabel: 'Sarathi',
  screenTitle: 'Sarathi',
  categoryLabel: 'COMPLIANCE',
  brandIcon: 'idCard',
  heroTitle: 'Driver License',
  badge: 'SARATHI',
  tagline: 'Verify driver licence status, validity and compliance for your fleet.',
  ctaHint:
    'Driver license services are not enabled for this account. Request access to activate the service.',
  poweredBy:
    'Powered by Government of India – SARATHI. All data is fetched through authorised APIs.',
  formTitle: 'Request Sarathi Access',
  formSub: '',
  defaultMessage: 'Please enable Sarathi (Driver Licence) access for my account.',
  successDesc: 'Our support team will review and enable Sarathi shortly.',
  requestInfoNote:
    'Our support team will verify your request and enable SARATHI services for your account. You will be notified once it is activated.',
  features: [
    { icon: 'idCard', title: 'Validate driver licences', desc: 'Check DL status against the Sarathi system' },
    { icon: 'shield', title: 'Compliance-ready records', desc: 'Keep assignment checks ahead of incidents' },
    { icon: 'clock', title: 'Expiry alerts', desc: 'NT / TR / HZ / HL renewal windows ahead of time' },
    { icon: 'users', title: 'Fleet driver registry', desc: 'Link licences to customers for ops visibility' },
    { icon: 'warning', title: 'Suspended / inactive flags', desc: 'Surface licences that need a second look' },
    { icon: 'building', title: 'Centralised fleet view', desc: 'One place for driver licence compliance' },
  ],
};

const GENERIC_COPY: ServiceLockCopy = {
  serviceKey: 'fastag',
  serviceLabel: 'this service',
  screenTitle: 'Service',
  categoryLabel: 'SERVICE',
  brandIcon: 'lock',
  heroTitle: 'Service Access',
  badge: 'KARINS',
  tagline: 'Request access to unlock this feature for your account.',
  ctaHint: 'This service is not enabled for this account. Request access to activate it.',
  poweredBy: 'Powered by Karins Fleet. Data is fetched through authorised APIs.',
  formTitle: 'Contact Support',
  formSub: 'Share your details and our team will follow up.',
  defaultMessage: 'Please enable this service for my account.',
  successDesc: 'Our support team will reach out shortly.',
  requestInfoNote:
    'Our support team will verify your request and enable this service for your account. You will be notified once it is activated.',
  features: [
    { icon: 'shield', title: 'Secure access', desc: 'Enable the service for your enrolled account' },
    { icon: 'fileText', title: 'Fleet visibility', desc: 'Use the feature across your vehicles' },
    { icon: 'bell', title: 'Stay informed', desc: 'Get updates once access is granted' },
    { icon: 'search', title: 'Quick lookup', desc: 'Find records when you need them' },
    { icon: 'chart', title: 'Operational insight', desc: 'Keep your fleet running smoothly' },
    { icon: 'check', title: 'Ready when enabled', desc: 'Start using the service after approval' },
  ],
};

export function getServiceLockCopy(serviceKey: ServiceAccessKey): ServiceLockCopy {
  switch (serviceKey) {
    case 'echallan':
      return ECHALLAN_COPY;
    case 'vahan':
      return VAHAN_COPY;
    case 'sarathi':
      return SARATHI_COPY;
    default:
      return { ...GENERIC_COPY, serviceKey, serviceLabel: serviceKey };
  }
}
