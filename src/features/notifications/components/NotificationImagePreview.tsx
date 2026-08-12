/**
 * Full-screen notification image Preview — same UX as admin / web Ant Design Preview.
 * Tap thumbnail → lightbox with zoom and download to device storage.
 *
 * Nested RN Modals crash on many Android devices, so callers that already sit
 * inside a Modal must use `embeddedInModal` + host the lightbox via
 * `NotificationImageLightbox` at the parent Modal root (see Broadcast popup).
 *
 * Download feedback stays in-lightbox (never Alert) — Alert inside a Modal
 * flickers or silently fails on several OEMs, which looked like a dead button.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import AppImage from '../../../components/common/AppImage';
import { downloadRemoteUrlToDownloads } from '../../../utils/fileExport';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

type Props = {
  uri: string;
  title?: string;
  /** Compact inline thumbnail size (inbox card vs popup). */
  height?: number;
  /**
   * When true, tapping the thumb calls `onOpen` instead of opening an inner Modal.
   * Parent must render `NotificationImageLightbox` at its own Modal root.
   */
  embeddedInModal?: boolean;
  onOpen?: () => void;
};

type LightboxProps = {
  uri: string;
  title?: string;
  onClose: () => void;
};

/** Prefer original filename from URL; fall back to a safe notification name. */
function getDownloadFileName(uri: string, title?: string): string {
  try {
    const pathPart = uri.split('?')[0] ?? uri;
    const last = pathPart.split('/').pop() ?? '';
    if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(last)) {
      return decodeURIComponent(last);
    }
  } catch {
    // Fall through
  }

  const safe = (title || 'notification-image')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 50);
  return `${safe || 'notification-image'}.jpg`;
}

/** Shared toolbar control for the Preview lightbox. */
function ToolbarButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={[styles.toolBtn, disabled && styles.toolBtnDisabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.toolBtnText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Full-screen lightbox body — safe to mount as a sibling inside an existing Modal.
 */
export function NotificationImageLightbox({ uri, title, onClose }: LightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);
  // Inline status avoids Alert-in-Modal flicker / silent failure on Android OEMs.
  const [status, setStatus] = useState<string | null>(null);

  const screen = Dimensions.get('window');
  const previewMaxHeight = useMemo(() => screen.height * 0.55, [screen.height]);

  // Reset zoom / status when a different image opens so prior state never leaks.
  useEffect(() => {
    setZoom(1);
    setStatus(null);
    setIsDownloading(false);
  }, [uri]);

  const handleDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setStatus(null);
    try {
      const fileName = getDownloadFileName(uri, title);
      // MediaStore path — scoped-storage safe on Android 10+.
      const location = await downloadRemoteUrlToDownloads(uri, fileName);
      setStatus(`Saved to ${location}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not download image';
      setStatus(message);
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, title, uri]);

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.topBar}>
        <Text style={styles.topTitle} numberOfLines={1}>
          Preview
        </Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close preview">
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.imageStage}
          onPress={() => setZoom((prev) => (prev === 1 ? 2 : 1))}
        >
          {/* FastImage/Glide path — RN Image BitmapFactory OOMs on large admin art. */}
          <AppImage
            source={{ uri }}
            style={{
              width: screen.width - 32,
              height: previewMaxHeight,
              transform: [{ scale: zoom }],
            }}
            resizeMode="contain"
          />
        </Pressable>

        <View style={styles.toolbar}>
          <ToolbarButton
            label="−"
            onPress={() => setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM))}
          />
          <ToolbarButton
            label={`${Math.round(zoom * 100)}%`}
            onPress={() => setZoom(1)}
          />
          <ToolbarButton
            label="+"
            onPress={() => setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM))}
          />
          <ToolbarButton
            label={isDownloading ? '…' : '↓'}
            onPress={() => {
              void handleDownload();
            }}
            disabled={isDownloading}
          />
        </View>

        {isDownloading ? (
          <ActivityIndicator color={Colors.white} style={styles.downloadSpinner} />
        ) : (
          <Pressable
            style={styles.downloadBtn}
            onPress={() => {
              void handleDownload();
            }}
            accessibilityRole="button"
            accessibilityLabel="Download image"
          >
            <Text style={styles.downloadBtnText}>Download image</Text>
          </Pressable>
        )}

        {status ? (
          <Text
            style={[
              styles.statusText,
              status.startsWith('Saved') ? styles.statusOk : styles.statusErr,
            ]}
          >
            {status}
          </Text>
        ) : (
          <Text style={styles.hint}>
            Tap image to zoom · use toolbar to zoom & download
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Renders a tappable notification image; opens admin-style Preview on press.
 */
export default function NotificationImagePreview({
  uri,
  title,
  height = 220,
  embeddedInModal = false,
  onOpen,
}: Props) {
  const [open, setOpen] = useState(false);

  const openPreview = useCallback(() => {
    // Parent Modal hosts the lightbox — avoid nesting a second Modal on Android.
    if (embeddedInModal) {
      onOpen?.();
      return;
    }
    setOpen(true);
  }, [embeddedInModal, onOpen]);

  return (
    <>
      <Pressable onPress={openPreview} accessibilityRole="imagebutton" accessibilityLabel="Open image preview">
        <AppImage
          source={{ uri }}
          style={[styles.thumb, { height }]}
          resizeMode="contain"
        />
        <View style={styles.previewHint} pointerEvents="none">
          <Text style={styles.previewHintText}>Preview</Text>
        </View>
      </Pressable>

      {!embeddedInModal ? (
        <Modal
          visible={open}
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
          statusBarTranslucent
        >
          <NotificationImageLightbox
            uri={uri}
            title={title}
            onClose={() => setOpen(false)}
          />
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: '100%',
    borderRadius: 10,
    marginBottom: Spacing[2],
    borderWidth: 1,
    borderColor: 'rgba(229, 233, 242, 0.35)',
    backgroundColor: 'rgba(248, 250, 252, 0.12)',
  },
  previewHint: {
    position: 'absolute',
    right: 10,
    bottom: 18,
    backgroundColor: 'rgba(15, 27, 51, 0.72)',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  previewHintText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    zIndex: 20,
    elevation: 24,
  },
  topBar: {
    paddingTop: Platform.OS === 'ios' ? 54 : 28,
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '700',
    flex: 1,
    marginRight: Spacing[3],
  },
  closeText: {
    color: Colors.white,
    fontSize: FontSize.xl,
    fontWeight: '600',
  },
  scrollBody: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: Spacing[8],
  },
  imageStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[4],
    overflow: 'hidden',
  },
  toolbar: {
    alignSelf: 'center',
    marginTop: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(40, 44, 52, 0.92)',
    borderRadius: 22,
    paddingHorizontal: 6,
    height: 44,
    gap: 2,
  },
  toolBtn: {
    minWidth: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  toolBtnDisabled: {
    opacity: 0.5,
  },
  toolBtnText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  downloadBtn: {
    alignSelf: 'center',
    marginTop: Spacing[3],
    backgroundColor: 'rgba(0, 113, 197, 0.95)',
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  downloadBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  downloadSpinner: {
    marginTop: Spacing[3],
  },
  hint: {
    marginTop: Spacing[3],
    textAlign: 'center',
    color: 'rgba(255,255,255,0.65)',
    fontSize: FontSize.xs,
    paddingHorizontal: Spacing[4],
  },
  statusText: {
    marginTop: Spacing[3],
    textAlign: 'center',
    fontSize: FontSize.sm,
    fontWeight: '600',
    paddingHorizontal: Spacing[4],
  },
  statusOk: {
    color: '#7DFFB3',
  },
  statusErr: {
    color: '#FF8A8A',
  },
});
