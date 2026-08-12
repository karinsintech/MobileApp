/**
 * Root navigation — chooses between auth flow and main app after bootstrap.
 * Post-login splash is full-screen (reliable on APK); main shell loads after it.
 *
 * Navigators must be imported eagerly. React.lazy splits MainTabs into a second
 * Metro bundle, which can load a second React copy and crash with
 * "Invalid hook call" inside FrameSizeProvider / native-stack.
 */

import React, { useEffect } from 'react';
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
import MainTabs from './MainTabs';

export function RootNavigator() {
  const dispatch = useAppDispatch();
  const {
    isAuthenticated,
    isBootstrapping,
    showPostLoginSplash,
    user,
  } = useAppSelector((state) => state.auth);

  const canRegisterPush = isAuthenticated && !isBootstrapping;
  // Defer push registration until the main shell is mounted — Notifee permission
  // needs PermissionAwareActivity and fails during post-login splash on OEM phones.
  const sessionReady = canRegisterPush && !showPostLoginSplash;

  usePushNotifications(sessionReady);

  const showPostLoginSplashScreen = isAuthenticated && showPostLoginSplash;

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
