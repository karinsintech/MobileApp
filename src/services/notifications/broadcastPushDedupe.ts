/**
 * Tracks which admin broadcasts already hit the OS tray via FCM/Notifee
 * so the foreground API poll does not heads-up the same alert again.
 *
 * Kept separate from pushService / localFleetNotificationService to avoid
 * circular imports that thrash Metro Fast Refresh.
 */

import { Cache } from '../storage/SecureStorage';

const BROADCAST_PUSHED_IDS_KEY = 'broadcast_push_shown_ids';
const BROADCAST_PUSH_SEEDED_KEY = 'broadcast_push_seeded';
const MAX_BROADCAST_PUSHED_IDS = 300;

function loadBroadcastPushedIds(): Set<string> {
  return new Set(Cache.getJSON<string[]>(BROADCAST_PUSHED_IDS_KEY) ?? []);
}

function saveBroadcastPushedIds(ids: Set<string>): void {
  Cache.setJSON(
    BROADCAST_PUSHED_IDS_KEY,
    [...ids].slice(0, MAX_BROADCAST_PUSHED_IDS),
  );
}

/** True after the first successful broadcast sync (seed or FCM). */
export function isBroadcastPushSeeded(): boolean {
  return Cache.getString(BROADCAST_PUSH_SEEDED_KEY) === '1';
}

export function markBroadcastPushSeeded(): void {
  Cache.set(BROADCAST_PUSH_SEEDED_KEY, '1');
}

export function getBroadcastPushedIds(): Set<string> {
  return loadBroadcastPushedIds();
}

export function persistBroadcastPushedIds(ids: Set<string>): void {
  saveBroadcastPushedIds(ids);
}

/**
 * Remember FCM/Notifee already delivered this broadcast so poll does not re-buzz.
 */
export function markBroadcastPushShown(notificationId: string): void {
  if (!notificationId) return;
  const pushedIds = loadBroadcastPushedIds();
  pushedIds.add(notificationId);
  saveBroadcastPushedIds(pushedIds);
  if (!isBroadcastPushSeeded()) {
    markBroadcastPushSeeded();
  }
}
