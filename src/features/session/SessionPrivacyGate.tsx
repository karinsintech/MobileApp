/**
 * Session privacy gate — opaque cover on AppState inactive/background plus
 * biometric / app-lock PIN re-entry only after idle timeout (MM-01).
 *
 * Mounted only while authenticated so login screens stay usable.
 * Unlock options (fingerprint, PIN, password) are shown together on one
 * screen — no nested "Sign in" alert. PIN and password both verify the
 * device-local app-lock PIN (never account PIN or phone passcode).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  StyleSheet,
  Text,
  TextInput,
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
import {
  hasAppLockPin,
  verifyAppLockPin as verifyDeviceAppLockPin,
} from '../../services/auth/appLockPinService';

/** Which inline entry field is focused — PIN = dots pad style, Password = visible digits. */
type PinEntryMode = 'pin' | 'password';

export function SessionPrivacyGate() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const [isCovered, setIsCovered] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [biometryAvailable, setBiometryAvailable] = useState(false);
  const [pinAvailable, setPinAvailable] = useState(false);

  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isPinUnlocking, setIsPinUnlocking] = useState(false);
  const [entryMode, setEntryMode] = useState<PinEntryMode>('pin');
  const [showPasswordDigits, setShowPasswordDigits] = useState(false);
  const pinInputRef = useRef<TextInput>(null);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // Refs keep AppState handler from clearing a lock when the biometric sheet
  // briefly flips the app to inactive.
  const needsUnlockRef = useRef(false);
  const isUnlockingRef = useRef(false);
  // One auto fingerprint prompt per idle lock — cancel must not loop forever.
  const hasAutoPromptedRef = useRef(false);

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
      hasAutoPromptedRef.current = false;
      setUnlockError(null);
      setPin('');
      setPinError(null);
      setEntryMode('pin');
      setShowPasswordDigits(false);
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

  // Resolve which unlock methods exist for this device / install.
  useEffect(() => {
    if (!isAuthenticated || !needsUnlock) return;

    let cancelled = false;
    void (async () => {
      const biometry = await isDeviceBiometryAvailable();
      if (cancelled) return;
      setBiometryAvailable(biometry);
      setPinAvailable(hasAppLockPin());
      setPin('');
      setPinError(null);
      setUnlockError(null);
      setEntryMode('pin');
      setShowPasswordDigits(false);
      // New lock session — allow one automatic fingerprint sheet.
      hasAutoPromptedRef.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, needsUnlock]);

  useEffect(() => {
    if (!needsUnlock || !pinAvailable) return;
    const t = setTimeout(() => pinInputRef.current?.focus(), 280);
    return () => clearTimeout(t);
  }, [needsUnlock, pinAvailable, entryMode]);

  const clearLock = useCallback(() => {
    clearSessionLeftAt();
    needsUnlockRef.current = false;
    hasAutoPromptedRef.current = false;
    setNeedsUnlock(false);
    setIsCovered(false);
    setUnlockError(null);
    setPin('');
    setPinError(null);
  }, []);

  const tryFingerprint = useCallback(async () => {
    if (isUnlockingRef.current) return;
    isUnlockingRef.current = true;
    setIsUnlocking(true);
    setUnlockError(null);
    try {
      const result = await authenticateSessionUnlock();
      if (result.ok) {
        clearLock();
      } else if (result.reason === 'no_biometry' || result.reason === 'fallback_unavailable') {
        setBiometryAvailable(false);
        setUnlockError('Fingerprint unavailable. Use PIN or password below.');
      } else if (result.reason !== 'cancelled') {
        setUnlockError('Fingerprint failed. Try again or use PIN / password.');
      }
    } finally {
      isUnlockingRef.current = false;
      setIsUnlocking(false);
    }
  }, [clearLock]);

  // Idle lock → auto-open fingerprint once when available (PIN stays visible underneath).
  useEffect(() => {
    if (!needsUnlock || !biometryAvailable) return;
    if (hasAutoPromptedRef.current || isUnlockingRef.current) return;
    hasAutoPromptedRef.current = true;
    void tryFingerprint();
  }, [needsUnlock, biometryAvailable, tryFingerprint]);

  /** Unlocks with the device app-lock PIN — never account PIN or phone password. */
  const submitAppLockPin = useCallback(
    (value: string) => {
      if (!hasAppLockPin()) {
        setPinError('No app lock PIN set. Set one in Profile → Security.');
        return;
      }
      setIsPinUnlocking(true);
      setPinError(null);
      try {
        const result = verifyDeviceAppLockPin(value);
        if (!result.ok) {
          setPinError(result.message);
          setPin('');
          return;
        }
        clearLock();
      } finally {
        setIsPinUnlocking(false);
      }
    },
    [clearLock],
  );

  const canSubmitPin = pin.trim().length === 4 && !isPinUnlocking;

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
          markSessionLeftAt(Date.now());
        }
        setIsCovered(true);
        setUnlockError(null);
        return;
      }

      if (next !== 'active') return;

      // Stay locked until fingerprint / app-lock PIN succeeds — ignore prompt resumes.
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

  const busy = isUnlocking || isPinUnlocking;

  return (
    <View
      style={styles.cover}
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLabel="Session locked"
    >
      <View style={[styles.inner, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        {!needsUnlock ? (
          <>
            <Text style={styles.brandKarins}>Karins</Text>
            <Text style={styles.brandFleet}>fleet</Text>
            <Text style={styles.subtitle}>Securing your session</Text>
          </>
        ) : (
          <View style={styles.unlockPanel}>
            <Text style={styles.brandKarins}>Karins</Text>
            <Text style={styles.brandFleet}>fleet</Text>
            <Text style={styles.subtitle}>Session locked — unlock to continue</Text>

            {/* All unlock methods on one screen (no Sign-in alert). */}
            <View style={styles.methodRow}>
              {biometryAvailable ? (
                <TouchableOpacity
                  style={[styles.methodChip, isUnlocking && styles.methodChipActive]}
                  onPress={() => { void tryFingerprint(); }}
                  disabled={busy}
                  activeOpacity={0.85}
                  accessibilityLabel="Unlock with fingerprint"
                >
                  {isUnlocking ? (
                    <ActivityIndicator color={Colors.navy} />
                  ) : (
                    <>
                      <Text style={styles.methodIcon}>👆</Text>
                      <Text
                        style={[
                          styles.methodLabel,
                          isUnlocking && styles.methodLabelActive,
                        ]}
                      >
                        Fingerprint
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}

              {pinAvailable ? (
                <>
                  <TouchableOpacity
                    style={[styles.methodChip, entryMode === 'pin' && styles.methodChipActive]}
                    onPress={() => {
                      setEntryMode('pin');
                      setPin('');
                      setPinError(null);
                      setShowPasswordDigits(false);
                    }}
                    disabled={busy}
                    activeOpacity={0.85}
                    accessibilityLabel="Unlock with PIN"
                  >
                    <Text style={styles.methodIcon}>🔢</Text>
                    <Text
                      style={[
                        styles.methodLabel,
                        entryMode === 'pin' && styles.methodLabelActive,
                      ]}
                    >
                      PIN
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.methodChip, entryMode === 'password' && styles.methodChipActive]}
                    onPress={() => {
                      setEntryMode('password');
                      setPin('');
                      setPinError(null);
                    }}
                    disabled={busy}
                    activeOpacity={0.85}
                    accessibilityLabel="Unlock with password"
                  >
                    <Text style={styles.methodIcon}>🔑</Text>
                    <Text
                      style={[
                        styles.methodLabel,
                        entryMode === 'password' && styles.methodLabelActive,
                      ]}
                    >
                      Password
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>

            {unlockError ? <Text style={styles.error}>{unlockError}</Text> : null}

            {pinAvailable ? (
              <View style={styles.pinPanel}>
                <Text style={styles.pinHint}>
                  {entryMode === 'pin'
                    ? 'Enter your 4-digit app lock PIN'
                    : 'Enter your 4-digit app lock password'}
                </Text>
                <View style={[styles.pinRow, pinError ? styles.pinRowError : null]}>
                  <TextInput
                    ref={pinInputRef}
                    style={styles.pinInput}
                    value={pin}
                    onChangeText={(value) => {
                      const digits = value.replace(/\D/g, '').slice(0, 4);
                      setPin(digits);
                      setPinError(null);
                    }}
                    secureTextEntry={entryMode === 'pin' || !showPasswordDigits}
                    editable={!isPinUnlocking}
                    placeholder="••••"
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    keyboardType="number-pad"
                    maxLength={4}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="none"
                    importantForAutofill="no"
                    onSubmitEditing={() => {
                      if (canSubmitPin) submitAppLockPin(pin.trim());
                    }}
                  />
                  {entryMode === 'password' ? (
                    <TouchableOpacity
                      onPress={() => setShowPasswordDigits((v) => !v)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.eyeBtn}
                    >
                      <Text style={styles.eyeIcon}>{showPasswordDigits ? '🙈' : '👁'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {pinError ? <Text style={styles.error}>{pinError}</Text> : null}
                <TouchableOpacity
                  style={[styles.unlockBtn, !canSubmitPin && styles.unlockBtnDisabled]}
                  onPress={() => submitAppLockPin(pin.trim())}
                  disabled={!canSubmitPin}
                  activeOpacity={0.85}
                >
                  {isPinUnlocking ? (
                    <ActivityIndicator color={Colors.navy} />
                  ) : (
                    <Text style={styles.unlockText}>Unlock</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.noPinHint}>
                {biometryAvailable
                  ? 'Use fingerprint above, or set an app lock PIN in Profile → Security.'
                  : 'Set an app lock PIN in Profile → Security to unlock after idle.'}
              </Text>
            )}
          </View>
        )}
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
  unlockPanel: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
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
    marginBottom: Spacing[5],
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing[2],
    marginBottom: Spacing[4],
    width: '100%',
  },
  methodChip: {
    minWidth: 96,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  methodChipActive: {
    borderColor: Colors.yellow,
    backgroundColor: Colors.yellow,
  },
  methodIcon: {
    fontSize: 18,
  },
  methodLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.white,
  },
  methodLabelActive: {
    color: Colors.navy,
  },
  pinPanel: {
    width: '100%',
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  pinHint: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: Spacing[3],
    textAlign: 'center',
  },
  pinRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: Radius.md,
    marginBottom: Spacing[3],
    paddingRight: Spacing[3],
  },
  pinRowError: {
    borderColor: Colors.dangerLight,
  },
  pinInput: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: '600',
    color: Colors.white,
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[4],
    letterSpacing: 8,
    textAlign: 'center',
  },
  eyeBtn: {
    padding: 4,
  },
  eyeIcon: {
    fontSize: 16,
  },
  unlockBtn: {
    backgroundColor: Colors.yellow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[8],
    paddingVertical: Spacing[4],
    minWidth: 160,
    width: '100%',
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  unlockBtnDisabled: { opacity: 0.65 },
  unlockText: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.navy,
  },
  noPinHint: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: Spacing[4],
    lineHeight: 20,
  },
  error: {
    marginTop: Spacing[2],
    marginBottom: Spacing[2],
    color: Colors.dangerLight,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
