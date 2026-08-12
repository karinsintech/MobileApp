/**
 * Background fleet alert delivery — surfaces wallet, VAHAN, DL, challan, and
 * claim tray alerts without the user opening the app.
 *
 * Strategy (no extra native dependency required):
 *  1. Silent FCM data message  → handleBackgroundPush() already calls
 *     runBackgroundFleetSync() when action === 'sync_fleet_alerts'.
 *  2. App goes to background   → one last sync before JS is suspended
 *     (wired in usePushNotifications via AppState 'background').
 *
 * To trigger from your backend, send a FCM data-only message (no notification
 * key) to the device's FCM token with:
 *   { "action": "sync_fleet_alerts" }
 * The existing handleBackgroundPush handler picks it up on Android/iOS.
 */

/** No-op stub — kept so import sites compile without changes. */
export async function configureBackgroundFleetFetch(): Promise<void> {
  // Intentionally empty — background delivery is handled via FCM silent push
  // and the AppState 'background' hook in usePushNotifications.
}

/** No-op stub — kept for symmetry with the start call. */
export async function stopBackgroundFleetFetch(): Promise<void> {
  // Intentionally empty.
}
