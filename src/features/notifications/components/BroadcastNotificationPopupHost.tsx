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
import { markNotificationRead } from '../../../services/notifications/notificationCenter';
import { notificationApi } from '../../../services/api/notificationApi';
import type { FleetNotification } from '../../../services/notifications/notificationTypes';
import {
  dashboardHeader,
  dashboardBody,
  DASHBOARD_LIGHT_WHITE,
} from '../../dashboard/dashboardTypography';
import NotificationImagePreview, {
  NotificationImageLightbox,
  useNotificationImageAdvance,
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

  return (
    <BroadcastNotificationPopupBody
      current={current}
      imagePreviewOpen={imagePreviewOpen}
      setImagePreviewOpen={setImagePreviewOpen}
      dismiss={dismiss}
    />
  );
}

/** Body split so image-candidate hook runs only while a notification is open. */
function BroadcastNotificationPopupBody({
  current,
  imagePreviewOpen,
  setImagePreviewOpen,
  dismiss,
}: {
  current: FleetNotification;
  imagePreviewOpen: boolean;
  setImagePreviewOpen: (open: boolean) => void;
  dismiss: () => void;
}) {
  const body = current.detail?.trim() || current.body;
  const rawImage = current.image ?? current.data?.image;
  const { src: imageUrl, onError } = useNotificationImageAdvance(rawImage);

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
              {rawImage ? (
                <NotificationImagePreview
                  uri={imageUrl}
                  onLoadError={onError}
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
              onError={onError}
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: Spacing[5],
  },
  card: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    maxHeight: '86%',
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[2],
  },
  title: {
    ...dashboardHeader,
    flex: 1,
    color: Colors.white,
  },
  close: {
    color: DASHBOARD_LIGHT_WHITE,
    fontSize: FontSize.xl,
    fontWeight: '600',
    lineHeight: 24,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
    gap: 10,
  },
  body: {
    ...dashboardBody,
    color: DASHBOARD_LIGHT_WHITE,
  },
  okBtn: {
    margin: Spacing[4],
    marginTop: Spacing[2],
    backgroundColor: Colors.blue,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  okText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  lightboxHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
  },
});
