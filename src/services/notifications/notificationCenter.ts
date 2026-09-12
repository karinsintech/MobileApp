/**
 * Local notification inbox for the mobile bell.
 *
 * Two sources (same idea as karins_fastag_react fleet bell):
 * 1. Dashboard-derived alerts (wallet, challan, RC, …) — local, today-scoped
 * 2. Admin type=1 broadcasts — fetched from GET /notification; new unread rows
 *    also surface as system tray pushes via Notifee (FCM optional if backend sends)
 */

import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { API_BASE_URL } from '../../config/env';
import { Cache } from '../storage/SecureStorage';
import { notificationApi, type NotificationListRow } from '../api/notificationApi';
import type { FleetNotification } from './notificationTypes';
import { notificationEvents } from './notificationEvents';
import {
  parsePlausibleNotificationTimestamp,
  sanitizeRemoteNotificationData,
} from './sanitizeRemoteNotificationData';

export const NOTIFICATIONS_CACHE_KEY = 'notifications_center';
const NOTIFICATIONS_IMAGE_FIX_KEY = 'notifications_center_image_fix';
/** Bump when image URL rules change so stale rewritten paths are dropped. */
const NOTIFICATIONS_IMAGE_FIX_VERSION = 7;
const MAX_STORED_NOTIFICATIONS = 200;

/** Prefix for alerts derived from the dashboard summary. */
export const DASHBOARD_NOTIFICATION_ID_PREFIX = 'dash-';

/** Broadcast rows synced from Node GET /notification. */
export const BROADCAST_CATEGORY = 'broadcast';

function isEmptyImageValue(value: string): boolean {
  return !value
    || value === 'null'
    || value === 'undefined'
    || value === 'None';
}

/** `/uploads/notification/foo.jpg` → `/uploads/foo.jpg` (matches Express static mount). */
function rewriteStoredUploadsPath(urlOrPath: string): string {
  return urlOrPath.replace(/\/uploads\/notification\/([^/?#]+)/gi, '/uploads/$1');
}

function extractUploadsBasename(image: string): string | null {
  const match = String(image).match(/\/uploads\/(?:notification\/)?([^/?#]+)/i);
  return match?.[1] ?? null;
}

/**
 * Ordered image URL candidates — same chain as web resolveNotificationImageUrl.
 * Backend stores `/uploads/notification/<file>` but Express serves that folder at
 * `/uploads` and `/api/uploads`, so the live path is `/uploads/<file>`.
 */
export function getNotificationImageCandidates(image?: string | null): string[] {
  if (image == null) return [];

  const trimmed = String(image).trim();
  if (isEmptyImageValue(trimmed)) return [];

  // data: URIs are already displayable — never rewrite them through the API host.
  if (trimmed.startsWith('data:')) return [trimmed];

  const candidates: string[] = [];
  const pushUnique = (url: string | null | undefined) => {
    const value = String(url || '').trim();
    if (!value || candidates.includes(value)) return;
    candidates.push(value);
  };

  const apiOrigin = API_BASE_URL.replace(/\/api\/?$/i, '');
  const basename = extractUploadsBasename(trimmed);

  // Absolute URL first (after mount rewrite) — some older rows already stored full URLs.
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    pushUnique(rewriteStoredUploadsPath(trimmed));
  }

  // Express static mounts (notification dir → /uploads and /api/uploads).
  if (basename && apiOrigin) {
    pushUnique(`${apiOrigin}/uploads/${basename}`);
    pushUnique(`${apiOrigin}/api/uploads/${basename}`);
  }

  // Relative DB path rewritten to match the mount.
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && trimmed.includes('/')) {
    const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    pushUnique(`${apiOrigin}${rewriteStoredUploadsPath(withSlash)}`);
  }

  return candidates;
}

/** First usable URL — identical to web Admin / Customer bell helpers. */
export function resolveNotificationImageUrl(image?: string | null): string | null {
  return getNotificationImageCandidates(image)[0] ?? null;
}

/** Operational alerts — stay visible while the underlying issue exists (web bell parity). */
export const CONDITION_BASED_DASHBOARD_IDS = new Set([
  'dash-wallet',
  'dash-compliance',
  'dash-challans',
  'dash-drivers',
  'dash-claims',
]);

export function isConditionBasedDashboardRow(row: FleetNotification): boolean {
  return CONDITION_BASED_DASHBOARD_IDS.has(row.id);
}

function startOfLocalDay(date = new Date()): Date {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart;
}

function isCreatedToday(createdAt: string): boolean {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() >= startOfLocalDay().getTime();
}

function isBroadcastRow(row: FleetNotification): boolean {
  return (
    row.category === BROADCAST_CATEGORY ||
    row.data?.type === '1' ||
    row.data?.page === '1'
  );
}

function isDashboardRow(row: FleetNotification): boolean {
  return row.id.startsWith(DASHBOARD_NOTIFICATION_ID_PREFIX);
}

/**
 * Keep dashboard alerts for today only.
 * Broadcasts always stay in the local inbox (read + unread) — pruning read
 * rows on click made cards vanish when createdAt parsing/timezone failed.
 */
function pruneInbox(items: FleetNotification[]): FleetNotification[] {
  return items.filter((row) => {
    if (isBroadcastRow(row)) return true;
    if (isDashboardRow(row)) return isCreatedToday(row.createdAt);
    return isCreatedToday(row.createdAt);
  });
}

/** Milliseconds for inbox ordering — schedule time when present, else createdAt. */
function notificationSortTimeMs(row: FleetNotification): number {
  const raw = row.scheduledAt || row.createdAt;
  const parsed = new Date(String(raw ?? '')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Align the inbox strictly by date/time — newest first, oldest last.
 * No type priority (admin vs DL/challan); only the timestamp decides order.
 */
function sortNotificationsNewestFirst(
  items: FleetNotification[],
): FleetNotification[] {
  return [...items].sort((a, b) => {
    const delta = notificationSortTimeMs(b) - notificationSortTimeMs(a);
    if (delta !== 0) return delta;
    return String(b.id).localeCompare(String(a.id));
  });
}

function isBrokenMediaRouteUrl(value?: string | null): boolean {
  const raw = String(value ?? '');
  return /\/notification\/\d+\/image\/?$/i.test(raw)
    || /\/api\/notification\/\d+\/image\/?$/i.test(raw);
}

/**
 * Drop rewritten media-route URLs from an older app build so the next API sync
 * can restore real `/uploads/notification/...` paths. Prefer keeping the raw
 * relative path in cache — resolve to host URLs only at display time.
 */
function sanitizeNotificationImageFields(
  items: FleetNotification[],
): FleetNotification[] {
  return items.map((row) => {
    const next = { ...row, data: row.data ? { ...row.data } : undefined };
    if (isBrokenMediaRouteUrl(next.image)) {
      next.image = undefined;
    }
    if (next.data?.image && isBrokenMediaRouteUrl(next.data.image)) {
      delete next.data.image;
    }
    // Prefer a usable uploads path still sitting in data — store raw, not absolute.
    if (!next.image && next.data?.image && !isBrokenMediaRouteUrl(next.data.image)) {
      next.image = next.data.image;
    }
    return next;
  });
}

export function loadNotifications(): FleetNotification[] {
  const stored = Cache.getJSON<FleetNotification[]>(NOTIFICATIONS_CACHE_KEY) ?? [];
  const fixVersion = Cache.getString(NOTIFICATIONS_IMAGE_FIX_KEY);
  let items = pruneInbox(stored);

  // One-time scrub of bad image URLs left by earlier resolve rewrites.
  if (fixVersion !== String(NOTIFICATIONS_IMAGE_FIX_VERSION)) {
    items = sanitizeNotificationImageFields(items);
    saveNotifications(items);
    Cache.set(NOTIFICATIONS_IMAGE_FIX_KEY, String(NOTIFICATIONS_IMAGE_FIX_VERSION));
  } else if (items.length !== stored.length) {
    saveNotifications(items);
  }

  // Newest first even when cache was written by an older build.
  return sortNotificationsNewestFirst(items);
}

export function saveNotifications(items: FleetNotification[]): void {
  // Persist newest-first so every sync/upsert path shows the same order.
  const pruned = sortNotificationsNewestFirst(pruneInbox(items));
  Cache.setJSON(NOTIFICATIONS_CACHE_KEY, pruned.slice(0, MAX_STORED_NOTIFICATIONS));
}

/** Stable fingerprint so we can skip emit/save when a sync changed nothing. */
function inboxFingerprint(items: FleetNotification[]): string {
  // Sort by id — derived sync and broadcast sync reorder the array differently.
  return [...items]
    .map((row) =>
      [
        row.id,
        row.title,
        row.body,
        row.detail ?? '',
        row.read ? '1' : '0',
        row.image ?? '',
        row.expiresAt ?? '',
        row.scheduledAt ?? '',
      ].join('\u001f'),
    )
    .sort()
    .join('\u001e');
}

/** Badge count — unread only (condition-based ops alerts always count while present). */
export function getUnreadNotificationCount(): number {
  return loadNotifications().filter((row) => {
    if (isConditionBasedDashboardRow(row)) return true;
    return !row.read;
  }).length;
}

/**
 * Full inbox list: keep opened rows visible (light) instead of removing them.
 * Badge unread count is separate via getUnreadNotificationCount.
 * Always newest-first — covers caches written before sorted save landed.
 */
export function getVisibleNotifications(): FleetNotification[] {
  return sortNotificationsNewestFirst(loadNotifications());
}

export function upsertNotification(item: FleetNotification): FleetNotification[] {
  if (isDashboardRow(item) && !isCreatedToday(item.createdAt)) {
    return loadNotifications();
  }

  const existing = loadNotifications();
  const index = existing.findIndex((row) => row.id === item.id);
  const next =
    index >= 0
      ? existing.map((row, i) =>
          i === index
            ? {
                ...row,
                ...item,
                // Keep prior artwork if a later upsert omits image (e.g. tray sync),
                // but never keep a broken rewritten media-route URL.
                image:
                  item.image
                  ?? (isBrokenMediaRouteUrl(row.image) ? undefined : row.image),
                read: row.read,
              }
            : row,
        )
      : [item, ...existing];

  saveNotifications(next);
  notificationEvents.emit();
  return loadNotifications();
}

/**
 * Replace dashboard-derived alerts; leave broadcast (API) rows in place.
 */
export function syncDerivedNotifications(
  derived: FleetNotification[],
): FleetNotification[] {
  const existing = loadNotifications();
  const nonDashboard = existing.filter((row) => !isDashboardRow(row));

  const mergedDerived = derived.map((item) => {
    const prior = existing.find((row) => row.id === item.id);
    // Keep the first-seen timestamp so date sorting stays stable across polls
    // (otherwise every sync stamps “now” and DL/wallet cards jump above older admin rows).
    const createdAt = prior?.createdAt ?? item.createdAt;

    // Wallet/challan/compliance alerts must not stay “read” after mark-all — issue still open
    if (isConditionBasedDashboardRow(item)) {
      return { ...item, createdAt, read: false };
    }
    return prior ? { ...item, createdAt, read: prior.read } : item;
  });

  const next = [...mergedDerived, ...nonDashboard];
  // Avoid notification-menu flicker when dashboard/badge poll re-writes the same rows.
  if (inboxFingerprint(existing) === inboxFingerprint(next)) {
    return existing;
  }

  saveNotifications(next);
  notificationEvents.emit();
  return loadNotifications();
}

function mapApiRowToFleetNotification(row: NotificationListRow): FleetNotification {
  const fullText = String(row.description ?? '');
  const shortBody =
    fullText.length > 90 ? `${fullText.substring(0, 90)}…` : fullText || row.text || '';

  // Prefer schedule time when present so timed Notice items match web ordering.
  const createdAt = row.scheduledAt || row.createdAt
    ? new Date(String(row.scheduledAt || row.createdAt)).toISOString()
    : new Date().toISOString();

  const scheduledAt = row.scheduledAt
    ? new Date(row.scheduledAt).toISOString()
    : null;
  const expiresAt = row.expiresAt
    ? new Date(row.expiresAt).toISOString()
    : null;

  // Store the raw API path (or absolute URL). Resolve to host URL only at display
  // time so we never persist a rewritten/broken media route in cache.
  const rawImage = String(row.image ?? row.image_path ?? '').trim() || null;
  const image = rawImage && !isBrokenMediaRouteUrl(rawImage) ? rawImage : undefined;

  return {
    id: String(row.id),
    category: BROADCAST_CATEGORY,
    title: row.text || 'Notification',
    body: shortBody,
    detail: fullText || shortBody || undefined,
    image,
    createdAt,
    scheduledAt,
    expiresAt,
    read: Boolean(row.isRead),
    data: {
      type: String(row.type ?? 1),
      page: '1',
      notificationId: String(row.id),
      ...(image ? { image } : {}),
      ...(scheduledAt ? { scheduledAt } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    },
  };
}

/**
 * Pull type=1 broadcasts from Node (same as web fleet bell).
 * Always replaces local broadcast rows so image paths stay in sync with API.
 * Newly arrived unread admin rows are also shown as OS push banners.
 */
export async function syncBroadcastNotificationsFromApi(): Promise<FleetNotification[]> {
  try {
    const rows = await notificationApi.list(50);
    const broadcasts = rows.map(mapApiRowToFleetNotification);

    const existing = loadNotifications();
    const dashboardAndOther = existing.filter((row) => !isBroadcastRow(row));

    // Preserve local read state when API omits isRead, but never keep stale images.
    const mergedBroadcasts = broadcasts.map((item) => {
      const prior = existing.find((row) => row.id === item.id);
      if (!prior) return item;
      return {
        ...item,
        // API image wins; only keep prior artwork when API row has none.
        image: item.image ?? prior.image,
        data: {
          ...(prior.data ?? {}),
          ...(item.data ?? {}),
          ...(item.image
            ? { image: item.image }
            : prior.data?.image && !isBrokenMediaRouteUrl(prior.data.image)
              ? { image: prior.data.image }
              : {}),
        },
        read: item.read || prior.read,
      };
    });

    const next = [...mergedBroadcasts, ...dashboardAndOther];
    const changed = inboxFingerprint(existing) !== inboxFingerprint(next);
    if (changed) {
      saveNotifications(next);
      notificationEvents.emit();
    }

    // Dynamic import avoids a circular dep with pushService → notificationCenter.
    void import('./localFleetNotificationService')
      .then(({ showNewBroadcastPushes }) => showNewBroadcastPushes(mergedBroadcasts))
      .catch(() => undefined);

    return changed ? loadNotifications() : existing;
  } catch (error) {
    if (__DEV__) {
      console.warn('[Notifications] API sync failed — showing cached inbox', error);
    }
    return loadNotifications();
  }
}

export function markNotificationRead(id: string): FleetNotification[] {
  // Mark opened — do not remove; UI switches unread (dark) → read (light).
  const existing = loadNotifications();
  const next = existing.map((row) => (row.id === id ? { ...row, read: true } : row));

  saveNotifications(next);
  notificationEvents.emit();
  return loadNotifications();
}

export function markAllNotificationsRead(): FleetNotification[] {
  const existing = loadNotifications();
  // Mark-all opens every row except condition-based ops alerts (issue still open).
  const next = existing.map((row) => {
    if (isConditionBasedDashboardRow(row)) {
      return { ...row, read: false };
    }
    return { ...row, read: true };
  });

  saveNotifications(next);
  notificationEvents.emit();
  return loadNotifications();
}

/** Soft-remove one inbox row locally (after DELETE /notification/delete-for-user/:id). */
export function removeNotification(id: string): FleetNotification[] {
  const next = loadNotifications().filter((row) => row.id !== id);
  saveNotifications(next);
  notificationEvents.emit();
  return loadNotifications();
}

/**
 * Active timed Notice banners — same rule as web TimedBroadcastBanner:
 * only type=1 broadcasts that still have a future expiresAt.
 */
export function getTimedBroadcastNotices(now = Date.now()): FleetNotification[] {
  return getVisibleNotifications().filter((row) => {
    if (!isBroadcastRow(row)) return false;
    if (!row.expiresAt) return false;
    const ends = new Date(row.expiresAt).getTime();
    return Number.isFinite(ends) && ends > now;
  });
}

/** Persist a Notifee tray alert into the inbox with remote payload bounds applied. */
export function fleetNotificationFromTrayPayload(input: {
  id: string;
  title?: string | null;
  body?: string | null;
  data?: Record<string, unknown> | null;
}): FleetNotification {
  const data = sanitizeRemoteNotificationData(input.data);
  // Keep raw path — resolve + mount rewrite happens only when rendering.
  const rawImage = String(
    data.image ?? data.imageUrl ?? data.picture ?? data.photo ?? '',
  ).trim();
  const image = rawImage && !isBrokenMediaRouteUrl(rawImage) && !isEmptyImageValue(rawImage)
    ? rawImage
    : undefined;
  const scheduledAt = data.scheduledAt ?? null;
  const expiresAt = data.expiresAt ?? null;

  return {
    id: input.id,
    category: String(data.category ?? data.type ?? 'product_update'),
    title: input.title ?? data.title ?? 'Karins Fleet',
    body: input.body ?? data.body ?? '',
    image,
    createdAt: parsePlausibleNotificationTimestamp(
      data.createdAt ?? scheduledAt,
    ),
    scheduledAt,
    expiresAt,
    read: false,
    data,
  };
}

/** Maps FCM payloads into inbox rows (admin broadcast or category alert). */
export function mapRemoteMessageToNotification(
  message: FirebaseMessagingTypes.RemoteMessage,
): FleetNotification {
  const data = sanitizeRemoteNotificationData(message.data);
  const id = String(data.notificationId ?? data.id ?? message.messageId ?? Date.now());

  const isBroadcast =
    data.category === 'broadcast' ||
    data.action === 'admin_broadcast' ||
    data.type === '1' ||
    data.page === '1';

  const title =
    message.notification?.title ?? data.title ?? 'Karins Fleet';

  const fullText = String(
    data.description ?? data.message ?? message.notification?.body ?? data.body ?? '',
  );
  const shortBody = String(
    data.body ?? (fullText.length > 90 ? `${fullText.substring(0, 90)}…` : fullText) ?? '',
  );

  // FCM payloads may send image under several keys used by admin / web push.
  // Store the raw value so inbox rendering can rewrite /uploads/notification → /uploads.
  const rawImage = String(
    data.image ?? data.imageUrl ?? data.picture ?? data.photo ?? '',
  ).trim();
  const image = rawImage && !isBrokenMediaRouteUrl(rawImage) && !isEmptyImageValue(rawImage)
    ? rawImage
    : undefined;

  const scheduledAt = data.scheduledAt ?? null;
  const expiresAt = data.expiresAt ?? null;

  return {
    id,
    category: isBroadcast
      ? BROADCAST_CATEGORY
      : String(data.category ?? data.type ?? 'product_update'),
    title,
    body: shortBody || title,
    detail: fullText || shortBody || undefined,
    image,
    createdAt: parsePlausibleNotificationTimestamp(
      data.createdAt ?? scheduledAt,
    ),
    scheduledAt,
    expiresAt,
    read: false,
    data,
  };
}
