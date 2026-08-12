/**
 * Derives fleet alerts from the dashboard summary (due / finished work) and
 * mirrors them into the local notification inbox — same rules as the web portal.
 *
 * Each alert sets a short `body` for the in-app inbox summary and a multi-line
 * `detail` for the full message. The system tray flattens `detail` into one
 * visible line so OEMs do not hide content behind expand/collapse.
 */

import type { Announcement, ComplianceSummary, DashboardSummary } from '../../types/dashboard';
import { formatINR } from '../../utils/format';
import { getDriverOpenAlertCount } from '../../features/dashboard/utils/dashboardSummaryUtils';
import { getComplianceExpiringCount } from '../../features/compliance/utils/complianceNavigationUtils';
import type { FleetNotification } from './notificationTypes';
import { syncDerivedNotifications } from './notificationCenter';
import { isCategoryAlertsEnabled } from './notificationPreferences';
import { showDerivedFleetPush } from './localFleetNotificationService';
import { evaluateWalletLowBalance, type WalletAlertScope } from './walletAlertUtils';

const COMPLIANCE_DOC_KEYS: (keyof Omit<ComplianceSummary, 'totalAlerts' | 'totalVehicles'>)[] = [
  'fitness', 'insurance', 'pucc', 'permit', 'tax', 'np',
];

/** Same six docs / labels as the dashboard Vahan Compliance card. */
const COMPLIANCE_DOC_ROWS: {
  key: keyof Omit<ComplianceSummary, 'totalAlerts' | 'totalVehicles'>;
  label: string;
}[] = [
  { key: 'fitness', label: 'Fitness' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'pucc', label: 'PUCC' },
  { key: 'permit', label: 'Permit' },
  { key: 'tax', label: 'Tax' },
  { key: 'np', label: 'NP' },
];

function sumExpiredCompliance(compliance: DashboardSummary['compliance']): number {
  return COMPLIANCE_DOC_KEYS.reduce(
    (sum, key) => sum + (compliance[key]?.expired ?? 0),
    0,
  );
}

/** Expiring = 7/15/30-day buckets (or legacy expiringSoon), same as the Compliance card. */
function sumExpiringCompliance(compliance: DashboardSummary['compliance']): number {
  return COMPLIANCE_DOC_KEYS.reduce((sum, key) => {
    const item = compliance[key];
    const bucketed = getComplianceExpiringCount(item);
    if (bucketed > 0) return sum + bucketed;
    return sum + (item?.expiringSoon ?? 0);
  }, 0);
}

/**
 * One line per VAHAN doc: expired / expiring-30d / valid — matches the
 * Compliance card count columns so the inbox mirrors fleet health at a glance.
 */
function formatComplianceStatusCounts(compliance: DashboardSummary['compliance']): string {
  return COMPLIANCE_DOC_ROWS.map(({ key, label }) => {
    const item = compliance[key];
    const expired = item?.expired ?? 0;
    // Prefer the 30-day bar segment; fall back to bucketed/legacy when API omits exp30.
    const expiring = item?.exp30 ?? item?.expiringSoon ?? getComplianceExpiringCount(item);
    return `${label}: ${expired}/${expiring}`;
  }).join('\n');
}

function normalizeAnnouncements(value: unknown): Announcement[] {
  return Array.isArray(value) ? value : [];
}

/** Build inbox rows for wallet, compliance, challans, drivers, claims, and news. */
export function deriveDashboardNotifications(
  summary: DashboardSummary,
  scope?: WalletAlertScope,
): FleetNotification[] {
  const out: FleetNotification[] = [];
  // Stamp with wall-clock “now” so active alerts land in today’s daily inbox
  // even when the dashboard summary cache still carries yesterday’s generatedAt.
  const now = new Date().toISOString();
  const wallet = summary.wallet;
  const walletAlert = evaluateWalletLowBalance(wallet, scope);
  const walletThreshold = walletAlert.alertThreshold;

  if (walletAlert.isLow && isCategoryAlertsEnabled('low_wallet')) {
    const walletDetail = walletAlert.isEmpty
      ? 'FASTag wallet is empty.\nRecharge immediately to avoid toll failures.'
      : [
          `Balance: ${formatINR(walletAlert.totalBalance)}`,
          `Alert limit: ${formatINR(walletThreshold)}`,
          'Recharge to avoid toll failures.',
        ].join('\n');
    // Collapsed banner stays one line; expand shows balance / limit detail.
    const walletBody = walletAlert.isEmpty
      ? 'FASTag wallet is empty — recharge now'
      : `Balance ${formatINR(walletAlert.totalBalance)}, limit ${formatINR(walletThreshold)}`;

    out.push({
      id: 'dash-wallet',
      category: 'low_wallet',
      title: walletAlert.isEmpty ? 'FASTag wallet empty' : 'Wallet low',
      body: walletBody,
      detail: walletDetail,
      createdAt: now,
      read: false,
    });
  }

  const expiredCompliance = sumExpiredCompliance(summary.compliance);
  const expiringCompliance = sumExpiringCompliance(summary.compliance);
  // Surface VAHAN whenever expired or expiring docs need attention.
  if (
    (expiredCompliance > 0 || expiringCompliance > 0)
    && isCategoryAlertsEnabled('rc_expiry')
  ) {
    const complianceDetail = formatComplianceStatusCounts(summary.compliance);
    out.push({
      id: 'dash-compliance',
      category: 'rc_expiry',
      title: 'Vahan Compliance',
      body: `Expired ${expiredCompliance}, Expiring ${expiringCompliance}`,
      detail: complianceDetail,
      createdAt: now,
      read: false,
      data: { screen: 'RCList' },
    });
  }

  const pendingChallans = summary.challans?.pendingCount ?? 0;
  if (pendingChallans > 0 && isCategoryAlertsEnabled('echallan')) {
    const dueAmount = formatINR(summary.challans.pendingAmount);
    out.push({
      id: 'dash-challans',
      category: 'echallan',
      title: 'E-challan',
      body: `${pendingChallans} pending, ${dueAmount}`,
      detail: [
        `Pending Challans: ${pendingChallans}`,
        `Due Amount: ${dueAmount}`,
      ].join('\n'),
      createdAt: now,
      read: false,
      data: { screen: 'ChallanList' },
    });
  }

  const driverAlertCount = getDriverOpenAlertCount(summary.drivers);
  if (driverAlertCount > 0 && isCategoryAlertsEnabled('dl_expiry')) {
    const suspended = summary.drivers.suspended ?? 0;
    const expiring = summary.drivers.expiringSoon ?? 0;
    const expired = summary.drivers.expired ?? 0;
    // Short collapsed summary — avoids OEM trays showing only "Expired: N".
    const driverBody = `${driverAlertCount} need attention, ${expired} expired`;
    const driverDetail = [
      `${driverAlertCount} need attention`,
      `Suspended: ${suspended}`,
      `Expiring: ${expiring}`,
      `Expired: ${expired}`,
    ].join('\n');
    out.push({
      id: 'dash-drivers',
      category: 'dl_expiry',
      title: 'Driver License',
      body: driverBody,
      detail: driverDetail,
      createdAt: now,
      read: false,
      data: { screen: 'DLList' },
    });
  }

  const approvedClaims = summary.claims?.approved ?? 0;
  if (approvedClaims > 0 && isCategoryAlertsEnabled('claim_update')) {
    const recovered = formatINR(summary.claims.recoveredFY);
    out.push({
      id: 'dash-claims',
      category: 'claim_update',
      title: 'Claim',
      body: `${approvedClaims} claim${approvedClaims > 1 ? 's' : ''} approved, ${recovered}`,
      detail: [
        `${approvedClaims} toll claim${approvedClaims > 1 ? 's' : ''} approved`,
        `Recovered Amount: ${recovered}`,
      ].join('\n'),
      createdAt: now,
      read: false,
      data: { screen: 'ClaimsList', initialFilter: 'APPROVED' },
    });
  }

  normalizeAnnouncements(summary.announcements)
    .filter((item) => item.showAsDashboardAlert)
    .forEach((item) => {
      const announcementBody =
        item.message || (item.category ? `Update, ${item.category}` : 'Karins update');
      // Keep announcement body as the collapsed line; detail mirrors for expand.
      out.push({
        id: `dash-announcement-${item.id}`,
        category: 'product_update',
        title: item.title,
        body: announcementBody,
        detail: announcementBody,
        // Daily feed: announce today while the dashboard still flags the alert.
        createdAt: now,
        read: false,
        data: { announcementId: String(item.id) },
      });
    });

  return out;
}

/** Refresh dashboard-sourced alerts whenever the fleet summary changes. */
export function syncDashboardNotifications(
  summary: DashboardSummary | null | undefined,
  scope?: WalletAlertScope,
  options?: { alertTray?: boolean },
): void {
  if (!summary) return;

  const derived = deriveDashboardNotifications(summary, scope);
  syncDerivedNotifications(derived);

  // Inbox/badge refreshes update local rows only — tray heads-up is dashboard-owned
  // so open-app fan-out does not keep re-posting the same alerts.
  if (options?.alertTray === false) return;

  // Defer tray posts until after the first paint — posting Notifee during the
  // login→dashboard transition native-crashes several OEM phones.
  const rows = [...derived];
  setTimeout(() => {
    rows.forEach((row) => {
      showDerivedFleetPush(row).catch(() => undefined);
    });
  }, 1500);
}
