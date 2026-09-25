/**
 * Centered popup when Location is off or denied.
 * Does not gate-mount the app — only blocks interaction until Location is on.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  AppState,
} from 'react-native';
import {
  getClientGeoCoords,
  isDeviceLocationEnabled,
  openDeviceLocationSettings,
} from '../../utils/getClientGeoCoords';
import { Colors, FontFamily, FontSize, Spacing, Radius } from '../../theme';

export function LocationRequiredPopup() {
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(true);

  const checkLocation = useCallback(async () => {
    setChecking(true);
    try {
      const locationOn = await isDeviceLocationEnabled();
      if (!locationOn) {
        setVisible(true);
        return;
      }
      const coords = await getClientGeoCoords(12_000);
      // Keep popup until a real fix exists — login/API require lat/lng
      setVisible(!coords);
    } catch {
      setVisible(true);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkLocation();
  }, [checkLocation]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void checkLocation();
    });
    return () => sub.remove();
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
          {checking ? (
            <ActivityIndicator color={Colors.blue} style={styles.spinner} />
          ) : (
            <>
              <TouchableOpacity
                style={styles.btn}
                onPress={openDeviceLocationSettings}
                activeOpacity={0.85}
              >
                <Text style={styles.btnText}>Open settings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => void checkLocation()}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryText}>I turned it on — retry</Text>
              </TouchableOpacity>
            </>
          )}
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
  spinner: {
    marginTop: Spacing[2],
  },
});
