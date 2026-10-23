/**
 * Non-Android stub — iOS uses Notifee / APNs which already wrap body text
 * without an expand/collapse control.
 */

export async function displayFleetTrayNotification(_args: {
  id: string;
  title: string;
  body: string;
  channelId: string;
  data?: Record<string, string> | null;
}): Promise<boolean> {
  return false;
}

export async function consumeFleetTrayOpenIntent(): Promise<boolean> {
  return false;
}
