/**
 * Fleet notification types — shared between push delivery and the in-app center.
 */

export interface FleetNotification {
  id: string;
  category: string;
  title: string;
  /** Short one-liner for the in-app inbox list. */
  body: string;
  /**
   * Optional full message used by the system tray (flattened to one line so
   * Android shows everything without expand/collapse). Falls back to `body`.
   */
  detail?: string;
  /**
   * Optional broadcast/banner image URL (absolute or API-relative path).
   * When set, the inbox card and Android tray show the picture.
   */
  image?: string;
  createdAt: string;
  /**
   * Optional schedule window from Admin (same as web TimedBroadcastBanner).
   * When `expiresAt` is set, the dashboard shows a Notice strip until that time.
   */
  scheduledAt?: string | null;
  expiresAt?: string | null;
  read: boolean;
  data?: Record<string, string>;
}
