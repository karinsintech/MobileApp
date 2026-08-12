/**
 * Web-style arrival cue for admin broadcasts while the app is open.
 * Shows “N new notification(s) arrived” instead of auto-opening a full modal
 * (matches CustomerPushNotificationContext on the fleet dashboard).
 */

type ArrivalListener = (count: number) => void;

const listeners = new Set<ArrivalListener>();
let pendingCount = 0;

export const broadcastArrivalEvents = {
  subscribe(listener: ArrivalListener): () => void {
    listeners.add(listener);
    if (pendingCount > 0) {
      listener(pendingCount);
    }
    return () => listeners.delete(listener);
  },

  /** Accumulate newly arrived unread broadcasts into one summary toast. */
  notifyNew(count: number): void {
    if (count <= 0) return;
    pendingCount += count;
    listeners.forEach((listener) => listener(pendingCount));
  },

  /** Clear after the user opens the inbox / dismisses the toast. */
  clear(): void {
    pendingCount = 0;
    listeners.forEach((listener) => listener(0));
  },
};
