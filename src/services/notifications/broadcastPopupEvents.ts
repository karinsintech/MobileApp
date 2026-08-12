/**
 * In-app detail popup queue for admin type=1 broadcasts.
 * Used when the user taps View (Notice banner / inbox) — not auto-fired on arrival
 * (arrival uses broadcastArrivalEvents toast, matching web).
 */

import type { FleetNotification } from './notificationTypes';

type Listener = (notification: FleetNotification) => void;

const listeners = new Set<Listener>();
const queue: FleetNotification[] = [];
let isPresenting = false;

function flush(): void {
  // One modal at a time; wait until a host is mounted and nothing is on screen.
  if (isPresenting || queue.length === 0 || listeners.size === 0) return;
  const next = queue.shift();
  if (!next) return;
  isPresenting = true;
  listeners.forEach((listener) => listener(next));
}

export const broadcastPopupEvents = {
  /** Subscribe to popup requests; returns unsubscribe. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    flush();
    return () => listeners.delete(listener);
  },

  /**
   * Show detail for a broadcast the user explicitly opened.
   * Dedupes only while already queued/presenting the same id.
   */
  enqueue(notification: FleetNotification): void {
    if (isPresenting) {
      // Replace nothing — queue behind the current detail if different id.
      if (queue.some((row) => row.id === notification.id)) return;
    } else if (queue.some((row) => row.id === notification.id)) {
      return;
    }
    queue.push(notification);
    flush();
  },

  /** Call when the user dismisses the current popup so the next can open. */
  release(_notificationId: string): void {
    isPresenting = false;
    flush();
  },
};
