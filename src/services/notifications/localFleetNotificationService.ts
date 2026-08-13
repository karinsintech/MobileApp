/**
 * Shows dashboard-derived and admin broadcast alerts in the OS notification tray (Notifee)
 * and raises web-parity arrival cues (summary toast + optional detail popup).
 * In-app inbox rows are written separately — this layer handles tray + toast delivery.
 */

import { AppState } from 'react-native';
import { pushService } from './pushService';
import { isCategoryAlertsEnabled } from './notificationPreferences';
import { broadcastPopupEvents } from './broadcastPopupEvents';
import { broadcastArrivalEvents } from './broadcastArrivalEvents';
import {
  getBroadcastPushedIds,
  getSessionBroadcastBaselineMs,
  isBroadcastPushSeeded,
  markBroadcastPushSeeded,
  markBroadcastPushShown,
  persistBroadcastPushedIds,
} from './broadcastPushDedupe';
import type { FleetNotification } from './notificationTypes';
import { Cache } from '../storage/SecureStorage';

const DERIVED_PUSH_COOLDOWNS_KEY = 'derived_push_cooldowns';
const DERIVED_PUSH_COOLDOWN_MS = 4 * 60 * 60 * 1000;

type CooldownMap = Record<string, { body: string; at: string }>;

function loadCooldowns(): CooldownMap {
  return Cache.getJSON<CooldownMap>(DERIVED_PUSH_COOLDOWNS_KEY) ?? {};
}

function saveCooldown(id: string, body: string): void {
  const next = { ...loadCooldowns(), [id]: { body, at: new Date().toISOString() } };
  Cache.setJSON(DERIVED_PUSH_COOLDOWNS_KEY, next);
}

function isOnCooldown(id: string, body: string): boolean {
  const entry = loadCooldowns()[id];
  if (!entry || entry.body !== body || !entry.at) return false;
  return Date.now() - new Date(entry.at).getTime() < DERIVED_PUSH_COOLDOWN_MS;
}

/** Display a dashboard-derived alert in the system tray when its category toggle is on. */
export async function showDerivedFleetPush(notification: FleetNotification): Promise<void> {
  if (!isCategoryAlertsEnabled(notification.category)) return;

  // Same alert already shown recently — do not rewrite the tray row.
  // (onlyAlertOnce still updates the shade on many OEMs and looks like spam.)
  if (isOnCooldown(notification.id, notification.body)) return;

  // Claim cooldown before await so parallel dashboard/badge refreshes cannot double-post.
  saveCooldown(notification.id, notification.body);

  await pushService.displayLocalNotification(notification, {
    onlyAlertOnce: false,
  });
}

/**
 * Turn newly synced admin (type=1) broadcasts into tray + web-style arrival toast.
 * First sync only seeds IDs so historical inbox rows do not flood the user.
 * Detail modal opens only when the user taps View (Notice banner / inbox) — same as web.
 */
export async function showNewBroadcastPushes(
  broadcasts: FleetNotification[],
): Promise<void> {
  if (broadcasts.length === 0) return;

  const pushedIds = getBroadcastPushedIds();

  // First sync after login: silence only history (read or created before this session).
  // Do not return early — admin rows created while the user is online must still alert.
  if (!isBroadcastPushSeeded()) {
    const sessionBaselineMs = getSessionBroadcastBaselineMs();
    broadcasts.forEach((row) => {
      const createdMs = new Date(row.createdAt).getTime();
      const isHistorical =
        row.read
        || (Number.isFinite(createdMs) && createdMs < sessionBaselineMs);
      if (isHistorical) {
        pushedIds.add(row.id);
      }
    });
    persistBroadcastPushedIds(pushedIds);
    markBroadcastPushSeeded();
  }

  const isAppActive = AppState.currentState === 'active';
  let newArrivalCount = 0;

  for (const row of broadcasts) {
    // Already read on server/inbox, or already delivered once — skip.
    if (row.read || pushedIds.has(row.id)) continue;
    if (!isCategoryAlertsEnabled(row.category)) {
      pushedIds.add(row.id);
      continue;
    }

    newArrivalCount += 1;

    // Android/iOS do not auto-tray FCM while foregrounded — Notifee must post it.
    await pushService.displayLocalNotification(row);
    markBroadcastPushShown(row.id);

    pushedIds.add(row.id);
    if (__DEV__) {
      console.log('[Notifications] admin broadcast arrived', row.id, row.title);
    }
  }

  persistBroadcastPushedIds(pushedIds);

  if (isAppActive && newArrivalCount > 0) {
    broadcastArrivalEvents.notifyNew(newArrivalCount);
  }
}

export { markBroadcastPushShown };

/**
 * FCM while app is open — mark delivered and raise the same summary toast as poll.
 * Detail popup is user-driven (Notice View / inbox), matching web.
 */
export function maybeShowBroadcastPopup(notification: FleetNotification): void {
  const isBroadcast =
    notification.category === 'broadcast'
    || notification.data?.type === '1'
    || notification.data?.page === '1';
  if (!isBroadcast || notification.read) return;
  if (AppState.currentState !== 'active') return;
  broadcastArrivalEvents.notifyNew(1);
}

/** Open the detail modal for one broadcast (Notice banner View / inbox tap). */
export function openBroadcastDetail(notification: FleetNotification): void {
  broadcastPopupEvents.enqueue(notification);
}

export function clearDerivedPushCooldown(notificationId?: string): void {
  if (!notificationId) {
    Cache.delete(DERIVED_PUSH_COOLDOWNS_KEY);
    return;
  }

  const next = { ...loadCooldowns() };
  delete next[notificationId];
  Cache.setJSON(DERIVED_PUSH_COOLDOWNS_KEY, next);
}

/** @deprecated Use showDerivedFleetPush — kept for imports that still reference wallet-only helper. */
export const maybeShowLowWalletPush = showDerivedFleetPush;

/** @deprecated Use clearDerivedPushCooldown */
export const clearLowWalletPushCooldown = clearDerivedPushCooldown;
