/**
 * Session privacy gate — opaque cover on AppState inactive/background plus
 * biometric/password re-entry only after idle timeout (MM-01).
 *
 * Mounted only while authenticated so login screens stay usable.
 * Fingerprint is never requested on open/sign-in — only after idle + Unlock tap.
 * When biometrics are unavailable (or via Sign-in options), unlock with the
 * same mobile account password used on the login screen.
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
import { SecureStorage } from '../../services/storage/SecureStorage';
import { authApi } from '../../services/api/authApi';
import { getApiErrorMessage } from '../../services/api/client';

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
      setPassword('');
      setPasswordError(null);
      setUnlockMethod('biometric');
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

  // Prefer fingerprint when enrolled; otherwise land on password + Sign-in options.
  useEffect(() => {
    if (!isAuthenticated || !needsUnlock) return;

    let cancelled = false;
    void (async () => {
      const biometry = await isDeviceBiometryAvailable();
      if (cancelled) return;
      setBiometryAvailable(biometry);
      // No fingerprint → password screen. Fingerprint → Unlock first.
      setUnlockMethod(biometry ? 'biometric' : 'password');
      setPassword('');
      setPasswordError(null);
      setShowPassword(false);
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
    setNeedsUnlock(false);
    setIsCovered(false);
    setUnlockError(null);
    setPassword('');
    setPasswordError(null);
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

  const handlePasswordUnlock = useCallback(async () => {
    const mobile = SecureStorage.getLastLoginMobile()?.trim() ?? '';
    if (!mobile || mobile.length !== 10) {
      setPasswordError('Saved mobile number is missing. Sign in again from the login screen.');
      return;
    }
    if (!password.trim()) {
      setPasswordError('Enter your password.');
      return;
    }

    setIsPasswordUnlocking(true);
    setPasswordError(null);
    try {
      // Re-verify with the same mobile + password credentials used at login.
      const { data } = await authApi.signIn({
        username: mobile,
        password: password.trim(),
      });
      if (!data?.accessToken) {
        setPasswordError('Unable to verify password. Try again.');
        return;
      }
      await SecureStorage.setAccessToken(data.accessToken);
      clearLock();
    } catch (err: unknown) {
      setPasswordError(getApiErrorMessage(err, 'Incorrect password.'));
      setPassword('');
    } finally {
      setIsPasswordUnlocking(false);
    }
  }, [password, clearLock]);

  const handleSignInOptions = useCallback(() => {
    const buttons: Array<{
      text: string;
      style?: 'cancel' | 'default' | 'destructive';
      onPress?: () => void;
    }> = [];

    if (biometryAvailable) {
      buttons.push({
        text: 'Fingerprint',
        onPress: () => {
          setUnlockMethod('biometric');
          setPassword('');
          setPasswordError(null);
          setUnlockError(null);
        },
      });
    }
    buttons.push({
      text: 'Password',
      onPress: () => {
        setUnlockMethod('password');
        setPassword('');
        setPasswordError(null);
        setUnlockError(null);
      },
    });
    buttons.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Sign-in options', 'Choose how to unlock your session', buttons);
  }, [biometryAvailable]);

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

      // Stay locked until Unlock / password succeeds — ignore prompt-related resumes.
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
  const showBiometricUnlock = needsUnlock && unlockMethod === 'biometric';
  const canSubmitPassword = password.trim().length > 0 && !isPasswordUnlocking;
  const mobileHint = SecureStorage.getLastLoginMobile()?.trim() ?? '';

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
            <Text style={styles.lockIcon} accessibilityLabel="Password">🔒</Text>
            <Text style={styles.passwordTitle}>Enter your password</Text>
            {mobileHint ? (
              <Text style={styles.passwordHint}>+91 {mobileHint}</Text>
            ) : null}
            <View style={[styles.passwordRow, passwordError ? styles.passwordRowError : null]}>
              <TextInput
                ref={passwordInputRef}
                style={styles.passwordInput}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setPasswordError(null);
                }}
                secureTextEntry={!showPassword}
                editable={!isPasswordUnlocking}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
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
        ) : showBiometricUnlock ? (
          <>
            <Text style={styles.brandKarins}>Karins</Text>
            <Text style={styles.brandFleet}>fleet</Text>
            <Text style={styles.subtitle}>
              Session locked — confirm it is you to continue
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.unlockBtn, isUnlocking && styles.unlockBtnDisabled]}
                onPress={() => { void tryUnlock(); }}
                disabled={isUnlocking || isPasswordUnlocking}
                activeOpacity={0.85}
              >
                {isUnlocking ? (
                  <ActivityIndicator color={Colors.navy} />
                ) : (
                  <Text style={styles.unlockText}>Unlock</Text>
                )}
              </TouchableOpacity>
            </View>
            {unlockError ? <Text style={styles.error}>{unlockError}</Text> : null}
          </>
        ) : null}

        {needsUnlock ? (
          <TouchableOpacity
            style={styles.signInOptionsBtn}
            onPress={handleSignInOptions}
            disabled={isUnlocking || isPasswordUnlocking}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          >
            <Text style={styles.signInOptionsText}>Sign-in options</Text>
          </TouchableOpacity>
        ) : null}
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
