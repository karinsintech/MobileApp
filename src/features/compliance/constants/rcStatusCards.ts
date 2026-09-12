/**
 * VAHAN RC summary cards — mirrors web VehicleRcsContainer cardData buckets
 * (six expiry tiles + Black List total).
 */

export const RC_CARD_ACCENT = '#0093FF';
export const RC_CARD_WARNING = '#F5A623';
/** Matches web status-expired / Ban accent for the Black List total. */
export const RC_CARD_DANGER = '#F5A623';

/** Status filter value sent to /vehicleRc/rcList for blacklist scope (web parity). */
export const RC_BLACKLIST_STATUS = 'BLACKLIST';

export interface RCExpiryBucket {
  expiringSoon?: number;
  expired?: number;
}

export interface RCExpiryCounts {
  rcFitUpto?: RCExpiryBucket;
  rcTaxUpto?: RCExpiryBucket;
  rcInsuranceUpto?: RCExpiryBucket;
  rcPuccUpto?: RCExpiryBucket;
  rcPermitValidUpto?: RCExpiryBucket;
  rcNpUpto?: RCExpiryBucket;
}

export interface RCExpiryFilter {
  expiryStatus: string;
  expiryType: string;
}

export interface RCSummaryCard {
  key: string;
  title: string;
  icon: string;
  expiryType: string;
  leftFilter: RCExpiryFilter;
  rightFilter: RCExpiryFilter;
  readCounts: (expiry: RCExpiryCounts | null) => { left: number; right: number };
}

/** Six expiry buckets shown on the web RC list — always render all cards with API counts. */
export const RC_SUMMARY_CARDS: RCSummaryCard[] = [
  {
    key: 'fitness',
    title: 'Fitness Expiry',
    icon: '🚛',
    expiryType: 'rcFitUpto',
    leftFilter: { expiryStatus: 'expiring', expiryType: 'rcFitUpto' },
    rightFilter: { expiryStatus: 'expired', expiryType: 'rcFitUpto' },
    readCounts: (expiry) => ({
      left: expiry?.rcFitUpto?.expiringSoon ?? 0,
      right: expiry?.rcFitUpto?.expired ?? 0,
    }),
  },
  {
    key: 'tax',
    title: 'Tax Expiry',
    icon: '💰',
    expiryType: 'rcTaxUpto',
    leftFilter: { expiryStatus: 'expiring', expiryType: 'rcTaxUpto' },
    rightFilter: { expiryStatus: 'expired', expiryType: 'rcTaxUpto' },
    readCounts: (expiry) => ({
      left: expiry?.rcTaxUpto?.expiringSoon ?? 0,
      right: expiry?.rcTaxUpto?.expired ?? 0,
    }),
  },
  {
    key: 'insurance',
    title: 'Insurance Expiry',
    icon: '🛡',
    expiryType: 'rcInsuranceUpto',
    leftFilter: { expiryStatus: 'expiring', expiryType: 'rcInsuranceUpto' },
    rightFilter: { expiryStatus: 'expired', expiryType: 'rcInsuranceUpto' },
    readCounts: (expiry) => ({
      left: expiry?.rcInsuranceUpto?.expiringSoon ?? 0,
      right: expiry?.rcInsuranceUpto?.expired ?? 0,
    }),
  },
  {
    key: 'pucc',
    title: 'PUCC Expiry',
    icon: '☁',
    expiryType: 'rcPuccUpto',
    leftFilter: { expiryStatus: 'expiring', expiryType: 'rcPuccUpto' },
    rightFilter: { expiryStatus: 'expired', expiryType: 'rcPuccUpto' },
    readCounts: (expiry) => ({
      left: expiry?.rcPuccUpto?.expiringSoon ?? 0,
      right: expiry?.rcPuccUpto?.expired ?? 0,
    }),
  },
  {
    key: 'permit',
    title: 'Permit Expiry',
    icon: '📄',
    expiryType: 'rcPermitValidUpto',
    leftFilter: { expiryStatus: 'expiring', expiryType: 'rcPermitValidUpto' },
    rightFilter: { expiryStatus: 'expired', expiryType: 'rcPermitValidUpto' },
    readCounts: (expiry) => ({
      left: expiry?.rcPermitValidUpto?.expiringSoon ?? 0,
      right: expiry?.rcPermitValidUpto?.expired ?? 0,
    }),
  },
  {
    key: 'np',
    title: 'NP Expiry',
    icon: '📜',
    expiryType: 'rcNpUpto',
    leftFilter: { expiryStatus: 'expiring', expiryType: 'rcNpUpto' },
    rightFilter: { expiryStatus: 'expired', expiryType: 'rcNpUpto' },
    readCounts: (expiry) => ({
      left: expiry?.rcNpUpto?.expiringSoon ?? 0,
      right: expiry?.rcNpUpto?.expired ?? 0,
    }),
  },
];

/**
 * Seventh summary tile — single Total count from rcList.blacklistCount.
 * Tap applies status=BLACKLIST (filters on rcBlacklistStatus, not rcStatus).
 */
export const RC_BLACKLIST_CARD = {
  key: 'blacklist',
  title: 'Black List',
  icon: '⛔',
  statusFilter: RC_BLACKLIST_STATUS,
} as const;
