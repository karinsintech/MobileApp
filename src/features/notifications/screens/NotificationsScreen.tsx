import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  LiquidBackground, GlassCard, EmptyState, ScreenHeader,
} from '../../../components';
import { AlertDot } from '../../../components/icons';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { fmtDateTime } from '../../../utils/format';
import {
  getVisibleNotifications,
  isConditionBasedDashboardRow,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removeNotification,
  resolveNotificationImageUrl,
} from '../../../services/notifications/notificationCenter';
import { notificationEvents } from '../../../services/notifications/notificationEvents';
import { notificationApi } from '../../../services/api/notificationApi';
import { refreshNotificationInboxForSession } from '../../../services/notifications/notificationInboxRefresh';
import type { FleetNotification } from '../../../services/notifications/notificationTypes';
import { openBroadcastDetail } from '../../../services/notifications/localFleetNotificationService';
import { useAppSelector } from '../../../store';
import {
  dashboardHeader,
  dashboardBody,
  DASHBOARD_LIGHT_WHITE,
} from '../../dashboard/dashboardTypography';
import type { MainTabParamList, MoreStackParamList } from '../../../navigation/types';
import NotificationImagePreview from '../components/NotificationImagePreview';

// More-stack screens can also jump to sibling tabs (Claims) for claim alerts.
type NotificationsNav = CompositeNavigationProp<
  NativeStackNavigationProp<MoreStackParamList>,
  BottomTabNavigationProp<MainTabParamList>
>;

/** Deep-link targets for actionable inbox rows (dashboard-derived + push). */
type NotificationAction =
  | { label: string; kind: 'more'; screen: 'RCList' | 'DLList' }
  | { label: string; kind: 'more'; screen: 'ChallanList'; params: MoreStackParamList['ChallanList'] }
  | {
    label: string;
    kind: 'tab';
    tab: 'Claims';
    screen: 'ClaimsList';
    params: { initialFilter: 'APPROVED' };
  };

interface ComplianceBodyRow {
  label: string;
  expired: string;
  expiring: string;
}

/**
 * RC expiry notifications store multi-line doc counts in `detail` (tray expand /
 * inbox card). Parse that text back into structured rows to color risky counts.
 */
function parseComplianceBody(body: string): ComplianceBodyRow[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawLabel, rawCounts = ''] = line.split(':');
      const [expired = '0', expiring = '0'] = rawCounts.split('/').map((part) => part.trim());
      return {
        label: rawLabel?.trim() || '—',
        expired,
        expiring,
      };
    });
}

function resolveNotificationAction(item: FleetNotification): NotificationAction | null {
  if (item.category === 'broadcast' || item.data?.type === '1' || item.data?.page === '1') {
    // Broadcast detail is already on the card — no deep-link action needed
    return null;
  }

  if (item.category === 'rc_expiry' || item.data?.screen === 'RCList') {
    return { label: 'View RC', kind: 'more', screen: 'RCList' };
  }

  if (item.category === 'echallan' || item.data?.screen === 'ChallanList') {
    // Pending challans are the reason this alert exists — open that filter directly.
    return {
      label: 'View Challan',
      kind: 'more',
      screen: 'ChallanList',
      params: { initialStatus: 'Pending' },
    };
  }

  if (item.category === 'dl_expiry' || item.data?.screen === 'DLList') {
    return { label: 'View DL', kind: 'more', screen: 'DLList' };
  }

  if (item.category === 'claim_update' || item.data?.screen === 'ClaimsList') {
    // Dashboard claim alert is built from approved FY claims — land on that chip.
    return {
      label: 'View Claims',
      kind: 'tab',
      tab: 'Claims',
      screen: 'ClaimsList',
      params: { initialFilter: 'APPROVED' },
    };
  }

  return null;
}

export default function NotificationsScreen() {
  const navigation = useNavigation<NotificationsNav>();
  const auth = useAppSelector((s) => s.auth);
  const [items, setItems] = useState<FleetNotification[]>(() => getVisibleNotifications());
  const [refreshing, setRefreshing] = useState(false);

  const userId = auth.user?.userId;
  const customerId = auth.dashboardContext?.customerId ?? auth.user?.defaultCustomerId;
  // Ref avoids useFocusEffect re-entry when Redux returns a new auth.user object identity.
  const authRef = useRef(auth);
  authRef.current = auth;

  const reload = useCallback(async () => {
    const latest = authRef.current;
    await refreshNotificationInboxForSession({
      user: latest.user,
      dashboardContext: latest.dashboardContext,
      isAuthenticated: latest.isAuthenticated,
      fetchFreshDashboard: true,
    });
    setItems(getVisibleNotifications());
  }, []);

  useEffect(() => {
    return notificationEvents.subscribe(() => {
      setItems(getVisibleNotifications());
    });
  }, []);

  // Reload once on focus / session change — not on every auth object identity churn.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload, userId, customerId]),
  );

  const markRead = useCallback((id: string) => {
    const target = loadNotifications().find((row) => row.id === id);
    if (target && isConditionBasedDashboardRow(target)) {
      return;
    }
    // Already opened — keep card as-is (no style flash / no re-prune).
    if (target?.read) {
      return;
    }

    markNotificationRead(id);
    // Update in place so the row never drops out of the list on click.
    setItems((prev) =>
      prev.map((row) => (row.id === id ? { ...row, read: true } : row)),
    );

    const numericId = Number(id);
    if (Number.isFinite(numericId) && numericId > 0) {
      void notificationApi.markRead(numericId).catch(() => {
        /* local read already applied */
      });
    }
  }, []);

  const markAllRead = useCallback(() => {
    markAllNotificationsRead();
    setItems((prev) =>
      prev.map((row) =>
        (isConditionBasedDashboardRow(row) ? row : { ...row, read: true }),
      ),
    );
    void notificationApi.markAllRead().catch(() => {
      /* local read already applied */
    });
  }, []);

  /** Soft-delete broadcast for this user — same as web drawer clear (X). */
  const clearBroadcast = useCallback((item: FleetNotification) => {
    const isBroadcast =
      item.category === 'broadcast'
      || item.data?.type === '1'
      || item.data?.page === '1';
    if (!isBroadcast) return;

    removeNotification(item.id);
    setItems((prev) => prev.filter((row) => row.id !== item.id));

    const numericId = Number(item.id);
    if (Number.isFinite(numericId) && numericId > 0) {
      void notificationApi.deleteForUser(numericId).catch(() => {
        /* local remove already applied */
      });
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  const handleOpenAction = useCallback((item: FleetNotification) => {
    const action = resolveNotificationAction(item);
    if (!action) return;

    if (!isConditionBasedDashboardRow(item)) {
      markNotificationRead(item.id);
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)),
      );
    }

    if (action.kind === 'tab') {
      navigation.navigate(action.tab, {
        screen: action.screen,
        params: action.params,
      });
      return;
    }

    if (action.screen === 'ChallanList') {
      navigation.navigate('ChallanList', action.params);
      return;
    }

    navigation.navigate(action.screen);
  }, [navigation]);

  const hasUnread = items.some((item) => !item.read || isConditionBasedDashboardRow(item));

  const renderCard = (item: FleetNotification) => {
    const action = resolveNotificationAction(item);
    // Prefer multi-line detail for inbox cards; body alone is the collapsed tray summary.
    const displayText = item.detail?.trim() || item.body;
    const complianceRows = item.category === 'rc_expiry' ? parseComplianceBody(displayText) : [];

    // Unread = darker card; opened = lighter card. No press opacity fade.
    const isUnread = !item.read || isConditionBasedDashboardRow(item);
    // Web NotificationDrawer.resolveImageUrl — single absolute URL, no fallback chain.
    const imageUrl = resolveNotificationImageUrl(item.image ?? item.data?.image);

    return (
      <Pressable
        key={item.id}
        onPress={() => {
          const isBroadcast =
            item.category === 'broadcast'
            || item.data?.type === '1'
            || item.data?.page === '1';
          // Web: tap row → detail popup; mark read on close of detail.
          if (isBroadcast) {
            openBroadcastDetail(item);
            return;
          }
          if (!isConditionBasedDashboardRow(item)) {
            markRead(item.id);
          }
        }}
      >
        <GlassCard
          variant="default"
          style={[styles.card, isUnread ? styles.cardUnread : styles.cardRead]}
        >
          <View style={styles.titleRow}>
            <Text style={[styles.title, isUnread && styles.titleUnread]}>
              {item.title}
            </Text>
            {isUnread ? (
              <View style={styles.dotWrap}>
                <AlertDot size={9} color={Colors.info} />
              </View>
            ) : null}
            {(item.category === 'broadcast'
              || item.data?.type === '1'
              || item.data?.page === '1') ? (
              <Pressable
                onPress={(e) => {
                  // Stop row press from opening detail while clearing.
                  e?.stopPropagation?.();
                  clearBroadcast(item);
                }}
                hitSlop={10}
                accessibilityLabel="Clear notification"
              >
                <Text style={styles.clearBtn}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          {complianceRows.length > 0 ? (
            <View style={styles.complianceBody}>
              {complianceRows.map((row) => (
                <View key={row.label} style={styles.complianceRow}>
                  <Text style={styles.complianceLabel}>{row.label}</Text>
                  <View style={styles.complianceCounts}>
                    <Text style={styles.complianceExpired}>{row.expired}</Text>
                    <Text style={styles.complianceSeparator}>/</Text>
                    <Text style={styles.complianceExpiring}>{row.expiring}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.body}>{displayText}</Text>
          )}
          {imageUrl ? (
            <NotificationImagePreview
              uri={imageUrl}
              title={item.title}
              height={220}
            />
          ) : null}
          <View style={styles.footerRow}>
            <Text style={styles.time}>{fmtDateTime(item.createdAt)}</Text>
            {action ? (
              <Pressable
                style={styles.actionBtn}
                onPress={() => handleOpenAction(item)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.actionBtnText}>{action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        </GlassCard>
      </Pressable>
    );
  };

  return (
    <LiquidBackground>
      <ScreenHeader
        title="Notifications"
        showBack
        rightElement={(
          <Pressable
            onPress={markAllRead}
            disabled={!hasUnread}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.markAll, !hasUnread && styles.markAllDisabled]}>
              Mark all as read
            </Text>
          </Pressable>
        )}
      />
      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.blue} />
        )}
      >
        {items.length === 0 ? (
          <EmptyState
            title="No notifications yet"
            subtitle="Alerts for wallet, tolls, claims, and compliance will show up here."
            icon=""
          />
        ) : (
          items.map((item) => renderCard(item))
        )}
      </ScrollView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[2],
    paddingBottom: Spacing[8],
    gap: Spacing[2],
  },
  card: {
    padding: Spacing[4],
  },
  // New / unread — darker solid card (must stay fully visible, never fade).
  cardUnread: {
    backgroundColor: 'rgba(4, 22, 40, 0.96)',
    borderColor: 'rgba(66, 165, 255, 0.42)',
  },
  // Opened / read — lighter but still solid so the row does not look like it vanished.
  cardRead: {
    backgroundColor: 'rgba(72, 102, 132, 0.78)',
    borderColor: 'rgba(255, 255, 255, 0.26)',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing[2],
    marginBottom: Spacing[1],
  },
  dotWrap: {
    width: 9,
    height: 9,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    ...dashboardHeader,
    fontWeight: '600',
    flex: 1,
  },
  clearBtn: {
    color: DASHBOARD_LIGHT_WHITE,
    fontSize: FontSize.md,
    fontWeight: '600',
    paddingHorizontal: 4,
    marginTop: 2,
  },
  titleUnread: {
    fontWeight: '700',
  },
  body: {
    ...dashboardBody,
    lineHeight: 18,
    marginBottom: Spacing[2],
  },
  complianceBody: {
    gap: 6,
    marginBottom: Spacing[2],
  },
  // Keep the six RC docs scan-friendly: label left, risk counts right.
  complianceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  complianceLabel: {
    ...dashboardBody,
    flex: 1,
    fontWeight: '600',
  },
  complianceCounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  complianceExpired: {
    ...dashboardBody,
    color: Colors.dangerLight,
    fontWeight: '700',
  },
  complianceSeparator: {
    ...dashboardBody,
    color: DASHBOARD_LIGHT_WHITE,
    fontWeight: '600',
  },
  complianceExpiring: {
    ...dashboardBody,
    color: Colors.warningLight,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  time: {
    fontSize: FontSize.xs,
    color: DASHBOARD_LIGHT_WHITE,
    flexShrink: 1,
  },
  actionBtn: {
    backgroundColor: Colors.blue,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    flexShrink: 0,
  },
  actionBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.white,
  },
  markAll: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.white,
  },
  markAllDisabled: {
    color: DASHBOARD_LIGHT_WHITE,
    opacity: 0.5,
  },
});
