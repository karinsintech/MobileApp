/**
 * Session privacy gate — opaque cover on AppState inactive/background plus
 * biometric re-entry after idle timeout (MM-01).
 *
 * Mounted only while authenticated so login screens stay usable.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '../../store';
import { Colors, FontFamily, FontSize, Radius, Spacing } from '../../theme';
import {
  SESSION_IDLE_TIMEOUT_MS,
  authenticateSessionUnlock,
  ensureSessionUnlockGate,
} from '../../services/session/sessionPrivacy';

export function SessionPrivacyGate() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const [isCovered, setIsCovered] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const leftAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsCovered(false);
      setNeedsUnlock(false);
      setUnlockError(null);
      leftAtRef.current = null;
      return;
    }
    void ensureSessionUnlockGate();
  }, [isAuthenticated]);

  const tryUnlock = useCallback(async () => {
    if (isUnlocking) return;
    setIsUnlocking(true);
    setUnlockError(null);
    try {
      const result = await authenticateSessionUnlock();
      if (result.ok) {
        setNeedsUnlock(false);
        setIsCovered(false);
        leftAtRef.current = null;
      } else if (result.reason !== 'cancelled') {
        setUnlockError('Authentication failed. Try again.');
      }
    } finally {
      setIsUnlocking(false);
    }
  }, [isUnlocking]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const onChange = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      // Cover immediately on inactive — iOS takes the app-switcher snapshot here,
      // before "background". Opaque navy hides wallet/UPI from Recents too.
      if (next === 'inactive' || next === 'background') {
        if (prev === 'active') {
          leftAtRef.current = Date.now();
        }
        setIsCovered(true);
        setUnlockError(null);
        return;
      }

      if (next !== 'active') return;

      const leftAt = leftAtRef.current;
      const awayMs = leftAt == null ? 0 : Date.now() - leftAt;
      const timedOut = awayMs >= SESSION_IDLE_TIMEOUT_MS;

      if (timedOut) {
        setNeedsUnlock(true);
        setIsCovered(true);
        void tryUnlock();
      } else {
        setNeedsUnlock(false);
        setIsCovered(false);
        leftAtRef.current = null;
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [isAuthenticated, tryUnlock]);

  if (!isAuthenticated || !isCovered) return null;

  return (
    <View
      style={styles.cover}
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLabel="Session locked"
    >
      <View style={[styles.inner, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.brandKarins}>Karins</Text>
        <Text style={styles.brandFleet}>fleet</Text>
        <Text style={styles.subtitle}>
          {needsUnlock
            ? 'Session locked — confirm it is you to continue'
            : 'Securing your session'}
        </Text>

        {needsUnlock ? (
          <TouchableOpacity
            style={[styles.unlockBtn, isUnlocking && styles.unlockBtnDisabled]}
            onPress={() => { void tryUnlock(); }}
            disabled={isUnlocking}
            activeOpacity={0.85}
          >
            {isUnlocking ? (
              <ActivityIndicator color={Colors.navy} />
            ) : (
              <Text style={styles.unlockText}>Unlock</Text>
            )}
          </TouchableOpacity>
        ) : null}

        {unlockError ? <Text style={styles.error}>{unlockError}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fully opaque — blur alone still leaks content into iOS snapshots.
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
    marginBottom: Spacing[4],
  },
  subtitle: {
    fontSize: FontSize.base,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: Spacing[6],
  },
  unlockBtn: {
    backgroundColor: Colors.yellow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[8],
    paddingVertical: Spacing[4],
    minWidth: 160,
    alignItems: 'center',
  },
  unlockBtnDisabled: { opacity: 0.65 },
  unlockText: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.navy,
  },
  error: {
    marginTop: Spacing[4],
    color: Colors.dangerLight,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
