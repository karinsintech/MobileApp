/**
 * Web-parity summary toast: “N new notification(s) arrived”.
 * Tap opens the Notifications inbox (same as web toast → bell drawer).
 *
 * Anchored above the tab bar (not over the status/header zone) so it never
 * covers the dashboard action icons or blocks pull-down system controls.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { broadcastArrivalEvents } from '../../../services/notifications/broadcastArrivalEvents';
import { navigateToNotificationsScreen } from '../../../services/notifications/notificationNavigation';
import { Colors, FontSize, Radius, Spacing } from '../../../theme';

/** Auto-hide so a stuck toast cannot keep covering UI after login. */
const AUTO_DISMISS_MS = 8_000;
/** Approx bottom-tab height so the toast sits clear of the tab bar. */
const TAB_BAR_CLEARANCE = 64;

export default function BroadcastArrivalToast() {
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);

  useEffect(() => {
    return broadcastArrivalEvents.subscribe(setCount);
  }, []);

  // Clear on a timer whenever a new batch arrives — avoids a permanent overlay.
  useEffect(() => {
    if (count <= 0) return undefined;
    const timer = setTimeout(() => {
      broadcastArrivalEvents.clear();
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [count]);

  if (count <= 0) return null;

  const label =
    count === 1
      ? '1 new notification arrived'
      : `${count} new notifications arrived`;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.host,
        { bottom: Math.max(insets.bottom, 8) + TAB_BAR_CLEARANCE },
      ]}
    >
      <Pressable
        style={styles.toast}
        onPress={() => {
          broadcastArrivalEvents.clear();
          navigateToNotificationsScreen();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={styles.text}>{label}</Text>
        <Text style={styles.cta}>View</Text>
        <Pressable
          onPress={(e) => {
            // Stop the parent Pressable from also navigating to the inbox.
            e?.stopPropagation?.();
            broadcastArrivalEvents.clear();
          }}
          hitSlop={10}
          accessibilityLabel="Dismiss notification toast"
          style={styles.dismissBtn}
        >
          <Text style={styles.dismissText}>✕</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Spacing[4],
    right: Spacing[4],
    zIndex: 50,
    elevation: 50,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
    backgroundColor: '#0B3A66',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(66, 165, 255, 0.45)',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  text: {
    flex: 1,
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  cta: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
  dismissBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dismissText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
