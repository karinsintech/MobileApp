/**
 * Centered popup when Location is off or permission is denied.
 * GPS acquisition runs in the background — never shows a loading gate while
 * waiting for a fix. Overlay appears only when Location / permission blocks use.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {
  getClientGeoCoords,
  isDeviceLocationEnabled,
  openDeviceLocationSettings,
} from '../../utils/getClientGeoCoords';
import { Colors, FontFamily, FontSize, Spacing, Radius } from '../../theme';

async function hasFineLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
  } catch {
    return false;
  }
}

export function LocationRequiredPopup() {
  const [visible, setVisible] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  /**
   * Decide overlay from Location toggle / permission only.
   * Do not wait on a GPS lock — that used to flash a loading state over the app.
   */
  const checkLocation = useCallback(async (options?: { warmGps?: boolean }) => {
    try {
      const locationOn = await isDeviceLocationEnabled();
      if (!locationOn) {
        setVisible(true);
        return;
      }

      const permitted = await hasFineLocationPermission();
      if (!permitted) {
        setVisible(true);
        return;
      }

      // Location + permission OK — hide overlay immediately; warm GPS quietly
      setVisible(false);
      if (options?.warmGps !== false) {
        void getClientGeoCoords(12_000);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    void checkLocation({ warmGps: true });
  }, [checkLocation]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      // Returning from Settings — re-check toggle/permission without a spinner gate
      if (next === 'active') void checkLocation({ warmGps: true });
    });
    return () => sub.remove();
  }, [checkLocation]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      await checkLocation({ warmGps: true });
    } finally {
      setIsRetrying(false);
    }
  }, [checkLocation]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Mandatory — back button must not dismiss without location
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Turn on Location</Text>
          <Text style={styles.body}>
            Location is required to use Karins. Please enable Location / GPS and
            allow permission to continue.
          </Text>
          <TouchableOpacity
            style={[styles.btn, isRetrying && styles.btnDisabled]}
            onPress={openDeviceLocationSettings}
            activeOpacity={0.85}
            disabled={isRetrying}
          >
            <Text style={styles.btnText}>Open settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => void handleRetry()}
            activeOpacity={0.85}
            disabled={isRetrying}
          >
            <Text style={styles.secondaryText}>
              {isRetrying ? 'Checking…' : 'I turned it on — retry'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[5],
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[6],
    paddingHorizontal: Spacing[5],
    backgroundColor: Colors.white,
    alignItems: 'center',
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xl,
    color: Colors.navy,
    marginBottom: Spacing[2],
    textAlign: 'center',
  },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.text.inverse,
    opacity: 0.75,
    textAlign: 'center',
    marginBottom: Spacing[5],
  },
  btn: {
    minHeight: 44,
    width: '100%',
    borderRadius: Radius.md,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    color: Colors.white,
  },
  secondaryBtn: {
    marginTop: Spacing[3],
    paddingVertical: Spacing[2],
  },
  secondaryText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.sm,
    color: Colors.blue,
  },
});
