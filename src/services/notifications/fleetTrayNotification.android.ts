/**
 * Android bridge to NativeFleetTrayNotification — multi-line collapsed tray
 * layout without BigText expand/collapse (iOS-like always-visible body).
 *
 * Must use the codegen TurboModule (specs/) — NativeModules.X is not callable
 * on RN 0.86 bridgeless, which previously caused silent Notifee fallback.
 */

import NativeFleetTrayNotification from '../../../specs/NativeFleetTrayNotification';

/** Post a shade row with full body visible — no expand chevron. */
export async function displayFleetTrayNotification(args: {
  id: string;
  title: string;
  body: string;
  channelId: string;
  data?: Record<string, string> | null;
  onlyAlertOnce?: boolean;
}): Promise<boolean> {
  if (typeof NativeFleetTrayNotification?.display !== 'function') {
    return false;
  }
  try {
    await NativeFleetTrayNotification.display(
      args.id,
      args.title,
      args.body,
      args.channelId,
      args.data ?? null,
      args.onlyAlertOnce ?? false,
    );
    return true;
  } catch {
    return false;
  }
}

/** Remove a shade row posted by the native module (Notifee cancel alone misses these). */
export async function cancelFleetTrayNotification(id: string): Promise<void> {
  if (!id || typeof NativeFleetTrayNotification?.cancel !== 'function') return;
  try {
    await NativeFleetTrayNotification.cancel(id);
  } catch {
    /* best-effort */
  }
}

/** True once after a tray tap that should open the in-app Notifications screen. */
export async function consumeFleetTrayOpenIntent(): Promise<boolean> {
  if (typeof NativeFleetTrayNotification?.consumeOpenNotificationsIntent !== 'function') {
    return false;
  }
  try {
    return !!(await NativeFleetTrayNotification.consumeOpenNotificationsIntent());
  } catch {
    return false;
  }
}
