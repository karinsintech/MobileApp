/**
 * Root navigation — chooses between auth flow and main app after bootstrap.
 * Post-login splash is full-screen (reliable on APK); main shell loads after it.
 *
 * After splash, a device app-lock PIN is required before MainTabs. Fresh install,
 * reinstall (local storage wiped), or PIN removed all land on mandatory Set PIN;
 * subsequent logins on the same install skip it when the hash is already present.
 *
 * Navigators must be imported eagerly. React.lazy splits MainTabs into a second
 * Metro bundle, which can load a second React copy and crash with
 * "Invalid hook call" inside FrameSizeProvider / native-stack.
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAppDispatch, useAppSelector } from '../store';
import { dismissPostLoginSplash, syncDefaultCustomerSession } from '../store/slices/authSlice';
import { fetchAccessMenus } from '../store/slices/roleSlice';
import { Colors } from '../theme';
import { AuthStack } from './AuthStack';
import { linking } from './linking';
import { PostLoginSplashScreen } from '../features/splash/PostLoginSplashScreen';
import { usePushNotifications } from '../features/notifications/hooks/usePushNotifications';
import BroadcastNotificationPopupHost from '../features/notifications/components/BroadcastNotificationPopupHost';
import BroadcastArrivalToast from '../features/notifications/components/BroadcastArrivalToast';
import {
  flushPendingNotificationNavigation,
  navigationRef,
} from '../services/notifications/notificationNavigation';
import {
  hasAppLockPin,
  subscribeAppLockPinChange,
} from '../services/auth/appLockPinService';
import { SetAppLockPinForm } from '../features/profile/screens/SetAppLockPinScreen';
import MainTabs from './MainTabs';

export function RootNavigator() {
  const dispatch = useAppDispatch();
  const {
    isAuthenticated,
    isBootstrapping,
    showPostLoginSplash,
    user,
  } = useAppSelector((state) => state.auth);

  // Local MMKV hash — wiped on uninstall/reinstall; survives normal logout.
  // Default false until MMKV is ready; App.tsx gates mount after initEncryptedMmkv.
  const [appLockPinReady, setAppLockPinReady] = useState(false);

  const canRegisterPush = isAuthenticated && !isBootstrapping;
  // Defer push registration until the main shell is mounted — Notifee permission
  // needs PermissionAwareActivity and fails during post-login splash on OEM phones.
  // Also wait until app-lock PIN exists so push is not registered on the set-PIN gate.
  const needsAppLockSetup = isAuthenticated && !appLockPinReady;
  const sessionReady =
    canRegisterPush && !showPostLoginSplash && !needsAppLockSetup;

  usePushNotifications(sessionReady);

  const showPostLoginSplashScreen = isAuthenticated && showPostLoginSplash;

  // Re-sync when auth flips (login / restore) and whenever PIN is set or cleared.
  useEffect(() => {
    setAppLockPinReady(hasAppLockPin());
    return subscribeAppLockPinChange(() => {
      setAppLockPinReady(hasAppLockPin());
    });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!sessionReady) return;
    dispatch(syncDefaultCustomerSession());
  }, [dispatch, sessionReady]);

  // Load the same accessMenusPortal privileges the web SideNav uses.
  // Re-fetch when user/role changes (e.g. after customer switch refresh).
  useEffect(() => {
    if (!sessionReady || !user?.userId || user.roleId == null) return;
    dispatch(fetchAccessMenus({ userId: user.userId, roleId: user.roleId }));
  }, [dispatch, sessionReady, user?.userId, user?.roleId]);

  useEffect(() => {
    if (!sessionReady) return;
    // Tray tap during splash/bootstrap — open Notifications once the main shell is up.
    flushPendingNotificationNavigation();
  }, [sessionReady]);

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  if (showPostLoginSplashScreen) {
    return (
      <PostLoginSplashScreen
        customerName={user?.customerName}
        onDone={() => dispatch(dismissPostLoginSplash())}
      />
    );
  }

  // Install / reinstall / no PIN yet — block the shell until a device app-lock PIN exists.
  // Must sit inside NavigationContainer: ScreenHeader calls useNavigation even with showBack=false.
  if (needsAppLockSetup) {
    return (
      <NavigationContainer>
        <SetAppLockPinForm mandatory />
      </NavigationContainer>
    );
  }

  const navKey = isAuthenticated ? 'app-main' : 'auth';

  return (
    <NavigationContainer
      key={navKey}
      ref={navigationRef}
      linking={sessionReady ? linking : undefined}
      onReady={() => {
        // Cold-start tray tap may have queued before the navigator mounted.
        if (sessionReady) flushPendingNotificationNavigation();
      }}
    >
      {!isAuthenticated ? <AuthStack /> : <MainTabs />}
      {/* Web-parity: summary toast + detail popup for admin broadcasts. */}
      {sessionReady ? (
        <>
          <BroadcastArrivalToast />
          <BroadcastNotificationPopupHost />
        </>
      ) : null}
    </NavigationContainer>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.yellow} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.navy,
  },
});
