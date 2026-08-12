/**
 * Dashboard Notice strip for timed admin broadcasts (expiresAt set).
 * Mirrors web TimedBroadcastBanner — View opens the same detail popup as the bell.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import {
  getTimedBroadcastNotices,
} from '../../../services/notifications/notificationCenter';
import { notificationEvents } from '../../../services/notifications/notificationEvents';
import { openBroadcastDetail } from '../../../services/notifications/localFleetNotificationService';
import type { FleetNotification } from '../../../services/notifications/notificationTypes';
import { Cache } from '../../../services/storage/SecureStorage';
import {
  dashboardBody,
  dashboardHeader,
  DASHBOARD_LIGHT_WHITE,
} from '../../dashboard/dashboardTypography';

const DISMISS_KEY = 'timed_broadcast_banner_dismissed';

function loadDismissed(): Set<string> {
  return new Set(Cache.getJSON<string[]>(DISMISS_KEY) ?? []);
}

function saveDismissed(ids: Set<string>): void {
  Cache.setJSON(DISMISS_KEY, [...ids].slice(0, 100));
}

export default function TimedBroadcastBanner() {
  const [items, setItems] = useState<FleetNotification[]>(() => getTimedBroadcastNotices());
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [, setTick] = useState(0);

  useEffect(() => {
    return notificationEvents.subscribe(() => {
      setItems(getTimedBroadcastNotices());
    });
  }, []);

  // Re-check expiry so banners disappear when the Admin end time passes.
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((n) => n + 1);
      setItems(getTimedBroadcastNotices());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const visible = useMemo(
    () => items.filter((row) => !dismissed.has(row.id)),
    [items, dismissed],
  );

  if (visible.length === 0) return null;

  return (
    <View style={styles.stack}>
      {visible.map((row) => (
        <View key={row.id} style={styles.banner}>
          <View style={styles.tagWrap}>
            <Text style={styles.tag}>Notice</Text>
          </View>
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={1}>
              {row.title}
            </Text>
            <Text style={styles.body} numberOfLines={1}>
              {row.body}
            </Text>
          </View>
          <Pressable
            style={styles.viewBtn}
            onPress={() => openBroadcastDetail(row)}
            accessibilityRole="button"
            accessibilityLabel="View notice"
          >
            <Text style={styles.viewText}>View</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setDismissed((prev) => {
                const next = new Set(prev);
                next.add(row.id);
                saveDismissed(next);
                return next;
              });
            }}
            hitSlop={8}
            accessibilityLabel="Dismiss notice"
          >
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#0B3A66',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(66, 165, 255, 0.35)',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  tagWrap: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tag: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...dashboardHeader,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
  body: {
    ...dashboardBody,
    fontSize: 11,
    color: '#9FD0F2',
    marginTop: 2,
  },
  viewBtn: {
    backgroundColor: Colors.white,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  viewText: {
    color: '#001F4E',
    fontSize: 12,
    fontWeight: '700',
  },
  close: {
    color: DASHBOARD_LIGHT_WHITE,
    fontSize: FontSize.md,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
});
