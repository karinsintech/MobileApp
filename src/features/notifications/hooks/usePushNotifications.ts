/**
 * Boots push delivery for an authenticated session.
 *
 * Admin type=1 broadcasts arrive via (web parity):
 * 1. FCM → tray when backgrounded; summary toast when foregrounded
 * 2. GET /notification poll (10s, same as web) → inbox + Notice banner
 * 3. Detail popup only when the user taps View / inbox row
 */

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  configureBackgroundFleetFetch,
  stopBackgroundFleetFetch,
} from '../../../services/notifications/backgroundFleetFetch';
import { markSessionBroadcastBaseline } from '../../../services/notifications/broadcastPushDedupe';
import { syncBroadcastNotificationsFromApi } from '../../../services/notifications/notificationCenter';
import { refreshNotificationInboxForSession } from '../../../services/notifications/notificationInboxRefresh';
import { pushService } from '../../../services/notifications/pushService';
import { registerPushDevice } from '../../../services/notifications/registerPushDevice';
import { useAppSelector } from '../../../store';
import { resolveActiveCustomerId } from '../../../types/auth';

/** How often to check for new admin broadcasts while the app is foregrounded (web = 10s). */
const BROADCAST_POLL_MS = 10_000;

export function usePushNotifications(isAuthenticated: boolean): void {
  const auth = useAppSelector((s) => s.auth);
  const userId = auth.user?.userId;
  const customerId = resolveActiveCustomerId(
    auth.dashboardContext,
    auth.user?.defaultCustomerId,
  );
  // Keep latest auth for async callbacks without re-subscribing on every object identity change.
  const authRef = useRef(auth);
  authRef.current = auth;

  useEffect(() => {
    if (!isAuthenticated || !userId) return undefined;

    // Tray tap + FCM open handlers — safe to call repeatedly (idempotent).
    pushService.setupNotificationOpenHandlers();

    // First broadcast sync after login only silences rows older than this moment.
    markSessionBroadcastBaseline();

    // Foreground FCM: OS will not auto-display — we mirror into Notifee + inbox.
    const unsubscribeForeground = pushService.registerForegroundHandler((message) => {
      void pushService.handleIncomingMessage(message);
    });

    // Register FCM token so admin/backend can target this handset when they push.
    // Force on session start — server may have cleared a prior NotRegistered token.
    void registerPushDevice({ force: true });

    // Periodic background sync — wallet / VAHAN / DL / challan / claim tray alerts
    // without opening the app (WhatsApp-style delivery on Android + iOS).
    void configureBackgroundFleetFetch();

    const refreshInbox = async (fetchFreshDashboard: boolean) => {
      const latest = authRef.current;
      await refreshNotificationInboxForSession({
        user: latest.user,
        dashboardContext: latest.dashboardContext,
        isAuthenticated: true,
        fetchFreshDashboard,
      });
    };

    // One bootstrap sync — do not depend on auth.user object identity (that re-fired forever).
    void refreshInbox(true);

    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void registerPushDevice();
        // Soft refresh only — full dashboard fetch on every resume re-spammed tray + menu.
        void refreshInbox(false);
      }
      if (state === 'background') {
        // One tray pass before the OS suspends JS — complements periodic background fetch.
        void import('../../../services/notifications/backgroundFleetSync')
          .then(({ runBackgroundFleetSync }) => runBackgroundFleetSync())
          .catch(() => undefined);
      }
    });

    // Poll broadcasts while open; unchanged API payloads no longer emit/re-render the menu.
    const pollId = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      void syncBroadcastNotificationsFromApi();
    }, BROADCAST_POLL_MS);

    const unsubscribeTokenRefresh = pushService.onTokenRefresh(() => {
      // Firebase rotated the token — must force POST or cron keeps the dead id.
      void registerPushDevice({ force: true });
    });

    return () => {
      appStateSub.remove();
      clearInterval(pollId);
      unsubscribeForeground();
      unsubscribeTokenRefresh();
      void stopBackgroundFleetFetch();
    };
  }, [isAuthenticated, userId, customerId]);
}
