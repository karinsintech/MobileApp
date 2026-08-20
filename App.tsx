/**
 * Karins Fleet Mobile App — Root Entry Point
 * React Native 0.86 · TypeScript · Redux · React Navigation
 *
 * Security:
 * - Tokens stored in Keychain only
 * - Passwords NEVER stored
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
import { purgeOldExports } from './src/utils/fileExport';

// Suppress known harmless warnings in dev
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
]);

function AppWithProviders() {
  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <RootNavigator />
    </View>
  );
}


export default function App() {
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);

  // Restore session + dashboard context on cold start.
  // Create the Android FCM channel immediately so tray pushes are not dropped
  // while the post-login splash still blocks the authenticated push hook.
  useEffect(() => {
    purgeOldExports().catch(() => {
      // Cleanup failure should not block app startup
    });
  }, []);
  useEffect(() => {
    (async () => {
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
          {showLaunchSplash ? (
            <LaunchSplashScreen onDone={() => setShowLaunchSplash(false)} />
          ) : (
            <AppWithProviders />
          )}
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
