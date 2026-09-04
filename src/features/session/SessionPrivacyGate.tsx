/**
 * Session privacy gate — opaque cover on AppState inactive/background plus
 * biometric / app-lock PIN re-entry only after idle timeout (MM-01).
 *
 * Mounted only while authenticated so login screens stay usable.
 * After idle, fingerprint is prompted automatically (no intermediate Unlock
 * screen). Sign in offers App lock (PIN pad) and Password (same device-local
 * app-lock PIN — never the account PIN, phone passcode, or login password).
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
  Alert,
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
import { PinEntryModal } from '../profile/components/PinEntryModal';

type UnlockMethod = 'biometric' | 'password';

export function SessionPrivacyGate() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const [isCovered, setIsCovered] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [biometryAvailable, setBiometryAvailable] = useState(false);
  const [unlockMethod, setUnlockMethod] = useState<UnlockMethod>('biometric');

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPasswordUnlocking, setIsPasswordUnlocking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);

  const [showAppLockPin, setShowAppLockPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isPinUnlocking, setIsPinUnlocking] = useState(false);

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
      setPassword('');
      setPasswordError(null);
      setUnlockMethod('biometric');
      setShowAppLockPin(false);
      setPinError(null);
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

  // Prefer fingerprint when enrolled; otherwise land on app-lock password entry.
  useEffect(() => {
    if (!isAuthenticated || !needsUnlock) return;

    let cancelled = false;
    void (async () => {
      const biometry = await isDeviceBiometryAvailable();
      if (cancelled) return;
      setBiometryAvailable(biometry);
      setUnlockMethod(biometry ? 'biometric' : 'password');
      setPassword('');
      setPasswordError(null);
      setShowPassword(false);
      setShowAppLockPin(false);
      setPinError(null);
      // New lock session — allow one automatic fingerprint sheet.
      hasAutoPromptedRef.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, needsUnlock]);

  useEffect(() => {
    if (needsUnlock && unlockMethod === 'password') {
      const t = setTimeout(() => passwordInputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [needsUnlock, unlockMethod]);

  const clearLock = useCallback(() => {
    clearSessionLeftAt();
    needsUnlockRef.current = false;
    hasAutoPromptedRef.current = false;
    setNeedsUnlock(false);
    setIsCovered(false);
    setUnlockError(null);
    setPassword('');
    setPasswordError(null);
    setShowAppLockPin(false);
    setPinError(null);
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
      } else if (result.reason === 'no_biometry' || result.reason === 'fallback_unavailable') {
        // No usable fingerprint — fall through to app-lock password.
        setBiometryAvailable(false);
        setUnlockMethod('password');
      } else if (result.reason !== 'cancelled') {
        setUnlockError('Authentication failed. Try Sign in for App lock or password.');
      }
    } finally {
      isUnlockingRef.current = false;
      setIsUnlocking(false);
    }
  }, [clearLock]);

  // Idle lock → show the OS fingerprint sheet immediately (no Unlock tap).
  useEffect(() => {
    if (!needsUnlock || !biometryAvailable || unlockMethod !== 'biometric') return;
    if (hasAutoPromptedRef.current || isUnlockingRef.current) return;
    hasAutoPromptedRef.current = true;
    void tryUnlock();
  }, [needsUnlock, biometryAvailable, unlockMethod, tryUnlock]);

  /** Unlocks with the device app-lock PIN — never account PIN or phone password. */
  const verifyAppLockPin = useCallback(
    (pin: string): boolean => {
      if (!hasAppLockPin()) {
        const msg = 'No app lock PIN set. Set one in Profile → Security.';
        setPasswordError(msg);
        setPinError(msg);
        return false;
      }
      const result = verifyDeviceAppLockPin(pin);
      if (!result.ok) {
        setPasswordError(result.message);
        setPinError(result.message);
        return false;
      }
      clearLock();
      return true;
    },
    [clearLock],
  );

  const handlePasswordUnlock = useCallback(async () => {
    setIsPasswordUnlocking(true);
    setPasswordError(null);
    try {
      const ok = verifyAppLockPin(password.trim());
      if (!ok) setPassword('');
    } finally {
      setIsPasswordUnlocking(false);
    }
  }, [password, verifyAppLockPin]);

  const handleAppLockPinSubmit = useCallback(
    (pin: string) => {
      setIsPinUnlocking(true);
      setPinError(null);
      try {
        verifyAppLockPin(pin);
      } finally {
        setIsPinUnlocking(false);
      }
    },
    [verifyAppLockPin],
  );

  const handleSignInOptions = useCallback(() => {
    if (!hasAppLockPin()) {
      Alert.alert(
        'App lock PIN required',
        'Set an app lock PIN in Profile → Security before using Sign in unlock options.',
      );
      return;
    }

    Alert.alert('Sign in', 'Choose how to unlock your session', [
      {
        text: 'App lock',
        onPress: () => {
          setPassword('');
          setPasswordError(null);
          setUnlockError(null);
          setPinError(null);
          setShowAppLockPin(true);
        },
      },
      {
        text: 'Password',
        onPress: () => {
          setUnlockMethod('password');
          setShowAppLockPin(false);
          setPassword('');
          setPasswordError(null);
          setUnlockError(null);
          setPinError(null);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

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

  const showPasswordEntry = needsUnlock && unlockMethod === 'password';
  const showBiometricCover = needsUnlock && unlockMethod === 'biometric';
  const canSubmitPassword = password.trim().length === 4 && !isPasswordUnlocking;

  return (
    <View
      style={styles.cover}
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLabel="Session locked"
    >
      <View style={[styles.inner, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
        {!needsUnlock ? (
          <>
            <Text style={styles.brandKarins}>Karins</Text>
            <Text style={styles.brandFleet}>fleet</Text>
            <Text style={styles.subtitle}>Securing your session</Text>
          </>
        ) : showPasswordEntry ? (
          <View style={styles.passwordPanel}>
            <Text style={styles.lockIcon} accessibilityLabel="App lock password">🔒</Text>
            <Text style={styles.passwordTitle}>Enter app lock password</Text>
            <Text style={styles.passwordHint}>Use your 4-digit app lock PIN</Text>
            <View style={[styles.passwordRow, passwordError ? styles.passwordRowError : null]}>
              <TextInput
                ref={passwordInputRef}
                style={styles.passwordInput}
                value={password}
                onChangeText={(value) => {
                  // App lock password is the 4-digit PIN — strip non-digits.
                  const digits = value.replace(/\D/g, '').slice(0, 4);
                  setPassword(digits);
                  setPasswordError(null);
                }}
                secureTextEntry={!showPassword}
                editable={!isPasswordUnlocking}
                placeholder="••••"
                placeholderTextColor="rgba(255,255,255,0.45)"
                keyboardType="number-pad"
                maxLength={4}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="none"
                importantForAutofill="no"
                onSubmitEditing={() => {
                  if (canSubmitPassword) void handlePasswordUnlock();
                }}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.eyeBtn}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
            {passwordError ? <Text style={styles.error}>{passwordError}</Text> : null}
            <TouchableOpacity
              style={[styles.unlockBtn, !canSubmitPassword && styles.unlockBtnDisabled]}
              onPress={() => { void handlePasswordUnlock(); }}
              disabled={!canSubmitPassword}
              activeOpacity={0.85}
            >
              {isPasswordUnlocking ? (
                <ActivityIndicator color={Colors.navy} />
              ) : (
                <Text style={styles.unlockText}>Continue</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : showBiometricCover ? (
          <>
            <Text style={styles.brandKarins}>Karins</Text>
            <Text style={styles.brandFleet}>fleet</Text>
            <Text style={styles.subtitle}>
              {isUnlocking
                ? 'Waiting for fingerprint…'
                : 'Session locked — use fingerprint or Sign in'}
            </Text>
            {/* Tap brand area to re-open the fingerprint sheet after cancel. */}
            {!isUnlocking ? (
              <TouchableOpacity
                style={styles.fingerprintRetry}
                onPress={() => { void tryUnlock(); }}
                disabled={isPasswordUnlocking || isPinUnlocking}
                activeOpacity={0.85}
              >
                <Text style={styles.fingerprintRetryText}>Use fingerprint</Text>
              </TouchableOpacity>
            ) : (
              <ActivityIndicator color={Colors.yellow} style={styles.spinner} />
            )}
            {unlockError ? <Text style={styles.error}>{unlockError}</Text> : null}
          </>
        ) : null}

        {needsUnlock ? (
          <TouchableOpacity
            style={styles.signInOptionsBtn}
            onPress={handleSignInOptions}
            disabled={isUnlocking || isPasswordUnlocking || isPinUnlocking}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          >
            <Text style={styles.signInOptionsText}>Sign in</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <PinEntryModal
        visible={showAppLockPin}
        title="App lock"
        subtitle="Enter your 4-digit app lock PIN"
        error={pinError}
        isLoading={isPinUnlocking}
        onCancel={() => {
          setShowAppLockPin(false);
          setPinError(null);
        }}
        onSubmit={handleAppLockPinSubmit}
      />
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
    marginBottom: Spacing[4],
  },
  subtitle: {
    fontSize: FontSize.base,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: Spacing[6],
  },
  spinner: {
    marginBottom: Spacing[4],
  },
  fingerprintRetry: {
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[2],
  },
  fingerprintRetryText: {
    fontSize: FontSize.base,
    fontWeight: '600',
    color: Colors.yellow,
  },
  passwordPanel: {
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 36,
    marginBottom: Spacing[4],
  },
  passwordTitle: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: Spacing[2],
    textAlign: 'center',
  },
  passwordHint: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: Spacing[4],
  },
  passwordRow: {
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
  passwordRowError: {
    borderColor: Colors.dangerLight,
  },
  passwordInput: {
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
  signInOptionsBtn: {
    marginTop: Spacing[8],
    paddingVertical: Spacing[2],
  },
  signInOptionsText: {
    fontSize: FontSize.base,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  error: {
    marginTop: Spacing[2],
    marginBottom: Spacing[2],
    color: Colors.dangerLight,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
