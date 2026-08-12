/**
 * Full-screen modal for admin broadcast alerts — title, body, optional image.
 * Hosted at root so new type=1 notifications popup while the user is in the app.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { broadcastPopupEvents } from '../../../services/notifications/broadcastPopupEvents';
import {
  markNotificationRead,
  resolveNotificationImageUrl,
} from '../../../services/notifications/notificationCenter';
import { notificationApi } from '../../../services/api/notificationApi';
import type { FleetNotification } from '../../../services/notifications/notificationTypes';
import {
  dashboardHeader,
  dashboardBody,
  DASHBOARD_LIGHT_WHITE,
} from '../../dashboard/dashboardTypography';
import NotificationImagePreview, {
  NotificationImageLightbox,
} from './NotificationImagePreview';

export default function BroadcastNotificationPopupHost() {
  const [current, setCurrent] = useState<FleetNotification | null>(null);
  // Lightbox lives on this Modal root — never nest a second Modal (Android crash).
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);

  useEffect(() => {
    return broadcastPopupEvents.subscribe((notification) => {
      setImagePreviewOpen(false);
      setCurrent(notification);
    });
  }, []);

  const dismiss = useCallback(() => {
    if (!current) return;

    const open = current;
    setImagePreviewOpen(false);
    // Closing counts as “seen” so the inbox card switches to read styling.
    markNotificationRead(open.id);
    const numericId = Number(open.id);
    if (Number.isFinite(numericId) && numericId > 0) {
      void notificationApi.markRead(numericId).catch(() => undefined);
    }

    setCurrent(null);
    // Defer flush so this dismiss setState is not overwritten by the next popup.
    setTimeout(() => {
      broadcastPopupEvents.release(open.id);
    }, 0);
  }, [current]);

  if (!current) return null;

  const body = current.detail?.trim() || current.body;
  const imageUrl = resolveNotificationImageUrl(current.image ?? current.data?.image);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={imagePreviewOpen ? () => setImagePreviewOpen(false) : dismiss}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.title} numberOfLines={3}>
                {current.title}
              </Text>
              <Pressable
                onPress={dismiss}
                hitSlop={10}
                accessibilityLabel="Close notification"
              >
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {body ? <Text style={styles.body}>{body}</Text> : null}
              {imageUrl ? (
                <NotificationImagePreview
                  uri={imageUrl}
                  title={current.title}
                  height={200}
                  embeddedInModal
                  onOpen={() => setImagePreviewOpen(true)}
                />
              ) : null}
            </ScrollView>

            <Pressable style={styles.okBtn} onPress={dismiss}>
              <Text style={styles.okText}>OK</Text>
            </Pressable>
          </View>
        </View>

        {/* Sibling overlay (not nested Modal) — full elevation so download taps are not stolen by the card. */}
        {imagePreviewOpen && imageUrl ? (
          <View style={styles.lightboxHost} pointerEvents="box-none">
            <NotificationImageLightbox
              uri={imageUrl}
              title={current.title}
              onClose={() => setImagePreviewOpen(false)}
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  lightboxHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
  },
  overlay: {
    flex: 1,
    backgroundColor: Colors.bg.overlay,
    justifyContent: 'center',
    paddingHorizontal: Spacing[5],
  },
  card: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(66, 165, 255, 0.35)',
    maxHeight: '78%',
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[2],
  },
  title: {
    ...dashboardHeader,
    fontWeight: '700',
    flex: 1,
    fontSize: FontSize.lg,
  },
  close: {
    color: DASHBOARD_LIGHT_WHITE,
    fontSize: FontSize.lg,
    fontWeight: '600',
    lineHeight: 22,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
    gap: Spacing[3],
  },
  body: {
    ...dashboardBody,
    lineHeight: 20,
  },
  okBtn: {
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[4],
    marginTop: Spacing[1],
    backgroundColor: Colors.blue,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  okText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
});
