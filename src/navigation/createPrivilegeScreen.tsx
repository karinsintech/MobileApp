/**
 * Wraps a stack screen so Role Management restrictions still apply when the
 * user reaches it via deep link or a stale tab (menu hide alone is not enough).
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LiquidBackground } from '../components/common/LiquidBackground';
import { Colors, FontSize, Spacing } from '../theme';
import { UnauthorizedScreen } from '../components/common/UnauthorizedScreen';
import { useAppSelector } from '../store';
import { useHasAccess } from '../hooks/useHasAccess';
import type { PrivilegeId } from '../types/accessMenus';

export function createPrivilegeScreen(
  Screen: React.ComponentType<any>,
  privilegeIds: PrivilegeId | PrivilegeId[],
  message = 'Your role does not have access to this feature.',
) {
  function PrivilegeGuardedScreen(props: any) {
    const privilegesLoaded = useAppSelector((s) => s.role.privilegesLoaded);
    const isLoading = useAppSelector((s) => s.role.isLoading);
    const allowed = useHasAccess(privilegeIds);
    if (!privilegesLoaded && isLoading) {
      return (
        <LiquidBackground>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.yellow} />
            <Text style={styles.loadingText}>Checking access...</Text>
          </View>
        </LiquidBackground>
      );
    }
    if (!allowed) {
      return <UnauthorizedScreen message={message} />;
    }
    return <Screen {...props} />;
  }

  const screenName = Screen.displayName || Screen.name || 'Screen';
  PrivilegeGuardedScreen.displayName = `PrivilegeGate(${screenName})`;
  return PrivilegeGuardedScreen;
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[5],
  },
  loadingText: {
    marginTop: Spacing[3],
    fontSize: FontSize.base,
    color: Colors.white,
    textAlign: 'center',
  },
});
