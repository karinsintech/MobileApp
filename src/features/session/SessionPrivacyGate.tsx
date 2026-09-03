/**
 * Session privacy gate — opaque cover on AppState inactive/background plus
 * biometric/PIN re-entry only after idle timeout (MM-01).
 *
 * Mounted only while authenticated so login screens stay usable.
 * Fingerprint is never requested on open/sign-in — only after idle + Unlock tap.
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
  clearSessionLeftAt,
  getSessionLeftAt,
  hasSessionIdleTimedOut,
  isDeviceBiometryAvailable,
  markSessionLeftAt,
} from '../../services/session/sessionPrivacy';
import { SecureStorage } from '../../services/storage/SecureStorage';
import { userApi } from '../../services/api/userApi';
import {
  assertPinAttemptAllowed,
  clearPinAttempts,
  getPinLockRemainingMs,
  recordPinFailure,
} from '../../services/auth/pinAttemptGuard';
import { PinEntryModal } from '../profile/components/PinEntryModal';

export function SessionPrivacyGate() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const [isCovered, setIsCovered] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  // When biometry is enrolled, offer account PIN as an alternate unlock path.
  const [showPinOption, setShowPinOption] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinModalError, setPinModalError] = useState<string | null>(null);
  const [isPinUnlocking, setIsPinUnlocking] = useState(false);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // Refs keep AppState handler from clearing a lock when the biometric sheet
  // briefly flips the app to inactive.
  const needsUnlockRef = useRef(false);
  const isUnlockingRef = useRef(false);

  useEffect(() => {
    needsUnlockRef.current = needsUnlock;
  }, [needsUnlock]);

  useEffect(() => {
    isUnlockingRef.current = isUnlocking;
  }, [isUnlocking]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsCovered(false);
      setNeedsUnlock(false);
      needsUnlockRef.current = false;
      setUnlockError(null);
      setShowPinOption(false);
      setShowPinModal(false);
      setPinModalError(null);
      return;
    }

    // Cold start while already signed in: lock only if idle already elapsed.
    // Fresh login clears left-at in persistSession, so this never fires on sign-in.
    if (hasSessionIdleTimedOut()) {
      needsUnlockRef.current = true;
      setNeedsUnlock(true);
      setIsCovered(true);
    } else {
      needsUnlockRef.current = false;
      setNeedsUnlock(false);
      setIsCovered(false);
    }
  }, [isAuthenticated]);

  // Resolve whether to surface "Use PIN" once the lock screen is required.
  useEffect(() => {
    if (!isAuthenticated || !needsUnlock) {
      setShowPinOption(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const biometry = await isDeviceBiometryAvailable();
      const pinReady =
        SecureStorage.isPinLoginEnabled() && SecureStorage.hasPinLoginIdentity();
      if (!cancelled) {
        setShowPinOption(biometry && pinReady);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, needsUnlock]);

  const clearLock = useCallback(() => {
    clearSessionLeftAt();
    needsUnlockRef.current = false;
    setNeedsUnlock(false);
    setIsCovered(false);
    setUnlockError(null);
    setShowPinModal(false);
    setPinModalError(null);
  }, []);

  const tryUnlock = useCallback(async () => {
    if (isUnlockingRef.current) return;
    isUnlockingRef.current = true;
    setIsUnlocking(true);
    setUnlockError(null);
    try {
      const result = await authenticateSessionUnlock();
      if (result.ok) {
        clearLock();
      } else if (result.reason !== 'cancelled') {
        setUnlockError('Authentication failed. Try again.');
      }
    } finally {
      isUnlockingRef.current = false;
      setIsUnlocking(false);
    }
  }, [clearLock]);

  const handleOpenPinUnlock = useCallback(() => {
    setUnlockError(null);
    setPinModalError(null);
    const mobile = SecureStorage.getLastLoginMobile()?.trim() ?? '';
    const lockError = mobile ? assertPinAttemptAllowed(mobile) : null;
    if (lockError) setPinModalError(lockError);
    setShowPinModal(true);
  }, []);

  const handlePinUnlock = useCallback(async (pin: string) => {
    const mobile = SecureStorage.getLastLoginMobile()?.trim() ?? 'session';
    const lockError = assertPinAttemptAllowed(mobile);
    if (lockError) {
      setPinModalError(lockError);
      return;
    }

    setIsPinUnlocking(true);
    setPinModalError(null);
    try {
      const { data } = await userApi.verifyPin({ pin });
      if (!data?.isVerified) {
        setPinModalError(recordPinFailure(mobile));
        return;
      }
      clearPinAttempts(mobile);
      clearLock();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Incorrect PIN.';
      if (/pin|incorrect|invalid|unauthorized|403|401/i.test(message)) {
        setPinModalError(recordPinFailure(mobile));
      } else {
        setPinModalError(message);
      }
    } finally {
      setIsPinUnlocking(false);
    }
  }, [clearLock]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const onChange = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      // Snapshot privacy cover only — does not start an unlock challenge.
      if (next === 'inactive' || next === 'background') {
        // Skip re-stamping while already locked or while the biometric sheet is up;
        // those flips would otherwise reset the idle clock / clear the lock.
        if (prev === 'active' && !needsUnlockRef.current && !isUnlockingRef.current) {
          const now = Date.now();
          markSessionLeftAt(now);
        }
        setIsCovered(true);
        setUnlockError(null);
        return;
      }

      if (next !== 'active') return;

      // Stay locked until Unlock / PIN succeeds — ignore prompt-related resumes.
      if (needsUnlockRef.current) {
        setIsCovered(true);
        return;
      }

      const leftAt = getSessionLeftAt();
      const awayMs = leftAt == null ? 0 : Date.now() - leftAt;
      const timedOut = awayMs >= SESSION_IDLE_TIMEOUT_MS;

      if (timedOut) {
        needsUnlockRef.current = true;
        setNeedsUnlock(true);
        setIsCovered(true);
      } else {
        clearSessionLeftAt();
        setNeedsUnlock(false);
        setIsCovered(false);
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [isAuthenticated]);

  if (!isAuthenticated || !isCovered) return null;

  const pinScope = SecureStorage.getLastLoginMobile()?.trim() ?? '';
  const pinLocked = pinScope ? getPinLockRemainingMs(pinScope) > 0 : false;

  return (
    <>
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
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.unlockBtn, isUnlocking && styles.unlockBtnDisabled]}
                onPress={() => { void tryUnlock(); }}
                disabled={isUnlocking || isPinUnlocking}
                activeOpacity={0.85}
              >
                {isUnlocking ? (
                  <ActivityIndicator color={Colors.navy} />
                ) : (
                  <Text style={styles.unlockText}>Unlock</Text>
                )}
              </TouchableOpacity>

              {showPinOption ? (
                <TouchableOpacity
                  style={[styles.pinBtn, (isUnlocking || isPinUnlocking) && styles.unlockBtnDisabled]}
                  onPress={handleOpenPinUnlock}
                  disabled={isUnlocking || isPinUnlocking}
                  activeOpacity={0.85}
                >
                  <Text style={styles.pinText}>Use PIN</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {unlockError ? <Text style={styles.error}>{unlockError}</Text> : null}
        </View>
      </View>

      <PinEntryModal
        visible={showPinModal}
        title="Unlock with PIN"
        subtitle="Enter your 4-digit account PIN to continue"
        error={pinModalError}
        isLoading={isPinUnlocking}
        locked={pinLocked}
        onCancel={() => {
          setShowPinModal(false);
          setPinModalError(null);
        }}
        onSubmit={(pin) => { void handlePinUnlock(pin); }}
      />
    </>
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
    marginBottom: Spacing[4],
  },
  subtitle: {
    fontSize: FontSize.base,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: Spacing[6],
  },
  actions: {
    width: '100%',
    maxWidth: 280,
    gap: Spacing[3],
    alignItems: 'center',
  },
  unlockBtn: {
    backgroundColor: Colors.yellow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[8],
    paddingVertical: Spacing[4],
    minWidth: 160,
    width: '100%',
    alignItems: 'center',
  },
  unlockBtnDisabled: { opacity: 0.65 },
  unlockText: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.navy,
  },
  pinBtn: {
    borderWidth: 1.5,
    borderColor: Colors.glass.borderStrong,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[8],
    paddingVertical: Spacing[4],
    minWidth: 160,
    width: '100%',
    alignItems: 'center',
    backgroundColor: Colors.glass.bg,
  },
  pinText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.white,
  },
  error: {
    marginTop: Spacing[4],
    color: Colors.dangerLight,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
