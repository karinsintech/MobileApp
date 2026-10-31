/**
 * Session privacy gate — opaque cover on AppState inactive/background, plus
 * 30-minute idle logout to the Login screen (MM-01).
 *
 * After idle timeout the user is soft-signed-out so Login can offer password,
 * account PIN, or Fingerprint. Unlock overlays are no longer used here.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../store';
import { signOutIdle } from '../../store/slices/authSlice';
import { Colors, FontFamily, FontSize, Spacing } from '../../theme';
import {
  SESSION_IDLE_TIMEOUT_MS,
  clearSessionLeftAt,
  getSessionLeftAt,
  hasSessionIdleTimedOut,
  markSessionLeftAt,
} from '../../services/session/sessionPrivacy';

export function SessionPrivacyGate() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  // Post-login emotional splash is a full-screen sibling — covering it with the
  // privacy navy sheet looks like a blank black screen right after sign-in.
  const showPostLoginSplash = useAppSelector((s) => s.auth.showPostLoginSplash);
  const [isCovered, setIsCovered] = useState(false);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isLoggingOutRef = useRef(false);

  const runIdleLogout = () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    setIsCovered(false);
    void dispatch(signOutIdle()).finally(() => {
      isLoggingOutRef.current = false;
    });
  };

  // Cold start while still "authenticated": if idle already elapsed, go to Login.
  useEffect(() => {
    if (!isAuthenticated) {
      setIsCovered(false);
      isLoggingOutRef.current = false;
      return;
    }

    if (hasSessionIdleTimedOut()) {
      runIdleLogout();
      return;
    }

    clearSessionLeftAt();
    setIsCovered(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check when auth flips
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const onChange = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      // Snapshot privacy cover only — does not start an unlock challenge.
      if (next === 'inactive' || next === 'background') {
        if (prev === 'active' && !isLoggingOutRef.current) {
          markSessionLeftAt(Date.now());
        }
        setIsCovered(true);
        return;
      }

      if (next !== 'active') return;

      if (isLoggingOutRef.current) {
        setIsCovered(false);
        return;
      }

      const leftAt = getSessionLeftAt();
      const awayMs = leftAt == null ? 0 : Date.now() - leftAt;
      const timedOut = awayMs >= SESSION_IDLE_TIMEOUT_MS;

      if (timedOut) {
        // 30 minutes away → Login (password / PIN / Fingerprint).
        runIdleLogout();
      } else {
        clearSessionLeftAt();
        setIsCovered(false);
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, dispatch]);

  if (!isAuthenticated || !isCovered || showPostLoginSplash) return null;

  return (
    <View
      style={styles.cover}
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLabel="Session privacy cover"
    >
      <View style={[styles.inner, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.brandKarins}>Karins</Text>
        <Text style={styles.brandFleet}>fleet</Text>
        <Text style={styles.subtitle}>Securing your session</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.navy,
    zIndex: 9999,
    elevation: 9999,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[6],
  },
  brandKarins: {
    fontFamily: FontFamily.logo,
    fontSize: 40,
    color: Colors.white,
    letterSpacing: -0.3,
  },
  brandFleet: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.white,
    marginTop: 4,
    marginBottom: Spacing[3],
  },
  subtitle: {
    fontSize: FontSize.base,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
});
