/**
 * Karins Fleet Mobile App — Root Entry Point
 * React Native 0.86 · TypeScript · Redux · React Navigation
 *
 * Security (MASVS-AUTH / STORAGE / RESILIENCE):
 * - Access token in Keychain (AFTER_FIRST_UNLOCK) — never MMKV
 * - Passwords never stored on device
 * - MMKV encrypted with a per-install Keychain key
 * - Session privacy: opaque cover on inactive, idle timeout, biometry re-entry
 * - Android FLAG_SECURE blocks screenshots / Recents thumbnails
 * - BLOCK_ON_ROOT (jail-monkey) runs before restoreSession
 */

import React, { useEffect, useState } from 'react';
import { View, LogBox } from 'react-native';
import { Provider } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SystemBars } from 'react-native-edge-to-edge';
import { store } from './src/store';
import {
  restoreSession,
  restoreDashboardContext,
} from './src/store/slices/authSlice';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LaunchSplashScreen } from './src/features/splash/LaunchSplashScreen';
import { OfflineBanner } from './src/components/common/OfflineBanner';
import { SessionPrivacyGate } from './src/features/session/SessionPrivacyGate';
import { CompromisedDeviceScreen } from './src/features/security/CompromisedDeviceScreen';
import { purgeOldExports } from './src/utils/fileExport';
import { BLOCK_ON_ROOT } from './src/config/env';

// Suppress known harmless warnings in dev
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
]);

function AppWithProviders() {
  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <RootNavigator />
      <SessionPrivacyGate />
    </View>
  );
}


export default function App() {
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);
  const [integrityBlocked, setIntegrityBlocked] = useState(false);
  const [integrityReasons, setIntegrityReasons] = useState<string[]>([]);

  useEffect(() => {
    purgeOldExports().catch(() => {
      // Cleanup failure should not block app startup
    });
  }, []);

  useEffect(() => {
    (async () => {
      // Integrity first — never rehydrate a Keychain session on a compromised device.
      if (BLOCK_ON_ROOT) {
        const { assessDeviceIntegrity } = await import(
          './src/services/security/deviceIntegrity'
        );
        const report = await assessDeviceIntegrity();
        if (report.isCompromised) {
          setIntegrityReasons(report.reasons);
          setIntegrityBlocked(true);
          return;
        }
      }

      const { initEncryptedMmkv } = await import('./src/services/storage/encryptedMmkv');
      await initEncryptedMmkv();
      const { pushService } = await import('./src/services/notifications/pushService');
      await pushService.ensureAndroidChannel();
      await store.dispatch(restoreSession());
      store.dispatch(restoreDashboardContext());
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Provider store={store}>
          {/*
            SystemBars replaces RN StatusBar — avoids Window.setStatusBarColor /
            backgroundColor props that Play flags as deprecated on Android 15+.
            "light" = light icons on our navy UI.
          */}
          <SystemBars style="light" />
          {integrityBlocked ? (
            <CompromisedDeviceScreen reasons={integrityReasons} />
          ) : showLaunchSplash ? (
            <LaunchSplashScreen onDone={() => setShowLaunchSplash(false)} />
          ) : (
            <AppWithProviders />
          )}
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
