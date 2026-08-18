/**
 * Remote push / tray payload sanitizer — MASVS-PLATFORM-3.
 *
 * FCM and Notifee tray `data` must not be copied wholesale into
 * notifications_center: allow-list known keys, cap lengths, and validate dates.
 *
 * NEVER use remote `data.screen` to drive navigation — inbox actions must rely
 * on trusted `category` (dashboard/API) only. Locally derived dashboard rows may
 * still attach `screen` via syncDashboardNotifications; that path bypasses this
 * sanitizer intentionally.
 */

/** Keys the app reads from remote notification payloads — no `screen`. */
const REMOTE_DATA_ALLOWLIST = new Set([
  'notificationId',
  'id',
  'category',
  'action',
  'type',
  'page',
  'title',
  'body',
  'description',
  'message',
  'image',
  'imageUrl',
  'picture',
  'photo',
  'createdAt',
  'scheduledAt',
  'expiresAt',
  'announcementId',
  'syncDashboard',
]);

const URL_VALUE_KEYS = new Set(['image', 'imageUrl', 'picture', 'photo']);
const SHORT_VALUE_KEYS = new Set([
  'category',
  'action',
  'type',
  'page',
  'id',
  'notificationId',
  'announcementId',
  'syncDashboard',
]);

const MAX_DEFAULT_VALUE_LENGTH = 512;
const MAX_URL_VALUE_LENGTH = 2048;
const MAX_SHORT_VALUE_LENGTH = 128;

/** Reject createdAt values far outside a realistic delivery window. */
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
const MAX_PAST_MS = 366 * 24 * 60 * 60 * 1000;

function capRemoteDataValue(key: string, value: string): string {
  const maxLength = URL_VALUE_KEYS.has(key)
    ? MAX_URL_VALUE_LENGTH
    : SHORT_VALUE_KEYS.has(key)
      ? MAX_SHORT_VALUE_LENGTH
      : MAX_DEFAULT_VALUE_LENGTH;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/** Parse remote timestamps; fall back to now when missing or implausible. */
export function parsePlausibleNotificationTimestamp(
  raw?: string | null,
): string {
  const fallback = new Date().toISOString();
  if (!raw) return fallback;

  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  const parsedMs = new Date(trimmed).getTime();
  if (!Number.isFinite(parsedMs)) return fallback;

  const now = Date.now();
  if (parsedMs > now + MAX_FUTURE_MS) return fallback;
  if (parsedMs < now - MAX_PAST_MS) return fallback;

  return new Date(parsedMs).toISOString();
}

/** Strip unknown keys and bound remote-controlled strings before MMKV persist. */
export function sanitizeRemoteNotificationData(
  data?: Record<string, unknown> | null,
): Record<string, string> {
  if (!data) return {};

  const sanitized: Record<string, string> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (!REMOTE_DATA_ALLOWLIST.has(key)) return;
    if (value === undefined || value === null) return;

    const asString = typeof value === 'string' ? value.trim() : String(value);
    if (!asString) return;

    sanitized[key] = capRemoteDataValue(key, asString);
  });

  return sanitized;
}
